import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/middleware/rateLimit';
import { computeAndStoreSimilarityScore, getCandidateUsersForSimilarity } from '@/lib/taste-map/similarity-storage';
import { computeSimilarity, isSimilar, MIN_MATCH_THRESHOLD, getSimilarUsers, storeSimilarUsers } from '@/lib/taste-map/similarity';
import { getUserCompletedWatchCount } from '@/lib/taste-map/similarity-storage';

/**
 * Minimum number of movies in a user's watchlist to be eligible for similarity matching.
 * Ensures users have sufficient viewing history for meaningful comparisons.
 */
const MIN_USER_HISTORY = 3;

/**
 * Minimum number of completed ratings/movies required for a candidate user to appear in results.
 * Filters out users with insufficient viewing data.
 */
const MIN_COMPLETED_WATCH_COUNT = 3;
// No longer limiting candidate search - check ALL users with shared movies
// Previously limited to 200 active users, now finds all potential matches

/**
 * GET /api/user/similar-users
 *
 * Find users with similar taste profiles from persistent database storage.
 * Implements two-stage filtering:
 *  1. MIN_MATCH_THRESHOLD (0.4) - ensures meaningful taste similarity
 *  2. MIN_COMPLETED_WATCH_COUNT (3) - ensures candidate user has sufficient viewing history
 *
 * Query parameters:
 * - limit: maximum number of similar users to return (default 50, max 100)
 * - freshOnly: only return fresh scores (computed within last 7 days)
 *
 * Returns:
 * - similarUsers: array of {userId, overallMatch (percentage), watchCount, memberSince, source}
 * - fromDatabase: whether results came from persistent storage
 * - computedAt: timestamp of the stored/computed results
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Rate limiting
  const { success } = await rateLimit(request, '/api/user/similar-users');
  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 }
    );
  }

  try {
    // Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100); // Increased default and max limits

    // Check user has minimum history
    const watchListCount = await prisma.watchList.count({
      where: { userId },
    });

    if (watchListCount < MIN_USER_HISTORY) {
      return NextResponse.json({
        similarUsers: [],
        fromDatabase: false,
        computedAt: new Date().toISOString(),
        message: 'Not enough watch history to find similar users',
      });
    }

    // Try Redis cache first (fast path)
    const cachedTwins = await getSimilarUsers(userId);

    if (cachedTwins.length > 0) {
      logger.debug('Returning similar users from Redis cache', {
        userId,
        count: cachedTwins.length,
        context: 'SimilarUsersAPI',
      });

      // Enrich cached results: need userInfo and completedCounts
      const cachedUserIds = cachedTwins.map(t => t.userId);
      const [userInfoMap, completedCountsMap] = await Promise.all([
        prisma.user.findMany({
          where: { id: { in: cachedUserIds } },
          select: { id: true, createdAt: true },
        }),
        getUserCompletedWatchCount(cachedUserIds),
      ]);

      const userInfoById = new Map(userInfoMap.map(u => [u.id, u] as [string, { id: string; createdAt: Date }]));

      const enrichedResults = cachedTwins
        .filter(u => u.overallMatch >= MIN_MATCH_THRESHOLD && (completedCountsMap.get(u.userId) ?? 0) >= MIN_COMPLETED_WATCH_COUNT)
        .map(u => ({
          userId: u.userId,
          overallMatch: Number((u.overallMatch * 100).toFixed(1)),
          watchCount: completedCountsMap.get(u.userId) ?? 0,
          memberSince: userInfoById.get(u.userId)?.createdAt,
          source: 'cache' as const,
        }));

      return NextResponse.json({
        similarUsers: enrichedResults,
        fromDatabase: false,
        computedAt: new Date().toISOString(),
        message: `Found ${enrichedResults.length} similar user(s) from cache`,
      });
    }

    // Get all similarity scores from database (no freshOnly)
    let dbScores = await prisma.similarityScore.findMany({
      where: {
        OR: [
          { userIdA: userId },
          { userIdB: userId },
        ],
      },
      orderBy: {
        overallMatch: 'desc',
      },
      // Fetch extra to allow for stale filtering
      take: limit * 2,
    });

    let fromDatabase = true;
    let computedAt = new Date();

    if (dbScores.length === 0) {
      // FULL ON-DEMAND FALLBACK
      logger.info('No similarity scores found, computing on-demand', {
        userId,
        context: 'SimilarUsersAPI',
      });

      fromDatabase = false;

      const candidateIds = await getCandidateUsersForSimilarity(userId);

      if (candidateIds.length === 0) {
        return NextResponse.json({
          similarUsers: [],
          fromDatabase: false,
          computedAt: new Date().toISOString(),
          message: 'Not enough users with shared movies found',
        });
      }

      logger.info('Computing similarities for candidates', {
        userId,
        candidatesCount: candidateIds.length,
        context: 'SimilarUsersAPI',
      });

      const computedScores: typeof dbScores = [];
      let similarCount = 0;
      for (const candidateId of candidateIds) {
        try {
          const result = await computeSimilarity(userId, candidateId, false);

          if (isSimilar(result)) {
            similarCount++;
            await computeAndStoreSimilarityScore(userId, candidateId, 'on-demand');

            const stored = await prisma.similarityScore.findUnique({
              where: {
                userIdA_userIdB: userId < candidateId
                  ? { userIdA: userId, userIdB: candidateId }
                  : { userIdA: candidateId, userIdB: userId },
              },
            });

            if (stored) {
              computedScores.push(stored);
            }
          }
        } catch (err) {
          logger.debug('Error computing similarity', {
            candidateId,
            error: err instanceof Error ? err.message : String(err),
            context: 'SimilarUsersAPI',
          });
        }
      }

      logger.info('Finished computing similarities', {
        userId,
        candidatesChecked: candidateIds.length,
        similarFound: similarCount,
        context: 'SimilarUsersAPI',
      });

      computedScores.sort((a, b) => Number(b.overallMatch) - Number(a.overallMatch));
      dbScores = computedScores.slice(0, limit);
      computedAt = new Date();

      // Store to Redis after on-demand computation
      const redisScores = dbScores.map(s => ({
        userId: s.userIdA === userId ? s.userIdB : s.userIdA,
        overallMatch: Number(s.overallMatch) / 100,
      }));
      await storeSimilarUsers(userId, redisScores);
    } else {
      // HAS SCORES: Check freshness and lazy recompute stale pairs
      const now = new Date();
      const freshScores: typeof dbScores = [];
      const stalePairs: Array<{ score: typeof dbScores[0]; otherUserId: string }> = [];

      // Extend type to include expiresAt (added via migration)
      type SimilarityScoreWithExpires = typeof dbScores[number] & { expiresAt?: Date | null };

      for (const score of dbScores) {
        const scoreWithExpires = score as SimilarityScoreWithExpires;
        const isFresh = !scoreWithExpires.expiresAt || scoreWithExpires.expiresAt > now;
        if (isFresh) {
          freshScores.push(score);
        } else {
          const otherUserId = score.userIdA === userId ? score.userIdB : score.userIdA;
          stalePairs.push({ score, otherUserId });
        }
      }

      // Lazy recompute stale pairs
      for (const { score, otherUserId } of stalePairs) {
        try {
          logger.debug('Recomputing stale similarity pair', {
            userId,
            otherUserId,
            oldScore: Number(score.overallMatch),
            context: 'SimilarUsersAPI',
          });

          const result = await computeSimilarity(userId, otherUserId, false);

          if (isSimilar(result)) {
            await computeAndStoreSimilarityScore(userId, otherUserId, 'on-demand');

            const refreshed = await prisma.similarityScore.findUnique({
              where: {
                userIdA_userIdB: score.userIdA < score.userIdB
                  ? { userIdA: score.userIdA, userIdB: score.userIdB }
                  : { userIdA: score.userIdB, userIdB: score.userIdA },
              },
            });

            if (refreshed) {
              freshScores.push(refreshed);
            }
          }
          // If not similar, old score is omitted (will expire naturally)
        } catch (err) {
          logger.debug('Error recomputing similarity pair', {
            userId,
            otherUserId,
            error: err instanceof Error ? err.message : String(err),
            context: 'SimilarUsersAPI',
          });
          // Keep old score on error (it's stale but maybe better than nothing)
          freshScores.push(score);
        }
      }

      // Sort and limit
      freshScores.sort((a, b) => Number(b.overallMatch) - Number(a.overallMatch));
      dbScores = freshScores.slice(0, limit);
      computedAt = new Date();

      // Store updated results to Redis
      const redisScores = dbScores.map(s => ({
        userId: s.userIdA === userId ? s.userIdB : s.userIdA,
        overallMatch: Number(s.overallMatch) / 100,
      }));
      await storeSimilarUsers(userId, redisScores);
    }

    // Extract user IDs and scores (convert Decimal to number)
    const similarUsers = dbScores.map(score => ({
      userId: score.userIdA === userId ? score.userIdB : score.userIdA,
      overallMatch: Number(score.overallMatch),
      fromDatabase: true,
      computedAt: score.computedAt,
    }));


    // Fetch user info for enrichment
    const userIds = similarUsers.map(u => u.userId);
    const userInfoMap = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        createdAt: true,
        watchList: { select: { id: true } },
      },
    });

     type UserInfo = {
       id: string;
       email: string;
       createdAt: Date;
     };
     const userInfoById = new Map<string, UserInfo>(userInfoMap.map(u => [u.id, u] as [string, UserInfo]));

    // Get completed watch counts for candidate users
    const completedCountsMap = await getUserCompletedWatchCount(userIds);

    /**
     * Filter similar users by match threshold and minimum completed watch count.
     * - overallMatch >= MIN_MATCH_THRESHOLD (0.4) ensures meaningful taste similarity
     * - completedCount >= MIN_COMPLETED_WATCH_COUNT (3) ensures sufficient viewing history
     */
    const filteredSimilarUsers = similarUsers.filter(u =>
      u.overallMatch >= MIN_MATCH_THRESHOLD && (completedCountsMap.get(u.userId) ?? 0) >= MIN_COMPLETED_WATCH_COUNT
    );

    // Enrich filtered results
    const enrichedResults = filteredSimilarUsers.map(u => ({
      userId: u.userId,
      overallMatch: Number((u.overallMatch * 100).toFixed(1)), // Convert to percentage
      watchCount: completedCountsMap.get(u.userId) ?? 0,
      memberSince: userInfoById.get(u.userId)?.createdAt,
      source: fromDatabase ? 'database' : 'computed',
    }));

    return NextResponse.json({
      similarUsers: enrichedResults,
      fromDatabase,
      computedAt: (similarUsers.length > 0 ? similarUsers[0].computedAt : computedAt).toISOString(),
      message: enrichedResults.length === 0
        ? 'No similar users found in database'
        : `Found ${enrichedResults.length} similar user(s)`,
    });
  } catch (error) {
    logger.error('Failed to get similar users', {
      error: error instanceof Error ? error.message : String(error),
      context: 'SimilarUsersAPI',
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
