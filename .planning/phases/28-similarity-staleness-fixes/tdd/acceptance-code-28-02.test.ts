import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/user/similar-users/route';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getSimilarUsers, storeSimilarUsers, computeSimilarity, isSimilar, MIN_MATCH_THRESHOLD } from '@/lib/taste-map/similarity';
import {
  computeAndStoreSimilarityScore,
  getCandidateUsersForSimilarity,
  getUserCompletedWatchCount,
} from '@/lib/taste-map/similarity-storage';
import { rateLimit } from '@/middleware/rateLimit';
import type { SimilarityScore } from '@prisma/client';

vi.mock('next-auth');
vi.mock('@/auth');
vi.mock('@/middleware/rateLimit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    watchList: {
      count: vi.fn(),
    },
    similarityScore: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));
vi.mock('@/lib/taste-map/similarity', () => ({
  getSimilarUsers: vi.fn(),
  storeSimilarUsers: vi.fn(),
  computeSimilarity: vi.fn(),
  isSimilar: vi.fn(),
  MIN_MATCH_THRESHOLD: 0.4,
}));
vi.mock('@/lib/taste-map/similarity-storage', () => ({
  computeAndStoreSimilarityScore: vi.fn(),
  getCandidateUsersForSimilarity: vi.fn(),
  getUserCompletedWatchCount: vi.fn(),
}));

// Helper to create request
function createRequest(userId?: string): Request {
  const url = new URL('http://localhost/api/user/similar-users');
  if (userId) url.searchParams.set('userId', userId);
  return new Request(url);
}

