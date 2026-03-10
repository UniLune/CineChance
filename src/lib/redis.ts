import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';

let redisInstance: Redis | null = null;

export function getRedis(): Redis | null {
  if (redisInstance) return redisInstance;
  
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!url || !token) {
    logger.warn('Redis environment variables not configured, caching disabled');
    return null;
  }
  
  try {
    redisInstance = new Redis({
      url,
      token,
    });
    return redisInstance;
  } catch (error) {
    logger.error('Failed to initialize Redis connection', { 
      error: error instanceof Error ? error.message : String(error),
      context: 'RedisCache'
    });
    return null;
  }
}

export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 3600
): Promise<T> {
  const redis = getRedis();
  
  if (!redis) {
    logger.info('Redis not available, skipping cache', { key, context: 'RedisCache' });
    return fetcher();
  }
  
  try {
    const cached = await redis.get<string>(key);
    if (cached) {
      logger.info('Cache hit', { key, context: 'RedisCache' });
      return JSON.parse(cached) as T;
    }
    logger.info('Cache miss', { key, context: 'RedisCache' });
  } catch (error) {
    logger.debug('Redis get failed (will compute fresh)', { 
      error: error instanceof Error ? error.message : String(error),
      key,
      context: 'RedisCache'
    });
  }
  
  const fresh = await fetcher();
  
  try {
    await redis.set(key, JSON.stringify(fresh), { ex: ttlSeconds });
    logger.info('Cached fresh data', { key, ttlSeconds, context: 'RedisCache' });
  } catch (error) {
    logger.error('Redis set failed', { 
      error: error instanceof Error ? error.message : String(error),
      key,
      ttlSeconds,
      context: 'RedisCache'
    });
  }
  
  return fresh;
}

/**
 * Invalidate cache keys matching a pattern.
 * 
 * @param pattern - Redis pattern to match (e.g., 'user:*')
 */
export async function invalidateCache(pattern: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    logger.warn('Redis not available, cannot invalidate cache', { pattern, context: 'RedisCache' });
    return;
  }
  
  try {
    const keys: string[] = [];
    let cursor = '0';
    
    do {
      const [newCursor, batch] = await redis.scan(cursor, { match: pattern, count: 100 });
      cursor = newCursor;
      keys.push(...batch);
    } while (cursor !== '0');
    
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(`Cache invalidated: ${keys.length} keys matching "${pattern}"`, {
        context: 'RedisCache'
      });
    } else {
      logger.info(`No keys found matching "${pattern}"`, { context: 'RedisCache' });
    }
  } catch (error) {
    logger.error('Redis invalidate failed', { 
      error: error instanceof Error ? error.message : String(error),
      pattern,
      context: 'RedisCache'
    });
  }
}

/**
 * Invalidate all cache for a specific user.
 * 
 * @param userId - User ID to invalidate cache for
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  await invalidateCache(`user:${userId}:*`);
}
