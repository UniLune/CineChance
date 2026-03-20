/**
 * Scheduler for computing and storing similarity scores
 * Runs weekly to update all active user pairs
 * Can also be triggered manually via admin API
 */

import { logger } from '@/lib/logger';
import {
  computeAndStoreSimilarityScore,
  getActiveUsersForSimilarityCompute,
  getCandidateUsersForSimilarity,
} from '@/lib/taste-map/similarity-storage';

export interface ComputeProgressCallback {
  (progress: {
    processed: number;
    total: number;
    currentUsers: string;
    errors: number;
  }): void;
}

/**
 * Compute similarity scores for all active users
 * Returns summary of computation
 */
export async function computeAllSimilarityScores(
  options: {
    limit?: number;
    offset?: number;
    onProgress?: ComputeProgressCallback;
  } = {}
): Promise<{
  processed: number;
  computed: number;
  errors: number;
  errorsList: Array<{ userA: string; userB: string; error: string }>;
  duration: number;
  timestamp: Date;
}> {
  const startTime = Date.now();
  const { limit = 100, offset = 0, onProgress } = options;

  const errorsList: Array<{ userA: string; userB: string; error: string }> = [];
  let processed = 0;
  let computed = 0;
  let errors = 0;

  try {
    logger.info('Starting similarity computation', {
      limit,
      offset,
      context: 'SimilarityScheduler',
    });

    // Get active users
    const activeUsers = await getActiveUsersForSimilarityCompute(3, 30, 1000);

    if (activeUsers.length === 0) {
      logger.warn('No active users found for similarity computation', {
        context: 'SimilarityScheduler',
      });
      return {
        processed: 0,
        computed: 0,
        errors: 0,
        errorsList: [],
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    }

    logger.info('Found active users', {
      count: activeUsers.length,
      context: 'SimilarityScheduler',
    });

    // Process users in batches
    const users = activeUsers.slice(offset, offset + limit);

    for (let i = 0; i < users.length; i++) {
      const userA = users[i];
      processed++;

      // Report progress
      if (onProgress && i % 10 === 0) {
        onProgress({
          processed,
          total: users.length,
          currentUsers: `${i}/${users.length}`,
          errors,
        });
      }

      try {
        // Get candidate users for this user
         const candidates = await getCandidateUsersForSimilarity(userA, 100);

        // Compute similarity for each candidate
        for (const userB of candidates) {
          try {
            await computeAndStoreSimilarityScore(userA, userB, 'scheduler');
            computed++;
          } catch (err) {
            errors++;
            errorsList.push({
              userA,
              userB,
              error: err instanceof Error ? err.message : String(err),
            });
            logger.debug('Failed to compute similarity pair', {
              userA,
              userB,
              error: err instanceof Error ? err.message : String(err),
              context: 'SimilarityScheduler',
            });
          }
        }
      } catch (err) {
        errors++;
        const userB = 'unknown';
        errorsList.push({
          userA,
          userB,
          error: err instanceof Error ? err.message : String(err),
        });
        logger.warn('Failed to process user', {
          userA,
          error: err instanceof Error ? err.message : String(err),
          context: 'SimilarityScheduler',
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.info('Completed similarity computation', {
      processed,
      computed,
      errors,
      duration,
      ratePerSecond: computed / (duration / 1000),
      context: 'SimilarityScheduler',
    });

    return {
      processed,
      computed,
      errors,
      errorsList: errorsList.slice(0, 10), // Return first 10 errors
      duration,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('Similarity computation failed', {
      error: error instanceof Error ? error.message : String(error),
      processed,
      computed,
      errors,
      context: 'SimilarityScheduler',
    });

    throw error;
  }
}

/**
 * Schedule similarity computation to run weekly
 * Use with node-cron or similar job scheduler
 */
export function scheduleWeeklySimilarityComputation(): void {
  logger.info('Setting up weekly similarity computation schedule', {
    context: 'SimilarityScheduler',
  });

  // This would be called from a job scheduler like node-cron
  // Example: every Monday at 2:00 AM UTC
  // 0 2 * * 1
  // For now, this is a placeholder that documents the intent
}
