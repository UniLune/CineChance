// src/app/api/user/stats/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { MOVIE_STATUS_IDS } from '@/lib/movieStatusConstants';
import { rateLimit } from '@/middleware/rateLimit';
import { withCache } from '@/lib/redis';
import { logger } from '@/lib/logger';

async function calculateTypeBreakdown(
  allRecords: Array<{ mediaType: string }>
): Promise<{ movie: number; tv: number; cartoon: number; anime: number }> {
  const counts = { movie: 0, tv: 0, cartoon: 0, anime: 0 };
  
  for (const record of allRecords) {
    if (record.mediaType === 'anime') counts.anime++;
    else if (record.mediaType === 'cartoon') counts.cartoon++;
    else if (record.mediaType === 'movie') counts.movie++;
    else if (record.mediaType === 'tv') counts.tv++;
  }
  
  return counts;
}

async function fetchStats(userId: string, mediaFilter?: string | null) {
  const statusFilter = {
    in: [
      MOVIE_STATUS_IDS.WANT_TO_WATCH,
      MOVIE_STATUS_IDS.WATCHED,
      MOVIE_STATUS_IDS.REWATCHED,
      MOVIE_STATUS_IDS.DROPPED
    ]
  };

  const [watchedCount, wantToWatchCount, droppedCount, hiddenCount, allRecords] = await Promise.all([
    prisma.watchList.count({
      where: {
        userId,
        statusId: { in: [MOVIE_STATUS_IDS.WATCHED, MOVIE_STATUS_IDS.REWATCHED] },
        mediaType: mediaFilter || undefined,
      },
    }),
    prisma.watchList.count({
      where: { userId, statusId: MOVIE_STATUS_IDS.WANT_TO_WATCH, mediaType: mediaFilter || undefined },
    }),
    prisma.watchList.count({
      where: { userId, statusId: MOVIE_STATUS_IDS.DROPPED, mediaType: mediaFilter || undefined },
    }),
    prisma.blacklist.count({ where: { userId } }),
    prisma.watchList.findMany({
      where: { userId, statusId: statusFilter, mediaType: mediaFilter || undefined },
      select: { mediaType: true },
    }),
  ]);

  const typeCounts = calculateTypeBreakdown(allRecords);

  const avgRatingResult = await prisma.watchList.aggregate({
    where: {
      userId,
      statusId: { in: [MOVIE_STATUS_IDS.WATCHED, MOVIE_STATUS_IDS.REWATCHED, MOVIE_STATUS_IDS.DROPPED] },
      userRating: { not: null },
      mediaType: mediaFilter || undefined,
    },
    _avg: { userRating: true },
    _count: { userRating: true },
  });

  const avg = avgRatingResult._avg;
  const count = avgRatingResult._count;
  const averageRating = avg?.userRating ?? null;
  const finalAverageRating = averageRating ? Math.round(averageRating * 10) / 10 : null;
  const ratedCount = count?.userRating || 0;

  const ratingGroups = await prisma.watchList.groupBy({
    by: ['userRating'],
    where: {
      userId,
      statusId: { in: [MOVIE_STATUS_IDS.WATCHED, MOVIE_STATUS_IDS.REWATCHED, MOVIE_STATUS_IDS.DROPPED] },
      userRating: { not: null },
      mediaType: mediaFilter || undefined,
    },
    _count: { userRating: true },
  });

  const ratingDistribution: Record<number, number> = {};
  for (let i = 10; i >= 1; i--) {
    ratingDistribution[i] = 0;
  }

  for (const group of ratingGroups) {
    if (group.userRating !== null) {
      const roundedRating = Math.round(group.userRating);
      if (roundedRating >= 1 && roundedRating <= 10) {
        ratingDistribution[roundedRating] = group._count.userRating;
      }
    }
  }

  const totalForPercentage = watchedCount + wantToWatchCount + droppedCount;

  return {
    total: {
      watched: watchedCount,
      wantToWatch: wantToWatchCount,
      dropped: droppedCount,
      hidden: hiddenCount,
      totalForPercentage,
    },
    typeBreakdown: typeCounts,
    averageRating: finalAverageRating,
    ratedCount,
    ratingDistribution,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { success } = await rateLimit(request, '/api/user/stats');
    if (!success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const mediaFilter = searchParams.get('media');
    const validMedia = mediaFilter && ['movie', 'tv', 'cartoon', 'anime'].includes(mediaFilter) ? mediaFilter : null;
    const cacheKey = `user:${userId}:stats:${validMedia || 'all'}`;

    const responseData = await withCache(cacheKey, () => fetchStats(userId, validMedia), 3600);

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error('Error fetching user stats', { 
      error: error instanceof Error ? error.message : String(error),
      context: 'UserStatsAPI'
    });
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}