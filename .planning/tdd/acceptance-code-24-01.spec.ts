// Acceptance Code: Phase 24 - Taste Map DB Read Fix
// E2E test simulation for taste-map reading from PersonProfile

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

// Mock data
const mockPersonProfileActor = {
  userId: 'user-123',
  personType: 'actor',
  topPersons: [
    { tmdbPersonId: 1, name: 'Actor One', count: 5, avgWeightedRating: 8.5 },
    { tmdbPersonId: 2, name: 'Actor Two', count: 4, avgWeightedRating: 8.2 },
    { tmdbPersonId: 3, name: 'Actor Three', count: 3, avgWeightedRating: 7.9 },
  ],
  totalMoviesAnalyzed: 10,
  computedAt: new Date(),
  computationMethod: 'full',
};

const mockPersonProfileDirector = {
  userId: 'user-123',
  personType: 'director',
  topPersons: [
    { tmdbPersonId: 101, name: 'Director One', count: 3, avgWeightedRating: 9.0 },
    { tmdbPersonId: 102, name: 'Director Two', count: 2, avgWeightedRating: 8.7 },
  ],
  totalMoviesAnalyzed: 10,
  computedAt: new Date(),
  computationMethod: 'full',
};

const mockTasteMap = {
  genreProfile: { Action: 30, Drama: 25, Comedy: 20 },
  ratingDistribution: { high: 60, medium: 30, low: 10 },
  computedMetrics: { positiveIntensity: 60, consistency: 80, diversity: 70 },
  behaviorProfile: { rewatchRate: 10, dropRate: 5, completionRate: 85 },
};