describe('GET /api/user/similar-users — Phase 28-02', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return from Redis cache when available', async () => {
    const userId = 'user-1';
    const cached = [{ userId: 'user-2', overallMatch: 0.5 }];
    vi.mocked(getSimilarUsers).mockResolvedValue(cached);
    vi.mocked(prisma.similarityScore.findMany).mockResolvedValue([]);
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: userId } } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'user-2', createdAt: new Date() },
    ]);
    vi.mocked(getUserCompletedWatchCount).mockResolvedValue(new Map([['user-2', 10]]));

    const req = createRequest(userId);
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.fromDatabase).toBe(false);
    expect(json.similarUsers).toHaveLength(1);
    expect(json.similarUsers[0].userId).toBe('user-2');
    expect(json.similarUsers[0].overallMatch).toBe(50); // 0.5 * 100
  });

  it('should use fresh DB scores when no cache', async () => {
    const userId = 'user-1';
    const now = new Date();
    const freshScore = {
      userIdA: userId,
      userIdB: 'user-2',
      overallMatch: '0.6000',
      expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24),
      tasteSimilarity: '0.4800',
      ratingCorrelation: '0.3600',
      personOverlap: '0.2400',
      tasteMapASnapshot: {},
      tasteMapBSnapshot: {},
      computedAt: now,
      updatedAt: now,
      computedBy: 'on-demand',
      id: 'id1',
    } as unknown as SimilarityScore;
    vi.mocked(getSimilarUsers).mockResolvedValue([]);
    vi.mocked(prisma.similarityScore.findMany).mockResolvedValue([freshScore]);
    vi.mocked(storeSimilarUsers).mockResolvedValue(undefined);
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: userId } } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'user-2', createdAt: now },
    ]);
    vi.mocked(getUserCompletedWatchCount).mockResolvedValue(new Map([['user-2', 10]]));

    const req = createRequest(userId);
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.fromDatabase).toBe(true);
    expect(json.similarUsers[0].overallMatch).toBe(60); // 0.6 * 100
  });

  it('should lazy recompute stale pairs', async () => {
    const userId = 'user-1';
    const now = new Date();
    const staleScore = {
      userIdA: userId,
      userIdB: 'user-2',
      overallMatch: '0.5000',
      expiresAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 8), // stale
      tasteSimilarity: '0.4000',
      ratingCorrelation: '0.3000',
      personOverlap: '0.2000',
      tasteMapASnapshot: {},
      tasteMapBSnapshot: {},
      computedAt: now,
      updatedAt: now,
      computedBy: 'on-demand',
      id: 'id1',
    } as unknown as SimilarityScore;
    const freshScore = {
      userIdA: userId,
      userIdB: 'user-3',
      overallMatch: '0.7000',
      expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24), // fresh
      tasteSimilarity: '0.5600',
      ratingCorrelation: '0.4200',
      personOverlap: '0.2800',
      tasteMapASnapshot: {},
      tasteMapBSnapshot: {},
      computedAt: now,
      updatedAt: now,
      computedBy: 'on-demand',
      id: 'id2',
    } as unknown as SimilarityScore;
    vi.mocked(getSimilarUsers).mockResolvedValue([]);
    vi.mocked(prisma.similarityScore.findMany).mockResolvedValue([staleScore, freshScore]);
    vi.mocked(storeSimilarUsers).mockResolvedValue(undefined);
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: userId } } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'user-2', createdAt: now },
      { id: 'user-3', createdAt: now },
    ]);
    vi.mocked(getUserCompletedWatchCount).mockResolvedValue(new Map([['user-2', 10], ['user-3', 10]]));

    const recomputeResult = {
      overallMatch: 0.45,
      tasteSimilarity: 0.36,
      ratingCorrelation: 0.27,
      personOverlap: 0.18,
      genreMatches: {},
      sharedMovies: [],
    };
    vi.mocked(computeSimilarity).mockResolvedValue(recomputeResult);
    vi.mocked(isSimilar).mockReturnValue(true);
    const refreshedScore = {
      ...staleScore,
      overallMatch: '0.4500',
      expiresAt: new Date(now.getTime() + 168 * 60 * 60 * 1000),
    } as unknown as SimilarityScore;
    vi.mocked(prisma.similarityScore.findUnique).mockResolvedValue(refreshedScore);

    const req = createRequest(userId);
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    const userIds = json.similarUsers.map((u: any) => u.userId);
    expect(userIds).toContain('user-2');
    expect(userIds).toContain('user-3');
    const user2 = json.similarUsers.find((u: any) => u.userId === 'user-2');
    expect(user2.overallMatch).toBe(45); // refreshed 0.45 * 100
  });

  it('should fallback to on-demand when no DB scores', async () => {
    const userId = 'user-1';
    vi.mocked(getSimilarUsers).mockResolvedValue([]);
    vi.mocked(prisma.similarityScore.findMany).mockResolvedValue([]);
    vi.mocked(getCandidateUsersForSimilarity).mockResolvedValue(['user-2']);
    const computeResult = {
      overallMatch: 0.5,
      tasteSimilarity: 0.4,
      ratingCorrelation: 0.3,
      personOverlap: 0.2,
      genreMatches: {},
      sharedMovies: [],
    };
    vi.mocked(computeSimilarity).mockResolvedValue(computeResult);
    vi.mocked(isSimilar).mockReturnValue(true);
    const stored = {
      userIdA: userId,
      userIdB: 'user-2',
      overallMatch: '0.5000',
      tasteSimilarity: '0.4000',
      ratingCorrelation: '0.3000',
      personOverlap: '0.2000',
      tasteMapASnapshot: {},
      tasteMapBSnapshot: {},
      computedAt: new Date(),
      updatedAt: new Date(),
      computedBy: 'on-demand',
      id: 'new',
      expiresAt: new Date(Date.now() + 168 * 60 * 60 * 1000),
    } as unknown as SimilarityScore;
    vi.mocked(prisma.similarityScore.findUnique).mockResolvedValue(stored);
    vi.mocked(storeSimilarUsers).mockResolvedValue(undefined);
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: userId } } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'user-2', createdAt: new Date() },
    ]);
    vi.mocked(getUserCompletedWatchCount).mockResolvedValue(new Map([['user-2', 10]]));

    const req = createRequest(userId);
    const res = await GET(req);
    const json = await res.json();

     expect(res.status).toBe(200);
     expect(json.fromDatabase).toBe(false);
     expect(json.message).toContain('Found');
     expect(json.similarUsers).toHaveLength(1);
  });
});
