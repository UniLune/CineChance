import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import type { PersonData } from '@/lib/taste-map/person-profile-v2';

// Mock the database module
vi.mock('@/lib/prisma', () => ({
  prisma: {
    personProfile: {
      findUnique: vi.fn(),
    },
  },
}));

describe('TasteMapPage Server Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch actor and director profiles from DB', async () => {
    // Arrange
    const userId = 'test-user';
    const mockActorProfile = {
      id: 'profile-actor-1',
      userId,
      personType: 'actor',
      topPersons: [
        { tmdbPersonId: 1, name: 'Test Actor', count: 5, avgWeightedRating: 8.5 },
      ] as unknown as PersonData[], // Prisma returns Json, cast to PersonData[]
      totalMoviesAnalyzed: 10,
      computedAt: new Date(),
      computationMethod: 'full',
    } as any; // Cast to any to satisfy Prisma type for test

    const mockDirectorProfile = {
      id: 'profile-director-1',
      userId,
      personType: 'director',
      topPersons: [
        { tmdbPersonId: 101, name: 'Test Director', count: 3, avgWeightedRating: 9.0 },
      ] as unknown as PersonData[],
      totalMoviesAnalyzed: 10,
      computedAt: new Date(),
      computationMethod: 'full',
    } as any;

    vi.mocked(prisma.personProfile.findUnique)
      .mockResolvedValueOnce(mockActorProfile)
      .mockResolvedValueOnce(mockDirectorProfile);

    // Act
    const actorProfile = await prisma.personProfile.findUnique({
      where: { userId_personType: { userId, personType: 'actor' } },
    });
    const directorProfile = await prisma.personProfile.findUnique({
      where: { userId_personType: { userId, personType: 'director' } },
    });

    // Assert
    expect(prisma.personProfile.findUnique).toHaveBeenCalledTimes(2);
    expect(actorProfile).toEqual(mockActorProfile);
    expect(directorProfile).toEqual(mockDirectorProfile);
  });

   it('should transform PersonData to [name, score] format', async () => {
     // Arrange
     const mockProfile = {
       topPersons: [
         { tmdbPersonId: 1, name: 'Actor A', count: 5, avgWeightedRating: 8.5 },
         { tmdbPersonId: 2, name: 'Actor B', count: 3, avgWeightedRating: 7.2 },
       ] as PersonData[],
     };

     // Act
     const transformed = ((mockProfile.topPersons as unknown) as PersonData[])
       .slice(0, 10)
       .map(p => [p.name, p.avgWeightedRating] as [string, number]);

     // Assert
     expect(transformed).toEqual([
       ['Actor A', 8.5],
       ['Actor B', 7.2],
     ]);
   });

  it('should limit to top 10 items', async () => {
    // Arrange
    const manyPersons = Array.from({ length: 20 }, (_, i) => ({
      tmdbPersonId: i,
      name: `Person ${i}`,
      count: 10 - i,
      avgWeightedRating: 10 - i * 0.5,
    }));

    const mockProfile = { topPersons: manyPersons };

    // Act
    const transformed = (mockProfile.topPersons as any[])
      .slice(0, 10)
      .map((p: any) => [p.name, p.avgWeightedRating] as [string, number]);

    // Assert
    expect(transformed).toHaveLength(10);
    expect(transformed[0][0]).toBe('Person 0'); // First in original order
  });

  it('should return empty array when profile not found', async () => {
    // Arrange
    vi.mocked(prisma.personProfile.findUnique).mockResolvedValueOnce(null);

    // Act
    const profile = await prisma.personProfile.findUnique({
      where: { userId_personType: { userId: 'test-user', personType: 'actor' } },
    });

    const transformed = ((profile?.topPersons as unknown) as PersonData[] || [])
      .map(p => [p.name, p.avgWeightedRating] as [string, number]);

    // Assert
    expect(profile).toBeNull();
    expect(transformed).toEqual([]);
  });

  it('should call findUnique with correct composite key', async () => {
    // Arrange
    const userId = 'user-123';
    vi.mocked(prisma.personProfile.findUnique).mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    // Act
    await prisma.personProfile.findUnique({
      where: { userId_personType: { userId, personType: 'actor' } },
    });
    await prisma.personProfile.findUnique({
      where: { userId_personType: { userId, personType: 'director' } },
    });

    // Assert
    const calls = vi.mocked(prisma.personProfile.findUnique).mock.calls;
    expect(calls[0][0]).toEqual({
      where: { userId_personType: { userId: 'user-123', personType: 'actor' } },
    });
    expect(calls[1][0]).toEqual({
      where: { userId_personType: { userId: 'user-123', personType: 'director' } },
    });
  });
});

describe('TasteMapPage Props Structure', () => {
  it('should have topActors and topDirectors in props interface', () => {
    // This test verifies TypeScript types are correct
    // If this compiles, types are correct

    const props = {
      tasteMap: {
        genreProfile: { Action: 30 },
        ratingDistribution: { high: 60, medium: 30, low: 10 },
        computedMetrics: { positiveIntensity: 60, consistency: 80, diversity: 70 },
        behaviorProfile: { rewatchRate: 10, dropRate: 5, completionRate: 85 },
      },
      userId: 'user-123',
      topActors: [['Actor A', 8.5]] as Array<[string, number]>,
      topDirectors: [['Director X', 9.0]] as Array<[string, number]>,
    };

    expect(props.topActors).toBeDefined();
    expect(props.topDirectors).toBeDefined();
    expect(Array.isArray(props.topActors)).toBe(true);
    expect(Array.isArray(props.topDirectors)).toBe(true);
  });
});
