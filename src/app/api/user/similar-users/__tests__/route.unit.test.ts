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

interface SimilarUserScore {
  userIdA: string;
  userIdB: string;
  overallMatch: string;
  computedAt: Date;
}

interface UserInfo {
  id: string;
  email?: string;
  createdAt: Date;
  watchList: { id: string }[];
}

interface SimilarUserResponse {
  userId: string;
  overallMatch: number;
  watchCount: number;
  memberSince?: Date;
  source: string;
}

type ApiResponse = {
  similarUsers: SimilarUserResponse[];
  fromDatabase: boolean;
  computedAt: string;
  message?: string;
};

describe('GET /api/user/similar-users (Unit Tests)', () => {
  const mockSession = { user: { id: 'current-user' } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(mockSession);
    (prisma.watchList.count as any).mockResolvedValue(10); // current user has >3
  });

  it('calls getUserCompletedWatchCount with candidate userIds', async () => {
    const mockDbScores: SimilarUserScore[] = [
      { userIdA: 'current-user', userIdB: 'candidate1', overallMatch: '0.45', computedAt: new Date() },
      { userIdA: 'current-user', userIdB: 'candidate2', overallMatch: '0.50', computedAt: new Date() },
    ] as any;
    (prisma.similarityScore.findMany as any).mockResolvedValue(mockDbScores);

    mockGetUserCompletedWatchCount.mockResolvedValue(new Map([['candidate1', 5], ['candidate2', 10]]));

    (prisma.user.findMany as any).mockResolvedValue([
      { id: 'candidate1', createdAt: new Date(), watchList: [] },
      { id: 'candidate2', createdAt: new Date(), watchList: [] },
    ] as any);

    const request = new NextRequest('http://localhost:3000/api/user/similar-users');
    const response = await GET(request);
    const data: ApiResponse = await response.json();

    expect(mockGetUserCompletedWatchCount).toHaveBeenCalledTimes(1);
    expect(mockGetUserCompletedWatchCount).toHaveBeenCalledWith(['candidate1', 'candidate2']);
  });

  it('filters users with watchCount < 3', async () => {
    const mockDbScores: SimilarUserScore[] = [
      { userIdA: 'current-user', userIdB: 'user1', overallMatch: '0.50', computedAt: new Date() },
      { userIdA: 'current-user', userIdB: 'user2', overallMatch: '0.50', computedAt: new Date() },
      { userIdA: 'current-user', userIdB: 'user3', overallMatch: '0.50', computedAt: new Date() },
    ] as any;
    (prisma.similarityScore.findMany as any).mockResolvedValue(mockDbScores);

    mockGetUserCompletedWatchCount.mockResolvedValue(
      new Map([['user1', 2], ['user2', 1], ['user3', 5]])
    );

    (prisma.user.findMany as any).mockResolvedValue([
      { id: 'user1', createdAt: new Date(), watchList: [] },
      { id: 'user2', createdAt: new Date(), watchList: [] },
      { id: 'user3', createdAt: new Date(), watchList: [] },
    ] as any);

    const request = new NextRequest('http://localhost:3000/api/user/similar-users');
    const response = await GET(request);
    const data: ApiResponse = await response.json();

    expect(response.status).toBe(200);
    expect(data.similarUsers).toHaveLength(1);
    expect(data.similarUsers[0].userId).toBe('user3');
    expect(data.similarUsers[0].watchCount).toBe(5);
  });

  it('filters users with overallMatch < 40%', async () => {
    const mockDbScores: SimilarUserScore[] = [
      { userIdA: 'current-user', userIdB: 'user1', overallMatch: '0.35', computedAt: new Date() },
      { userIdA: 'current-user', userIdB: 'user2', overallMatch: '0.39', computedAt: new Date() },
      { userIdA: 'current-user', userIdB: 'user3', overallMatch: '0.45', computedAt: new Date() },
    ] as any;
    (prisma.similarityScore.findMany as any).mockResolvedValue(mockDbScores);

    mockGetUserCompletedWatchCount.mockResolvedValue(
      new Map([['user1', 5], ['user2', 5], ['user3', 5]])
    );

    (prisma.user.findMany as any).mockResolvedValue([
      { id: 'user1', createdAt: new Date(), watchList: [] },
      { id: 'user2', createdAt: new Date(), watchList: [] },
      { id: 'user3', createdAt: new Date(), watchList: [] },
    ] as any);

    const request = new NextRequest('http://localhost:3000/api/user/similar-users');
    const response = await GET(request);
    const data: ApiResponse = await response.json();

    expect(response.status).toBe(200);
    expect(data.similarUsers).toHaveLength(1);
    expect(data.similarUsers[0].userId).toBe('user3');
    expect(data.similarUsers[0].overallMatch).toBe(45.0);
  });

  it('includes users meeting both criteria', async () => {
    const mockDbScores: SimilarUserScore[] = [
      { userIdA: 'current-user', userIdB: 'user1', overallMatch: '0.50', computedAt: new Date() },
      { userIdA: 'current-user', userIdB: 'user2', overallMatch: '0.60', computedAt: new Date() },
    ] as any;
    (prisma.similarityScore.findMany as any).mockResolvedValue(mockDbScores);

    mockGetUserCompletedWatchCount.mockResolvedValue(
      new Map([['user1', 5], ['user2', 10]])
    );

    (prisma.user.findMany as any).mockResolvedValue([
      { id: 'user1', createdAt: new Date(), watchList: [] },
      { id: 'user2', createdAt: new Date(), watchList: [] },
    ] as any);

    const request = new NextRequest('http://localhost:3000/api/user/similar-users');
    const response = await GET(request);
    const data: ApiResponse = await response.json();

    expect(response.status).toBe(200);
    expect(data.similarUsers).toHaveLength(2);
    expect(data.similarUsers.map((u: SimilarUserResponse) => u.userId)).toContain('user1');
    expect(data.similarUsers.map((u: SimilarUserResponse) => u.userId)).toContain('user2');
    // Both should have watchCount >= 3 and overallMatch >= 40
    data.similarUsers.forEach(u => {
      expect(u.watchCount).toBeGreaterThanOrEqual(3);
      expect(u.overallMatch).toBeGreaterThanOrEqual(40);
    });
  });

  it('handles empty results correctly', async () => {
    // Provide scores that all get filtered out (similar to existing test)
    const mockDbScores: SimilarUserScore[] = [
      { userIdA: 'current-user', userIdB: 'user1', overallMatch: '0.30', computedAt: new Date() },
      { userIdA: 'current-user', userIdB: 'user2', overallMatch: '0.35', computedAt: new Date() },
      { userIdA: 'current-user', userIdB: 'user3', overallMatch: '0.38', computedAt: new Date() },
    ] as any;
    (prisma.similarityScore.findMany as any).mockResolvedValue(mockDbScores);

    // All have less than 3 completed watches OR below 40% match
    mockGetUserCompletedWatchCount.mockResolvedValue(
      new Map([['user1', 1], ['user2', 2], ['user3', 2]])
    );

    (prisma.user.findMany as any).mockResolvedValue([
      { id: 'user1', createdAt: new Date(), watchList: [] },
      { id: 'user2', createdAt: new Date(), watchList: [] },
      { id: 'user3', createdAt: new Date(), watchList: [] },
    ] as any);

    const request = new NextRequest('http://localhost:3000/api/user/similar-users');
    const response = await GET(request);
    const data: ApiResponse = await response.json();

    expect(response.status).toBe(200);
    expect(data.similarUsers).toHaveLength(0);
  });
});
