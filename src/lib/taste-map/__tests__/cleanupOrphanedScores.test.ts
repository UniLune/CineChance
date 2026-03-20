import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanupOrphanedScores } from '../similarity-storage';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    user: {
      findMany: vi.fn(),
    },
    similarityScore: {
      deleteMany: vi.fn(),
    },
  },
}));

describe('cleanupOrphanedScores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes all scores with orphaned users', async () => {
    // Mock similarity score user IDs (both userIdA and userIdB)
    vi.mocked(prisma.$queryRaw).mockResolvedValue(['user1', 'user2', 'user3', 'user4']);

    // Mock existing users (only user1 and user2 exist)
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'user1' },
      { id: 'user2' },
    ]);

    // Mock deleteMany result
    vi.mocked(prisma.similarityScore.deleteMany).mockResolvedValue({ count: 10 });

    const result = await cleanupOrphanedScores();

    expect(result).toEqual({
      deleted: 10,
      orphans: ['user3', 'user4'],
    });

    // Verify deleteMany called with correct where clause
    expect(prisma.similarityScore.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { userIdA: { in: ['user3', 'user4'] } },
          { userIdB: { in: ['user3', 'user4'] } },
        ],
      },
    });

    // Verify raw query executed
    expect(prisma.$queryRaw).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringMatching(/SELECT DISTINCT "userIdA"/)])
    );
  });

  it('handles empty similarity table', async () => {
    // No similarity scores at all
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    const result = await cleanupOrphanedScores();

    expect(result).toEqual({
      deleted: 0,
      orphans: [],
    });

    // Verify user.findMany and deleteMany not called
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.similarityScore.deleteMany).not.toHaveBeenCalled();
  });

  it('handles no orphans', async () => {
    // Mock similarity score user IDs
    vi.mocked(prisma.$queryRaw).mockResolvedValue(['user1', 'user2', 'user3']);

    // All users exist
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'user1' },
      { id: 'user2' },
      { id: 'user3' },
    ]);

    const result = await cleanupOrphanedScores();

    expect(result).toEqual({
      deleted: 0,
      orphans: [],
    });

    // Verify deleteMany not called when no orphans
    expect(prisma.similarityScore.deleteMany).not.toHaveBeenCalled();
  });

  it('handles batching for large user sets', async () => {
    // Create 1050 user IDs to test batching (BATCH_SIZE = 1000)
    const allUserIds = Array.from({ length: 1050 }, (_, i) => `user${i + 1}`);

    vi.mocked(prisma.$queryRaw).mockResolvedValue(allUserIds);

    // Only first 1000 users exist in second batch
    vi.mocked(prisma.user.findMany)
      .mockResolvedValueOnce(
        Array.from({ length: 1000 }, (_, i) => ({ id: `user${i + 1}` }))
      )
      .mockResolvedValueOnce(
        Array.from({ length: 50 }, (_, i) => ({ id: `user${i + 1001}` }))
      );

    // Mock deleteMany
    vi.mocked(prisma.similarityScore.deleteMany).mockResolvedValue({ count: 50 });

    const result = await cleanupOrphanedScores();

    expect(result.orphans).toHaveLength(0); // All users exist
    expect(result.deleted).toBe(0);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(2);
  });

  it('handles findMany partial batches', async () => {
    // Mix of existing and non-existing users
    vi.mocked(prisma.$queryRaw).mockResolvedValue(['u1', 'u2', 'u3', 'u4', 'u5']);

    // Only u1 and u3 exist
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1' },
      { id: 'u3' },
    ]);

    vi.mocked(prisma.similarityScore.deleteMany).mockResolvedValue({ count: 15 });

    const result = await cleanupOrphanedScores();

    expect(result.orphans).toHaveLength(3);
    expect(result.orphans).toContain('u2');
    expect(result.orphans).toContain('u4');
    expect(result.orphans).toContain('u5');
    expect(result.deleted).toBe(15);
  });
});
