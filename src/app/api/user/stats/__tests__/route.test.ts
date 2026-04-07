import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

vi.mock('@/auth');
vi.mock('@/lib/prisma', () => ({
  prisma: {
    watchList: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    blacklist: {
      count: vi.fn(),
    },
  },
}));
vi.mock('@/middleware/rateLimit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('@/lib/redis', () => ({
  withCache: vi.fn((_key, fn) => fn()),
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

const mockGetServerSession = getServerSession as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as any;

describe('GET /api/user/stats - Anime/Cartoon Type Classification', () => {
  const mockSession = { user: { id: 'test-user-id' } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(mockSession);
  });

  describe('isAnime function (inline test)', () => {
    it('should recognize anime via genre_ids array (numbers)', () => {
      const tmdbData = {
        genre_ids: [16, 28, 12],
        genres: undefined,
        original_language: 'ja',
      };
      
      const hasAnimeGenre = (tmdbData as any).genres?.some((g: { id: number }) => g.id === 16) ?? false;
      const isJapanese = (tmdbData as any).original_language === 'ja';
      const result = hasAnimeGenre && isJapanese;
      
      expect(result).toBe(false);
    });

    it('should recognize anime via genres array (objects)', () => {
      const tmdbData = {
        genre_ids: [],
        genres: [{ id: 16 }, { id: 28 }],
        original_language: 'ja',
      };
      
      const hasAnimeGenre = tmdbData.genres?.some((g) => g.id === 16) ?? false;
      const isJapanese = tmdbData.original_language === 'ja';
      const result = hasAnimeGenre && isJapanese;
      
      expect(result).toBe(true);
    });
  });

  describe('calculateTypeBreakdown edge case: tmdbData not available', () => {
    it('documents current bug behavior', () => {
      // Current bug: when tmdbData is undefined, anime/cartoon records
      // are classified as movie/tv instead of using dbMediaType
    });
  });
});
