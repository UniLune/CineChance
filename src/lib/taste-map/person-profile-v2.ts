// filepath: src/lib/taste-map/person-profile-v2.ts
/**
 * PersonProfile v2 - Manages persistent storage of top-50 actors/directors
 * Built from top-5 persons from each watched movie
 * Handles both full recalculation and incremental updates
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getActorWeightedRating, getTopRatedPersons } from './actor-rating';
import { MOVIE_STATUS_IDS } from '@/lib/movieStatusConstants';
import { getMediaCredits } from '@/lib/tmdb';

const COMPLETED_STATUS_IDS = [MOVIE_STATUS_IDS.WATCHED, MOVIE_STATUS_IDS.REWATCHED];
const TOP_PERSONS_LIMIT = 50;

export interface PersonData {
  tmdbPersonId: number;
  name: string;
  count: number; // How many movies they appear in
  avgWeightedRating: number; // Weighted by watchCount
}

/**
 * Ensure that MoviePersonCache has top-5 for a specific movie
 * If not cached, fetch from TMDB and store
 */
export async function ensureMoviePersonCacheExists(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<void> {
  try {
    // Check if already cached
    const existing = await prisma.moviePersonCache.findUnique({
      where: {
        tmdbId_mediaType: { tmdbId, mediaType },
      },
    });

    if (existing) {
      return; // Already cached
    }

    // Fetch from TMDB API
    const credits = await getMediaCredits(tmdbId, mediaType);
    
    if (!credits) {
      // If can't fetch from TMDB, create empty cache to avoid repeated attempts
      await prisma.moviePersonCache.create({
        data: {
          tmdbId,
          mediaType,
          topActors: [],
          topDirectors: [],
        },
      });
      return;
    }

    // Store in database
    await prisma.moviePersonCache.create({
      data: {
        tmdbId,
        mediaType,
        topActors: credits.topActors,
        topDirectors: credits.topDirectors,
      },
    });

    logger.info('Created movie person cache', {
      tmdbId,
      mediaType,
      actorsCount: credits.topActors.length,
      directorsCount: credits.topDirectors.length,
    });
  } catch (error) {
    logger.error('Error ensuring movie person cache', {
      error: error instanceof Error ? error.message : String(error),
      tmdbId,
      mediaType,
    });
    // Don't throw - this is non-critical
  }
}

/**
 * Full computation: recalculate top-50 persons for a user
 * Based on all their watched/rewatched movies and associated cast/crew
 */
export async function computeUserPersonProfile(
  userId: string,
  personType: 'actor' | 'director'
): Promise<PersonData[]> {
  try {
    logger.info('Starting person profile computation', {
      userId,
      personType,
    });

    // First, ensure MoviePersonCache is populated for all user's movies
    const userMovies = await prisma.watchList.findMany({
      where: {
        userId,
        statusId: { in: COMPLETED_STATUS_IDS },
      },
      select: {
        tmdbId: true,
        mediaType: true,
      },
      distinct: ['tmdbId', 'mediaType'],
    });

    // Ensure cache exists for all movies (non-blocking)
    await Promise.all(
      userMovies.map((movie) =>
        ensureMoviePersonCacheExists(movie.tmdbId, movie.mediaType as 'movie' | 'tv')
      )
    );

    // Get top-rated persons (already calculates weighted ratings)
    const topPersons = await getTopRatedPersons(
      userId,
      personType,
      TOP_PERSONS_LIMIT
    );

    // Transform to PersonData format
    const personData: PersonData[] = topPersons.map((p) => ({
      tmdbPersonId: p.tmdbId,
      name: p.name,
      count: p.count,
      avgWeightedRating: p.avgRating,
    }));

    // Count analyzed movies
    const analyzedCount = await prisma.watchList.count({
      where: {
        userId,
        statusId: { in: COMPLETED_STATUS_IDS },
      },
    });

     // Save to database
     const profile = await prisma.personProfile.upsert({
       where: {
         userId_personType: { userId, personType },
       },
        update: {
          // @ts-expect-error: PersonData[] is JSON-serializable and acceptable for Json field
          topPersons: personData,
          totalMoviesAnalyzed: analyzedCount,
          computedAt: new Date(),
          computationMethod: 'full',
        },
        create: {
          userId,
          personType,
          // @ts-expect-error: PersonData[] is JSON-serializable and acceptable for Json field
          topPersons: personData,
          totalMoviesAnalyzed: analyzedCount,
          computationMethod: 'full',
        },
     });

    logger.info('Completed person profile computation', {
      userId,
      personType,
      personsCount: personData.length,
      moviesAnalyzed: analyzedCount,
    });

    return personData;
  } catch (error) {
    logger.error('Error computing person profile', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      personType,
    });
    throw error;
  }
}

