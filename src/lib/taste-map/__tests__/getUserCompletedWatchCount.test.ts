import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserCompletedWatchCount } from '../similarity-storage';
import { prisma } from '@/lib/prisma';
import { MOVIE_STATUS_IDS } from '@/lib/movieStatusConstants';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    watchList: {
      groupBy: vi.fn(),
    },
  },
}));

describe('getUserCompletedWatchCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns Map with correct counts for multiple users using groupBy', async () => {
    const mockResult = [
      { userId: 'u1', count: 5 },
      { userId: 'u2', count: 2 },
    ];
    vi.mocked(prisma.watchList.groupBy).mockResolvedValue(mockResult);

    const result = await getUserCompletedWatchCount(['u1', 'u2', 'u3']);

    expect(result.get('u1')).toBe(5);
    expect(result.get('u2')).toBe(2);
    expect(result.get('u3')).toBeUndefined(); // u3 not in result, caller uses ??0
    expect(prisma.watchList.groupBy).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: { in: ['u1', 'u2', 'u3'] },
        statusId: { in: [MOVIE_STATUS_IDS.WATCHED, MOVIE_STATUS_IDS.REWATCHED] },
      }),
      by: ['userId'],
      _count: true,
    });
  });

  it('returns empty Map for empty userIds', async () => {
    vi.mocked(prisma.watchList.groupBy).mockResolvedValue([]);

    const result = await getUserCompletedWatchCount([]);

    expect(result.size).toBe(0);
    expect(prisma.watchList.groupBy).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: { in: [] },
        statusId: { in: [MOVIE_STATUS_IDS.WATCHED, MOVIE_STATUS_IDS.REWATCHED] },
      }),
      by: ['userId'],
      _count: true,
    });
  });

  it('only counts items with WATCHED status', async () => {
    const mockResult = [
      { userId: 'u1', count: 3 },
    ];
    vi.mocked(prisma.watchList.groupBy).mockResolvedValue(mockResult);

    const result = await getUserCompletedWatchCount(['u1']);

    expect(result.get('u1')).toBe(3);
    expect(prisma.watchList.groupBy).toHaveBeenCalledWith({
      where: expect.objectContaining({
        statusId: { in: [MOVIE_STATUS_IDS.WATCHED, MOVIE_STATUS_IDS.REWATCHED] },
      }),
      by: ['userId'],
      _count: true,
    });
  });

  it('handles user with no completed items (missing from groupBy result)', async () => {
    const mockResult = [
      { userId: 'u1', count: 5 },
      // u2 has no completed items, so not in result
    ];
    vi.mocked(prisma.watchList.groupBy).mockResolvedValue(mockResult);

    const result = await getUserCompletedWatchCount(['u1', 'u2']);

    expect(result.get('u1')).toBe(5);
    expect(result.get('u2')).toBeUndefined();
  });

  it('handles all users with no completed items', async () => {
    vi.mocked(prisma.watchList.groupBy).mockResolvedValue([]);

    const result = await getUserCompletedWatchCount(['u1', 'u2', 'u3']);

    expect(result.size).toBe(0);
  });

  it('uses correct COMPLETED_STATUS_IDS in where clause', async () => {
    vi.mocked(prisma.watchList.groupBy).mockResolvedValue([]);

    await getUserCompletedWatchCount(['test-user']);

    expect(prisma.watchList.groupBy).toHaveBeenCalledWith({
      where: expect.objectContaining({
        statusId: { in: [MOVIE_STATUS_IDS.WATCHED, MOVIE_STATUS_IDS.REWATCHED] },
      }),
      by: ['userId'],
      _count: true,
    });
  });

  it('handles groupBy error gracefully', async () => {
    const mockError = new Error('Database error');
    vi.mocked(prisma.watchList.groupBy).mockRejectedValue(mockError);

    await expect(getUserCompletedWatchCount(['u1'])).rejects.toThrow('Database error');
  });
});
