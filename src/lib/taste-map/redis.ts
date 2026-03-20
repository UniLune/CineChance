/**
 * TasteMap Redis Storage Helpers
 * 
 * Storage functions using withCache pattern from @/lib/redis
 * All keys use 24h TTL (86400 seconds)
 */

import { withCache, invalidateCache, getRedis } from '@/lib/redis';
import { logger } from '@/lib/logger';
import type { TasteMap, GenreProfile, PersonProfiles, TypeProfile } from './types';

// TTL: 24 hours in seconds
export const TTL_24H = 86400;

// Key patterns from CONTEXT.md
const KEY_PATTERNS = {
  tasteMap: (userId: string) => `user:${userId}:taste-map`,
  genreProfile: (userId: string) => `user:${userId}:genre-profile`,
  personProfile: (userId: string) => `user:${userId}:person-profile`,
  typeProfile: (userId: string) => `user:${userId}:type-profile`,
};

/**
 * Store full TasteMap to Redis
 */
export async function storeTasteMap(userId: string, tasteMap: TasteMap): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(
      KEY_PATTERNS.tasteMap(userId),
      JSON.stringify(tasteMap),
      { ex: TTL_24H }
    );
  } catch (error) {
    logger.error('Failed to store taste map', { 
      error: error instanceof Error ? error.message : String(error),
      userId,
      context: 'TasteMapRedis'
    });
  }
}

/**
 * Get TasteMap from cache or compute fresh
 */
export async function getTasteMap(
  userId: string,
  computeFn?: () => Promise<TasteMap>
): Promise<TasteMap | null> {
  const redis = getRedis();
  if (!redis) return null;

  // If computeFn provided, use withCache for automatic cache-aside
  if (computeFn) {
    return withCache<TasteMap>(
      KEY_PATTERNS.tasteMap(userId),
      computeFn,
      TTL_24H
    );
  }

  // Otherwise just get from cache
  try {
    const cached = await redis.get<string>(KEY_PATTERNS.tasteMap(userId));
    if (cached) {
      return JSON.parse(cached) as TasteMap;
    }
  } catch (error) {
    logger.error('Failed to get taste map', { 
      error: error instanceof Error ? error.message : String(error),
      userId,
      context: 'TasteMapRedis'
    });
  }

  return null;
}

/**
 * Store genre profile to Redis
 */
export async function storeGenreProfile(userId: string, profile: GenreProfile): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(
      KEY_PATTERNS.genreProfile(userId),
      JSON.stringify(profile),
      { ex: TTL_24H }
    );
  } catch (error) {
    logger.error('Failed to store genre profile', { 
      error: error instanceof Error ? error.message : String(error),
      userId,
      context: 'TasteMapRedis'
    });
  }
}

/**
 * Get genre profile from cache or compute fresh
 */
export async function getGenreProfile(
  userId: string,
  computeFn?: () => Promise<GenreProfile>
): Promise<GenreProfile | null> {
  const redis = getRedis();
  if (!redis) return null;

  if (computeFn) {
    return withCache<GenreProfile>(
      KEY_PATTERNS.genreProfile(userId),
      computeFn,
      TTL_24H
    );
  }

  try {
    const cached = await redis.get<string>(KEY_PATTERNS.genreProfile(userId));
    if (cached) {
      return JSON.parse(cached) as GenreProfile;
    }
  } catch (error) {
    logger.error('Failed to get genre profile', { 
      error: error instanceof Error ? error.message : String(error),
      userId,
      context: 'TasteMapRedis'
    });
  }

  return null;
}

/**
 * Store person profile to Redis
 */
export async function storePersonProfile(userId: string, profile: PersonProfiles): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(
      KEY_PATTERNS.personProfile(userId),
      JSON.stringify(profile),
      { ex: TTL_24H }
    );
  } catch (error) {
    logger.error('Failed to store person profile', { 
      error: error instanceof Error ? error.message : String(error),
      userId,
      context: 'TasteMapRedis'
    });
  }
}

/**
 * Get person profile from cache or compute fresh
 */
export async function getPersonProfile(
  userId: string,
  computeFn?: () => Promise<PersonProfiles>
): Promise<PersonProfiles | null> {
  const redis = getRedis();
  if (!redis) return null;

  if (computeFn) {
    return withCache<PersonProfiles>(
      KEY_PATTERNS.personProfile(userId),
      computeFn,
      TTL_24H
    );
  }

  try {
    const cached = await redis.get<string>(KEY_PATTERNS.personProfile(userId));
    if (cached) {
      return JSON.parse(cached) as PersonProfiles;
    }
  } catch (error) {
    logger.error('Failed to get person profile', { 
      error: error instanceof Error ? error.message : String(error),
      userId,
      context: 'TasteMapRedis'
    });
  }

  return null;
}

/**
 * Store type profile to Redis
 */
export async function storeTypeProfile(userId: string, profile: TypeProfile): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(
      KEY_PATTERNS.typeProfile(userId),
      JSON.stringify(profile),
      { ex: TTL_24H }
    );
  } catch (error) {
    logger.error('Failed to store type profile', { 
      error: error instanceof Error ? error.message : String(error),
      userId,
      context: 'TasteMapRedis'
    });
  }
}

/**
 * Get type profile from cache or compute fresh
 */
export async function getTypeProfile(
  userId: string,
  computeFn?: () => Promise<TypeProfile>
): Promise<TypeProfile | null> {
  const redis = getRedis();
  if (!redis) return null;

  if (computeFn) {
    return withCache<TypeProfile>(
      KEY_PATTERNS.typeProfile(userId),
      computeFn,
      TTL_24H
    );
  }

  try {
    const cached = await redis.get<string>(KEY_PATTERNS.typeProfile(userId));
    if (cached) {
      return JSON.parse(cached) as TypeProfile;
    }
  } catch (error) {
    logger.error('Failed to get type profile', { 
      error: error instanceof Error ? error.message : String(error),
      userId,
      context: 'TasteMapRedis'
    });
  }

  return null;
}

/**
 * Invalidate all taste-map related cache keys for a user
 */
export async function invalidateTasteMap(userId: string): Promise<void> {
  // Invalidate using pattern matching
  await invalidateCache(`user:${userId}:taste-map`);
  await invalidateCache(`user:${userId}:genre-profile`);
  await invalidateCache(`user:${userId}:person-profile`);
  await invalidateCache(`user:${userId}:type-profile`);
  await invalidateCache(`user:${userId}:genre-bias`);
  await invalidateCache(`user:${userId}:person-bias`);
  await invalidateCache(`similar-users:v2:${userId}`); // Fixed: added :v2 to match actual cache key
  await invalidateCache(`similarity:${userId}:*`);
}