/**
 * Get cached person profile if fresh, otherwise recalculate
 * Considers profiles older than maxAgeHours as stale
 */
export async function getUserPersonProfile(
  userId: string,
  personType: 'actor' | 'director',
  maxAgeHours: number = 7 * 24 // 7 days
): Promise<PersonData[]> {
  try {
    const profile = await prisma.personProfile.findUnique({
      where: {
        userId_personType: { userId, personType },
      },
    });

    // Check freshness
    if (profile) {
      const ageHours = (Date.now() - profile.computedAt.getTime()) / (1000 * 60 * 60);
       if (ageHours < maxAgeHours) {
         return profile.topPersons as unknown as PersonData[];
       }
    }

    // Recalculate if not found or stale
    return computeUserPersonProfile(userId, personType);
  } catch (error) {
    logger.error('Error getting user person profile', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      personType,
    });
    return [];
  }
}

/**
 * Incrementally update person profile when user adds/removes a movie
 * More efficient than full recalculation for single changes
 */
export async function incrementallyUpdatePersonProfile(
  userId: string,
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  action: 'add' | 'remove' = 'add'
): Promise<void> {
  try {
    // Ensure movie persons are cached
    await ensureMoviePersonCacheExists(tmdbId, mediaType);

    // For now, do full recalculation if profile exists
    // In future, could optimize to update existing array
    const profile = await prisma.personProfile.findUnique({
      where: {
        userId_personType: { userId, personType: 'actor' },
      },
    });

    // If profile exists and has many updates, do full recalc after certain threshold
    if (profile && action === 'add') {
      // For incremental: could update array directly
      // For now: trigger full recompute periodically
      const hoursOld = (Date.now() - profile.computedAt.getTime()) / (1000 * 60 * 60);
      if (hoursOld > 24) {
        // Recompute daily
        await computeUserPersonProfile(userId, 'actor');
        await computeUserPersonProfile(userId, 'director');
      }
    } else if (!profile && action === 'add') {
      // Create new profile
      await computeUserPersonProfile(userId, 'actor');
      await computeUserPersonProfile(userId, 'director');
    }

    logger.info('Incrementally updated person profile', {
      userId,
      tmdbId,
      action,
    });
  } catch (error) {
    logger.error('Error in incremental person profile update', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      tmdbId,
      action,
    });
    // Don't throw - this is non-critical
  }
}

/**
 * Get statistics about person profiles
 */
export async function getPersonProfileStats(): Promise<{
  totalProfiles: number;
  byPersonType: { actor: number; director: number };
  avgPersonsPerProfile: number;
  lastComputedAt: Date | null;
}> {
  try {
    const profiles = await prisma.personProfile.findMany({
      select: { personType: true, topPersons: true, computedAt: true },
    });

    const stats = {
      totalProfiles: profiles.length,
      byPersonType: {
        actor: profiles.filter((p) => p.personType === 'actor').length,
        director: profiles.filter((p) => p.personType === 'director').length,
      },
       avgPersonsPerProfile:
         profiles.length > 0
           ? profiles.reduce((sum, p) => sum + (p.topPersons as unknown as PersonData[]).length, 0) /
             profiles.length
           : 0,
      lastComputedAt: profiles.length > 0 ? profiles[0].computedAt : null,
    };

    return stats;
  } catch (error) {
    logger.error('Error getting person profile stats', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      totalProfiles: 0,
      byPersonType: { actor: 0, director: 0 },
      avgPersonsPerProfile: 0,
      lastComputedAt: null,
    };
  }
}
