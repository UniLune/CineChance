import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { getUserCompletedWatchCount, getCandidateUsersForSimilarity } from '@/lib/taste-map/similarity-storage';
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
vi.mock('@/middleware/rateLimit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('@/lib/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

const mockGetUserCompletedWatchCount = getUserCompletedWatchCount as ReturnType<typeof vi.fn>;
const mockGetServerSession = getServerSession as ReturnType<typeof vi.fn>;
const mockGetCandidateUsersForSimilarity = getCandidateUsersForSimilarity as ReturnType<typeof vi.fn>;

describe('GET /api/user/similar-users', () => {
  const mockSession = { user: { id: 'current-user' } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(mockSession);
    (prisma.watchList.count as any).mockResolvedValue(10);
  });

  it('returns all database results enriched with watchCount and memberSince', async () => {
    const mockDbScores = [
      { userIdA: 'current-user', userIdB: 'user1', overallMatch: '0.45', computedAt: new Date() },
      { userIdA: 'current-user', userIdB: 'user2', overallMatch: '0.35', computedAt: new Date() },
      { userIdA: 'current-user', userIdB: 'user3', overallMatch: '0.50', computedAt: new Date() },
    ] as any;
    (prisma.similarityScore.findMany as any).mockResolvedValue(mockDbScores);

    const mockCounts = new Map([
      ['user1', 5],
      ['user2', 10],
      ['user3', 2],
    ]);
    mockGetUserCompletedWatchCount.mockResolvedValue(mockCounts);

    const user1Date = new Date('2024-01-01');
    const user2Date = new Date('2024-02-01');
    const user3Date = new Date('2024-03-01');
    (prisma.user.findMany as any).mockResolvedValue([
      { id: 'user1', createdAt: user1Date, watchList: [] },
      { id: 'user2', createdAt: user2Date, watchList: [] },
      { id: 'user3', createdAt: user3Date, watchList: [] },
    ] as any);

    const request = new NextRequest('http://localhost:3000/api/user/similar-users');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.similarUsers).toHaveLength(3);
    expect(data.similarUsers.find((u: any) => u.userId === 'user1').watchCount).toBe(5);
    expect(data.similarUsers.find((u: any) => u.userId === 'user2').watchCount).toBe(10);
    expect(data.similarUsers.find((u: any) => u.userId === 'user3').watchCount).toBe(2);
    expect(data.similarUsers.find((u: any) => u.userId === 'user1').memberSince).toEqual(user1Date.toISOString());
    expect(data.similarUsers.find((u: any) => u.userId === 'user2').memberSince).toEqual(user2Date.toISOString());
    expect(data.similarUsers.find((u: any) => u.userId === 'user3').memberSince).toEqual(user3Date.toISOString());
  });

  it('returns results sorted by overallMatch descending', async () => {
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
    expect(data.similarUsers).toHaveLength(2);
    expect(data.similarUsers[0].userId).toBe('user1');
    expect(data.similarUsers[0].overallMatch).toBe(40.0);
    expect(data.similarUsers[1].userId).toBe('user2');
    expect(data.similarUsers[1].overallMatch).toBe(39.9);
  });

  it('returns all users regardless of watchCount (filtering happens at computation time)', async () => {
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
    expect(data.similarUsers).toHaveLength(2);
    expect(data.similarUsers.find((u: any) => u.userId === 'user1').watchCount).toBe(3);
    expect(data.similarUsers.find((u: any) => u.userId === 'user2').watchCount).toBe(2);
  });

  it('handles empty DB results and falls back to on-demand computation', async () => {
    (prisma.similarityScore.findMany as any).mockResolvedValue([]);
    mockGetCandidateUsersForSimilarity.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/user/similar-users');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.similarUsers).toHaveLength(0);
  });
});