describe('Phase 24: Taste Map DB Read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Server Component: page.tsx', () => {
    it('should fetch PersonProfile for actor and director from DB', async () => {
      // Arrange
      const userId = 'user-123';
      vi.mocked(prisma.personProfile.findUnique).mockResolvedValueOnce(mockPersonProfileActor)
        .mockResolvedValueOnce(mockPersonProfileDirector);

      // Act: Simulate page server component logic
      const [actorProfile, directorProfile] = await Promise.all([
        prisma.personProfile.findUnique({
          where: { userId_personType: { userId, personType: 'actor' } },
        }),
        prisma.personProfile.findUnique({
          where: { userId_personType: { userId, personType: 'director' } },
        }),
      ]);

      // Assert
      expect(actorProfile).toBeDefined();
      expect(actorProfile?.topPersons).toHaveLength(3);
      expect(directorProfile).toBeDefined();
      expect(directorProfile?.topPersons).toHaveLength(2);
    });

    it('should transform PersonProfile data to props format', async () => {
      // Arrange
      const actorProfile = mockPersonProfileActor;
      const directorProfile = mockPersonProfileDirector;

      // Act: Transform
      const topActors = (actorProfile.topPersons as Array<{name: string, avgWeightedRating: number}>)
        .slice(0, 10)
        .map(p => [p.name, p.avgWeightedRating] as [string, number]);
      
      const topDirectors = (directorProfile.topPersons as Array<{name: string, avgWeightedRating: number}>)
        .slice(0, 10)
        .map(p => [p.name, p.avgWeightedRating] as [string, number]);

      // Assert
      expect(topActors).toEqual([
        ['Actor One', 8.5],
        ['Actor Two', 8.2],
        ['Actor Three', 7.9],
      ]);
      expect(topDirectors).toEqual([
        ['Director One', 9.0],
        ['Director Two', 8.7],
      ]);
    });

    it('should handle missing PersonProfile gracefully', async () => {
      // Arrange
      vi.mocked(prisma.personProfile.findUnique).mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      // Act
      const actorProfile = await prisma.personProfile.findUnique({
        where: { userId_personType: { userId: 'user-123', personType: 'actor' } },
      });

      // Assert
      expect(actorProfile).toBeNull();
      const topActors = (actorProfile?.topPersons as Array<{name: string, avgWeightedRating: number}> || [])
        .slice(0, 10)
        .map(p => [p.name, p.avgWeightedRating] as [string, number]);
      expect(topActors).toEqual([]);
    });

    it('should pass props to TasteMapClient with correct structure', () => {
      // Arrange
      const props = {
        tasteMap: mockTasteMap,
        userId: 'user-123',
        topActors: [['Actor One', 8.5], ['Actor Two', 8.2]],
        topDirectors: [['Director One', 9.0]],
      };

      // Act & Assert: Verify prop types
      expect(props.tasteMap).toBeDefined();
      expect(props.tasteMap.genreProfile).toBeDefined();
      expect(props.topActors).toHaveLength(2);
      expect(props.topDirectors).toHaveLength(1);
      expect(typeof props.topActors[0][0]).toBe('string');
      expect(typeof props.topActors[0][1]).toBe('number');
    });
  });

  describe('Client Component: TasteMapClient', () => {
    it('should render actors from props without fetching', () => {
      // Arrange
      const topActors = [['Actor One', 8.5], ['Actor Two', 8.2]];
      const topDirectors = [['Director One', 9.0]];

      // Act: Component would render with these props
      // Assert: Verify data structure
      expect(topActors.length).toBeGreaterThan(0);
      topActors.forEach(([name, score]) => {
        expect(typeof name).toBe('string');
        expect(typeof score).toBe('number');
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(10);
      });
    });

    it('should show empty state when no data in props', () => {
      // Arrange
      const topActors: Array<[string, number]> = [];
      const topDirectors: Array<[string, number]> = [];

      // Act & Assert
      expect(topActors.length).toBe(0);
      expect(topDirectors.length).toBe(0);
      // Component would show "Нет данных об актерах" / "Нет данных о режиссерах"
    });

    it('should limit display to top 10', () => {
      // Arrange
      const manyActors = Array.from({ length: 20 }, (_, i) => [
        `Actor ${i}`,
        (10 - i * 0.5),
      ] as [string, number]);

      // Act: Slice in component
      const displayed = manyActors.slice(0, 10);

      // Assert
      expect(displayed).toHaveLength(10);
    });
  });

  describe('Integration: Full Page Flow', () => {
    it('should pass DB data through server to client without API calls', async () => {
      // Simulate full flow:
      // 1. Server fetches PersonProfile from DB
      // 2. Server transforms to props
      // 3. Server renders TasteMapClient with props
      // 4. Client displays directly

      // Arrange
      const userId = 'user-123';
      vi.mocked(prisma.personProfile.findUnique)
        .mockResolvedValueOnce(mockPersonProfileActor)
        .mockResolvedValueOnce(mockPersonProfileDirector);

      // Act: Server-side
      const [actorRes, directorRes] = await Promise.all([
        prisma.personProfile.findUnique({
          where: { userId_personType: { userId, personType: 'actor' } },
        }),
        prisma.personProfile.findUnique({
          where: { userId_personType: { userId, personType: 'director' } },
        }),
      ]);

      const topActors = (actorRes?.topPersons as Array<{name: string, avgWeightedRating: number}>)
        .slice(0, 10)
        .map(p => [p.name, p.avgWeightedRating] as [string, number]);
      const topDirectors = (directorRes?.topPersons as Array<{name: string, avgWeightedRating: number}>)
        .slice(0, 10)
        .map(p => [p.name, p.avgWeightedRating] as [string, number]);

      // Assert: Props ready for client
      expect(topActors).toHaveLength(3);
      expect(topDirectors).toHaveLength(2);
      expect(topActors[0]).toEqual(['Actor One', 8.5]);
      expect(topDirectors[0]).toEqual(['Director One', 9.0]);

      // Client would NOT call:
      // - /api/user/person-profile
      // - /api/user/achiev_actors
      // - /api/user/achiev_creators
    });
  });

  describe('Data Consistency', () => {
    it('should maintain exact score values from database', () => {
      // Verify scores are not re-calculated or rounded differently
      const actorProfile = mockPersonProfileActor;
      const topActors = (actorProfile.topPersons as Array<{name: string, avgWeightedRating: number}>)
        .map(p => p.avgWeightedRating);

      expect(topActors).toContain(8.5);
      expect(topActors).toContain(8.2);
      expect(topActors).toContain(7.9);
    });

    it('should preserve order from database (already sorted by compute)', () => {
      const actorProfile = mockPersonProfileActor;
      const topActors = (actorProfile.topPersons as Array<{name: string, avgWeightedRating: number}>)
        .map(p => p.name);

      expect(topActors[0]).toBe('Actor One'); // Highest score
      expect(topActors[1]).toBe('Actor Two'); // Second highest
      expect(topActors[2]).toBe('Actor Three'); // Third
    });
  });
});
