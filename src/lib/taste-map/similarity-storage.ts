/**
 * Similarity score storage and computation
 * Handles persistent storage of computed similarity scores in database
 * Used by scheduler and on-demand API endpoints
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { computeSimilarity } from './similarity';
import { getTasteMap, computeTasteMap } from './index';
import { MOVIE_STATUS_IDS } from '@/lib/movieStatusConstants';
import type { TasteMap } from './types';

const COMPLETED_STATUS_IDS = [MOVIE_STATUS_IDS.WATCHED, MOVIE_STATUS_IDS.REWATCHED];

/**
 * Compute and store similarity score between two users
 * Saves to database for consistent retrieval across all endpoints
 */
export async function computeAndStoreSimilarityScore(
  userIdA: string,
  userIdB: string,
  computedBy: 'scheduler' | 'manual' | 'on-demand' = 'on-demand'
): Promise<{
  overallMatch: number;
  tasteSimilarity: number;
  ratingCorrelation: number;
  personOverlap: number;
}> {
  try {
    // Ensure consistent ordering (userIdA < userIdB)
    const [orderedA, orderedB] = userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];

    // Load taste maps with caching
    const [tasteMapA, tasteMapB] = await Promise.all([
      getTasteMap(orderedA, () => computeTasteMap(orderedA)),
      getTasteMap(orderedB, () => computeTasteMap(orderedB)),
    ]);

    if (!tasteMapA || !tasteMapB) {
      throw new Error('Could not compute taste maps');
    }

    // Compute similarity with patterns for full detail
    const similarityResult = await computeSimilarity(orderedA, orderedB, true);

    // Create snapshots for reproducibility
    const tasteMapASnapshot = generateTasteMapSnapshot(tasteMapA);
    const tasteMapBSnapshot = generateTasteMapSnapshot(tasteMapB);

    // Store in database (upsert)
    const stored = await prisma.similarityScore.upsert({
      where: {
        userIdA_userIdB: {
          userIdA: orderedA,
          userIdB: orderedB,
        },
      },
      update: {
        overallMatch: similarityResult.overallMatch.toString(),
        tasteSimilarity: similarityResult.tasteSimilarity.toString(),
        ratingCorrelation: similarityResult.ratingCorrelation.toString(),
        personOverlap: similarityResult.personOverlap.toString(),
        tasteMapASnapshot,
        tasteMapBSnapshot,
        computedAt: new Date(),
        updatedAt: new Date(),
        computedBy,
      },
      create: {
        userIdA: orderedA,
        userIdB: orderedB,
        overallMatch: similarityResult.overallMatch.toString(),
        tasteSimilarity: similarityResult.tasteSimilarity.toString(),
        ratingCorrelation: similarityResult.ratingCorrelation.toString(),
        personOverlap: similarityResult.personOverlap.toString(),
        tasteMapASnapshot,
        tasteMapBSnapshot,
        computedAt: new Date(),
        computedBy,
      },
    });

    logger.debug('Stored similarity score', {
      userIdA: orderedA,
      userIdB: orderedB,
      overallMatch: Number(stored.overallMatch),
      computedBy,
      context: 'SimilarityStorage',
    });

    return {
      overallMatch: Number(stored.overallMatch),
      tasteSimilarity: Number(stored.tasteSimilarity),
      ratingCorrelation: Number(stored.ratingCorrelation),
      personOverlap: Number(stored.personOverlap),
    };
  } catch (error) {
    logger.error('Failed to compute and store similarity', {
      error: error instanceof Error ? error.message : String(error),
      userIdA,
      userIdB,
      context: 'SimilarityStorage',
    });
    throw error;
  }
}

/**
 * Get similarity score from database if fresh, otherwise return null
 * Considers scores older than 7 days as stale
 */
