import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/middleware/rateLimit';
import { computeAndStoreSimilarityScore, getCandidateUsersForSimilarity } from '@/lib/taste-map/similarity-storage';
import { computeSimilarity, isSimilar, MIN_MATCH_THRESHOLD } from '@/lib/taste-map/similarity';
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
    const freshOnly = searchParams.get('freshOnly') === 'true';

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

    // Get similar users from database
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
      take: limit,
    });

    let fromDatabase = true;
    let computedAt = new Date();

    // FALLBACK: If no data in database, compute on-the-fly and save
    // This handles the migration from Redis cache to persistent storage
    if (dbScores.length === 0) {
      logger.info('No cached similarities found, computing on-the-fly', {
        userId,
        context: 'SimilarUsersAPI',
      });

      fromDatabase = false;

      // Find candidate users with shared movies - checks ALL users, not limited to sample
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

      // Compute similarities and store in DB
      const computedScores: typeof dbScores = [];
      let similarCount = 0;
      for (const candidateId of candidateIds) {
        try {
          const result = await computeSimilarity(userId, candidateId, false);

          if (isSimilar(result)) {
            similarCount++;
            // Store to database
            await computeAndStoreSimilarityScore(userId, candidateId, 'on-demand');

            // Also fetch the stored record for consistent response
            const stored = await prisma.similarityScore.findUnique({
              where: {
                userIdA_userIdB: userId < candidateId ? { userIdA: userId, userIdB: candidateId } : { userIdA: candidateId, userIdB: userId },
              },
            });

            if (stored) {
              computedScores.push(stored);
            }
          }
        } catch (err) {
          logger.debug('Error computing similarity', {
            error: err instanceof Error ? err.message : String(err),
            candidateId,
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

      // Sort by match score
      computedScores.sort((a, b) => Number(b.overallMatch) - Number(a.overallMatch));
      dbScores = computedScores.slice(0, limit);
      computedAt = new Date();
    }

    // Extract user IDs and scores (convert Decimal to number)
    const similarUsers = dbScores.map(score => ({
      userId: score.userIdA === userId ? score.userIdB : score.userIdA,
      overallMatch: Number(score.overallMatch),
      fromDatabase: true,
      computedAt: score.computedAt,
    }));

    if (freshOnly && similarUsers.length > 0) {
      // Filter to only fresh scores (computed within last 7 days)
      const freshScores = similarUsers.filter(u => {
        const ageHours = (Date.now() - u.computedAt.getTime()) / (1000 * 60 * 60);
        return ageHours <= 168; // 7 days
      });
      
      if (freshScores.length === 0) {
        return NextResponse.json({
          similarUsers: [],
          fromDatabase: false,
          computedAt: new Date().toISOString(),
          message: 'No fresh similarity scores found. Scheduler runs weekly.',
        });
      }
    }

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
