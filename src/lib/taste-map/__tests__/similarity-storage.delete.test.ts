import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteSimilarityScoresByUser } from '../similarity-storage';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    similarityScore: {
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/redis', () => ({
  invalidateCache: vi.fn().mockResolvedValue(undefined),
}));

describe('deleteSimilarityScoresByUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes all similarity scores for user as userIdA and userIdB', async () => {
    vi.mocked(prisma.similarityScore.deleteMany).mockResolvedValue({ count: 5 });

    const result = await deleteSimilarityScoresByUser('user-123');

    expect(result).toBe(5);
    expect(prisma.similarityScore.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { userIdA: 'user-123' },
          { userIdB: 'user-123' },
        ],
      },
    });
    expect(logger.info).toHaveBeenCalledWith(
      'Deleted similarity scores for user',
      expect.objectContaining({
        userId: 'user-123',
        deleted: 5,
        context: 'SimilarityStorage',
      })
    );
  });

  it('returns 0 when no scores found', async () => {
    vi.mocked(prisma.similarityScore.deleteMany).mockResolvedValue({ count: 0 });

    const result = await deleteSimilarityScoresByUser('user-456');

    expect(result).toBe(0);
  });
});