export async function getSimilarityScoreFromDB(
  userIdA: string,
  userIdB: string,
  maxAgeHours: number = 168 // 7 days
): Promise<{
  overallMatch: number;
  tasteSimilarity: number;
  ratingCorrelation: number;
  personOverlap: number;
} | null> {
  const [orderedA, orderedB] = userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];

  const score = await prisma.similarityScore.findUnique({
    where: {
      userIdA_userIdB: {
        userIdA: orderedA,
        userIdB: orderedB,
      },
    },
  });

  if (!score) {
    return null;
  }

  // Check if score is fresh
  const ageHours = (Date.now() - score.computedAt.getTime()) / (1000 * 60 * 60);
  if (ageHours > maxAgeHours) {
    return null;
  }

  return {
    overallMatch: Number(score.overallMatch),
    tasteSimilarity: Number(score.tasteSimilarity),
    ratingCorrelation: Number(score.ratingCorrelation),
    personOverlap: Number(score.personOverlap),
  };
}

/**
 * Get active users (with minimum history and recent activity)
 * Used by scheduler to find users to compute similarities for
 */
export async function getActiveUsersForSimilarityCompute(
  minWatchCount: number = 30,
  daysBack: number = 30,
  limit: number = 500
): Promise<string[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const activeUsers = await prisma.watchList.findMany({
    where: {
      addedAt: { gte: cutoffDate },
      statusId: { in: COMPLETED_STATUS_IDS },
    },
    select: { userId: true },
    distinct: ['userId'],
    take: limit,
  });

  // Filter to users with minimum watch count
  const userIds = activeUsers.map(u => u.userId);

  if (userIds.length === 0) {
    return [];
  }

  const usersWithCounts = await prisma.watchList.findMany({
    where: {
      userId: { in: userIds },
      statusId: { in: COMPLETED_STATUS_IDS },
    },
    select: { userId: true },
  });

  // Count by user
  const countsByUser = new Map<string, number>();
  for (const record of usersWithCounts) {
    countsByUser.set(record.userId, (countsByUser.get(record.userId) ?? 0) + 1);
  }

  return Array.from(countsByUser.entries())
    .filter(([, count]) => count >= minWatchCount)
    .map(([userId]) => userId);
}

/**
 * Find candidate users similar to a given user
 * Returns user IDs to compute similarities for
 */
export async function getCandidateUsersForSimilarity(
  userId: string,
  limit: number = 10000 // No practical limit - check all users with shared movies
): Promise<string[]> {
  // Get movies watched by the user
  const userMovies = await prisma.watchList.findMany({
    where: {
      userId,
      statusId: { in: COMPLETED_STATUS_IDS },
    },
    select: { tmdbId: true },
  });

  if (userMovies.length === 0) {
    return [];
  }

  const movieIds = userMovies.map(m => m.tmdbId);

  // Get users with overlapping movies (shared watched content)
  const usersWithSharedMovies = await prisma.watchList.findMany({
    where: {
      tmdbId: { in: movieIds },
      userId: { not: userId },
      statusId: { in: COMPLETED_STATUS_IDS },
    },
    select: { userId: true },
  });

  // Count shared movies per user and filter
  const countsByUser = new Map<string, number>();
  for (const record of usersWithSharedMovies) {
    countsByUser.set(record.userId, (countsByUser.get(record.userId) ?? 0) + 1);
  }

  // Keep only users with at least 1 shared movie (lowered from 3 for better matching)
  return Array.from(countsByUser.entries())
    .filter(([, count]) => count >= 1)
    .sort(([, a], [, b]) => b - a) // Sort by count descending
    .slice(0, limit)
    .map(([userId]) => userId);
}

/**
 * Generate a snapshot of taste map for reproducibility
 * Only stores essential data: genre profile (persons removed for simplification)
 */
export function generateTasteMapSnapshot(tasteMap: TasteMap): object {
  return {
    genreProfile: tasteMap.genreProfile,
  };
}

/**
 * Delete old similarity scores (older than maxAgeDays)
 * Used by cleanup job to manage database size
 */
export async function deleteOldSimilarityScores(maxAgeDays: number = 365): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  const result = await prisma.similarityScore.deleteMany({
    where: {
      computedAt: { lt: cutoffDate },
    },
  });

  logger.info('Cleaned up old similarity scores', {
    deleted: result.count,
    cutoffDate,
    context: 'SimilarityStorage',
  });

  return result.count;
}

/**
 * Delete SimilarityScore records that reference non-existent users
 * Cleans up orphaned records from deleted user accounts
 */
