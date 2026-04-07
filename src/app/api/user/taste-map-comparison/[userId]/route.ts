import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/middleware/rateLimit';
import { MOVIE_STATUS_IDS } from '@/lib/movieStatusConstants';
import { computeSimilarity } from '@/lib/taste-map/similarity';
import { getTasteMap } from '@/lib/taste-map/redis';
import { computeTasteMap } from '@/lib/taste-map/compute';
import { computeAndStoreSimilarityScore } from '@/lib/taste-map/similarity-storage';

// Only compare watched/rewatched movies for accurate taste comparison
const COMPLETED_STATUS_IDS = [MOVIE_STATUS_IDS.WATCHED, MOVIE_STATUS_IDS.REWATCHED];

/**
 * GET /api/user/taste-map-comparison/[userId]
 * 
 * Get detailed comparison of taste maps between current user and another user.
 * Compares only watched/rewatched movies for accurate taste compatibility.
 * Shows shared movies, rating differences, and metric breakdown.
 * 
 * IMPORTANT: All metrics and shared movies are filtered to only watched/rewatched status
 * to ensure we're comparing actual viewing experiences, not "want to watch" lists.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> | { userId: string } }
) {
  // Handle async params in Next.js 15+
  const resolvedParams = await Promise.resolve(params);
  const { userId } = resolvedParams;

  const { searchParams } = new URL(request.url);

  // Rate limiting
  const { success } = await rateLimit(request, '/api/user/taste-map-comparison');
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
      logger.warn('Comparison: Unauthorized request');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const currentUserId = session.user.id;
    const comparedUserId = userId;

    logger.debug('Comparison request', {
      currentUserId,
      comparedUserId,
      context: 'TasteMapComparison'
    });

    // Validate
    if (!comparedUserId || comparedUserId === currentUserId) {
      logger.warn('Comparison: Invalid user ID', { comparedUserId, currentUserId });
      return NextResponse.json(
        { error: 'Invalid user ID' },
        { status: 400 }
      );
    }

    // Get similarity metrics WITH detailed rating patterns
    const similarityResult = await computeSimilarity(currentUserId, comparedUserId, { includePatterns: true });

    // Store similarity score to persistent database for consistency across API calls
    try {
      await computeAndStoreSimilarityScore(currentUserId, comparedUserId, { computedBy: 'on-demand' });
    } catch (err) {
      logger.debug('Failed to store similarity score', {
        error: err instanceof Error ? err.message : String(err),
        context: 'TasteMapComparisonAPI',
      });
      // Don't fail the endpoint if storage fails
    }

    // Get taste maps (compute if needed)
    const [currentTasteMap, comparedTasteMap] = await Promise.all([
      getTasteMap(currentUserId, () => computeTasteMap(currentUserId)),
      getTasteMap(comparedUserId, () => computeTasteMap(comparedUserId)),
    ]);

    if (!currentTasteMap || !comparedTasteMap) {
      return NextResponse.json(
        { error: 'Could not compute taste maps' },
        { status: 500 }
      );
    }

    // Get watch counts (only completed watches for comparison)
    const [currentCount, comparedCount] = await Promise.all([
      prisma.watchList.count({ 
        where: { 
          userId: currentUserId,
          statusId: { in: COMPLETED_STATUS_IDS },
        } 
      }),
      prisma.watchList.count({ 
        where: { 
          userId: comparedUserId,
          statusId: { in: COMPLETED_STATUS_IDS },
        } 
      }),
    ]);

    // Get shared watched movies (only completed watches for comparison)
    const currentWatchlist = await prisma.watchList.findMany({
      where: { 
        userId: currentUserId,
        statusId: { in: COMPLETED_STATUS_IDS },
      },
      select: { tmdbId: true, userRating: true, title: true },
    });

    const comparedWatchlist = await prisma.watchList.findMany({
      where: { 
        userId: comparedUserId,
        statusId: { in: COMPLETED_STATUS_IDS },
      },
      select: { tmdbId: true, userRating: true, title: true },
    });

    // Find common movies
    const currentTmbdIds = new Map(currentWatchlist.map(m => [m.tmdbId, m]));
    const sharedMovies = comparedWatchlist
      .filter(m => currentTmbdIds.has(m.tmdbId))
      .map(m => {
        const current = currentTmbdIds.get(m.tmdbId)!;
        const diff = (current.userRating || 0) - (m.userRating || 0);
        return {
          tmdbId: m.tmdbId,
          title: m.title || current.title || `Movie ${m.tmdbId}`,
          myRating: current.userRating || 0,
          theirRating: m.userRating || 0,
          difference: diff,
        };
      })
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

    return NextResponse.json({
      userId: currentUserId,
      comparedUserId,
      metrics: {
        tasteSimilarity: similarityResult.tasteSimilarity,
        ratingCorrelation: similarityResult.ratingCorrelation,
        personOverlap: similarityResult.personOverlap,
        overallMatch: similarityResult.overallMatch,
        genreRatingSimilarity: similarityResult.genreRatingSimilarity,
      },
      ratingPatterns: similarityResult.ratingPatterns,
       genreProfiles: {
         current: currentTasteMap.genreProfile,
         compared: comparedTasteMap.genreProfile,
       },
       myWatchedCount: currentCount,
      theirWatchedCount: comparedCount,
      commonWatchedCount: sharedMovies.length,
      sharedMovies: sharedMovies,
    });
  } catch (error) {
    logger.error('Failed to get taste map comparison', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context: 'TasteMapComparisonAPI',
      userId,
    });

    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
