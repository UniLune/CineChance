import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { getUserCompletedWatchCount } from '@/lib/taste-map/similarity-storage';
import { NextRequest } from 'next/server';

vi.mock('@/auth');
vi.mock('@/lib/prisma', () => ({
  prisma: {
    watchList: {
      count: vi.fn(),
    },
    similarityScore: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));
vi.mock('@/lib/taste-map/similarity-storage');
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

const mockGetUserCompletedWatchCount = getUserCompletedWatchCount as ReturnType<typeof vi.fn>;
const mockGetServerSession = getServerSession as ReturnType<typeof vi.fn>;

describe('GET /api/user/similar-users', () => {
  const mockSession = { user: { id: 'current-user' } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(mockSession);
    (prisma.watchList.count as any).mockResolvedValue(10); // current user has >3
  });

  it('filters candidates by completed watch count and match threshold', async () => {
    // DB scores: three candidates with different overallMatch
    const mockDbScores = [
      { userIdA: 'current-user', userIdB: 'user1', overallMatch: '0.45', computedAt: new Date() },
      { userIdA: 'current-user', userIdB: 'user2', overallMatch: '0.35', computedAt: new Date() }, // below 40%
      { userIdA: 'current-user', userIdB: 'user3', overallMatch: '0.50', computedAt: new Date() },
    ] as any;
    (prisma.similarityScore.findMany as any).mockResolvedValue(mockDbScores);

    // Completed watch counts: user1:5, user2:10, user3:2 (<3)
    const mockCounts = new Map([
      ['user1', 5],
      ['user2', 10],
      ['user3', 2],
    ]);
    mockGetUserCompletedWatchCount.mockResolvedValue(mockCounts);

    // User info
    (prisma.user.findMany as any).mockResolvedValue([
      { id: 'user1', createdAt: new Date(), watchList: [] },
      { id: 'user2', createdAt: new Date(), watchList: [] },
      { id: 'user3', createdAt: new Date(), watchList: [] },
    ] as any);

    const request = new NextRequest('http://localhost:3000/api/user/similar-users');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Should include user1 (45%, 5 movies) and exclude user2 (35% <40%) and user3 (2 movies <3)
    expect(data.similarUsers).toHaveLength(1);
    expect(data.similarUsers[0].userId).toBe('user1');
    expect(data.similarUsers[0].overallMatch).toBeCloseTo(45, 1);
    expect(data.similarUsers[0].watchCount).toBe(5);
  });

  it('applies 40% match threshold correctly', async () => {
    const mockDbScores = [
      { userIdA: 'current-user', userIdB: 'user1', overallMatch: '0.40', computedAt: new Date() },
      { userIdA: 'current-user', userIdB: 'user2', overallMatch: '0.399', computedAt: new Date() },
    ] as any;
    (prisma.similarityScore.findMany as any).mockResolvedValue(mockDbScores);
    mockGetUserCompletedWatchCount.mockResolvedValue(new Map([['user1', 5], ['user2', 5]]));
    (prisma.user.findMany as any).mockResolvedValue([
      { id: 'user1', createdAt: new Date(), watchList: [] },
      { id: 'user2', createdAt: new Date(), watchList: [] },
    ] as any);

    const request = new NextRequest('http://localhost:3000/api/user/similar-users');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.similarUsers).toHaveLength(1);
    expect(data.similarUsers[0].userId).toBe('user1');
    expect(data.similarUsers[0].overallMatch).toBe(40);
  });

  it('applies 3 completed watch count threshold correctly', async () => {
    const mockDbScores = [
      { userIdA: 'current-user', userIdB: 'user1', overallMatch: '0.50', computedAt: new Date() },
      { userIdA: 'current-user', userIdB: 'user2', overallMatch: '0.50', computedAt: new Date() },
    ] as any;
    (prisma.similarityScore.findMany as any).mockResolvedValue(mockDbScores);
    mockGetUserCompletedWatchCount.mockResolvedValue(new Map([['user1', 3], ['user2', 2]]));
    (prisma.user.findMany as any).mockResolvedValue([
      { id: 'user1', createdAt: new Date(), watchList: [] },
      { id: 'user2', createdAt: new Date(), watchList: [] },
    ] as any);

    const request = new NextRequest('http://localhost:3000/api/user/similar-users');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.similarUsers).toHaveLength(1);
    expect(data.similarUsers[0].userId).toBe('user1');
    expect(data.similarUsers[0].watchCount).toBe(3);
  });

  it('returns empty array when all candidates are filtered out', async () => {
    const mockDbScores = [
      { userIdA: 'current-user', userIdB: 'user1', overallMatch: '0.30', computedAt: new Date() },
      { userIdA: 'current-user', userIdB: 'user2', overallMatch: '0.35', computedAt: new Date() },
    ] as any;
    (prisma.similarityScore.findMany as any).mockResolvedValue(mockDbScores);
    mockGetUserCompletedWatchCount.mockResolvedValue(new Map([['user1', 1], ['user2', 2]]));
    (prisma.user.findMany as any).mockResolvedValue([
      { id: 'user1', createdAt: new Date(), watchList: [] },
      { id: 'user2', createdAt: new Date(), watchList: [] },
    ] as any);

    const request = new NextRequest('http://localhost:3000/api/user/similar-users');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.similarUsers).toHaveLength(0);
  });
});