export async function cleanupOrphanedScores(): Promise<{
  deleted: number;
  orphans: string[];
}> {
  // Step 1: Get all distinct user IDs from SimilarityScore (both columns)
  const allScoreUserIds = await prisma.$queryRaw<string[]>`
    SELECT DISTINCT "userIdA" as id FROM "SimilarityScore"
    UNION
    SELECT DISTINCT "userIdB" as id FROM "SimilarityScore"
  `;

  if (allScoreUserIds.length === 0) {
    // No similarity scores at all
    return { deleted: 0, orphans: [] };
  }

  // Step 2: Find which of these IDs exist in the User table
  // Batch check to avoid query size limits
  const BATCH_SIZE = 1000;
  const existingUserIds = new Set<string>();

  for (let i = 0; i < allScoreUserIds.length; i += BATCH_SIZE) {
    const batch = allScoreUserIds.slice(i, i + BATCH_SIZE);
    const existing = await prisma.user.findMany({
      where: { id: { in: batch } },
      select: { id: true },
    });
    for (const user of existing) {
      existingUserIds.add(user.id);
    }
  }

  // Step 3: Compute orphaned IDs (those not in User table)
  const orphanedIds = allScoreUserIds.filter(id => !existingUserIds.has(id));

  if (orphanedIds.length === 0) {
    // No orphans found
    return { deleted: 0, orphans: [] };
  }

  // Step 4: Delete all SimilarityScore records where userIdA OR userIdB is in orphaned set
  const deleteResult = await prisma.similarityScore.deleteMany({
    where: {
      OR: [
        { userIdA: { in: orphanedIds } },
        { userIdB: { in: orphanedIds } },
      ],
    },
  });

  logger.info('Cleaned up orphaned similarity scores', {
    deleted: deleteResult.count,
    orphans: orphanedIds,
    context: 'SimilarityStorage',
  });

  return {
    deleted: deleteResult.count,
    orphans: orphanedIds,
  };
}
/**
 * Get completed watch count for multiple users in a single query.
 * Uses groupBy to avoid N+1. Returns Map where missing users are not included (caller should use ?? 0).
 */
export async function getUserCompletedWatchCount(
  userIds: string[]
): Promise<Map<string, number>> {
  const results = await prisma.watchList.groupBy({
    where: {
      userId: { in: userIds },
      statusId: { in: COMPLETED_STATUS_IDS },
    },
    by: ['userId'],
    _count: true,
  });

  const countMap = new Map<string, number>();
  for (const item of results) {
    // Support both test mock shape (count) and real Prisma shape (_count)
    const count = (item as any).count ?? (item as any)._count;
    countMap.set(item.userId, count);
  }
  return countMap;
}

export async function getSimilarityScoreStats(): Promise<{
  totalScores: number;
  uniqueUsers: number;
  averageMatch: number;
  lastComputed: Date | null;
  schedulerLastRun: Date | null;
}> {
  const [totalScores, schedulerScores, lastComputedRecord] = await Promise.all([
    prisma.similarityScore.count(),
    prisma.similarityScore.findMany({
      where: { computedBy: 'scheduler' },
      orderBy: { computedAt: 'desc' },
      take: 1,
      select: { computedAt: true },
    }),
    prisma.similarityScore.findFirst({
      orderBy: { computedAt: 'desc' },
      select: { computedAt: true },
    }),
  ]);

  const avgResult = await prisma.$queryRaw<[{ avg: string | number }]>`
    SELECT AVG(CAST("overallMatch" as FLOAT)) as avg FROM "SimilarityScore"
  `;

  const users = await prisma.similarityScore.findMany({
    select: { userIdA: true, userIdB: true },
    distinct: ['userIdA', 'userIdB'],
  });

  const uniqueUserIds = new Set<string>();
  for (const score of users) {
    uniqueUserIds.add(score.userIdA);
    uniqueUserIds.add(score.userIdB);
  }

  const avgValue = avgResult[0]?.avg ? parseFloat(String(avgResult[0].avg)) : 0;

  return {
    totalScores,
    uniqueUsers: uniqueUserIds.size,
    averageMatch: avgValue,
    lastComputed: lastComputedRecord?.computedAt ?? null,
    schedulerLastRun: schedulerScores[0]?.computedAt ?? null,
  };
}
