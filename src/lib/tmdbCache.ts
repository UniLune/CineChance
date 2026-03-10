// src/lib/tmdbCache.ts
// In-memory cache for TMDB API responses with 24-hour TTL

import { logger } from '@/lib/logger';
import type { MovieDetails } from '@/lib/tmdb';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class TMDBCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours in ms (86400000 ms)
  private readonly MAX_CACHE_SIZE = 1000; // Maximum number of entries

  /**
   * Set data in cache with timestamp
   * @param key - Cache key
   * @param data - Data to cache
   * @param ttl - Custom TTL in milliseconds (defaults to 24 hours)
   */
  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    // Remove oldest entries if cache is too large
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Get cached data if it exists and is still fresh
   * @param key - Cache key
   * @returns Cached data if fresh, null if expired or not found
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    const now = Date.now();
    const age = now - entry.timestamp;
    
    // Strict fresh: return null if data is older than TTL
    if (age > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }

  /**
   * Check if a key exists and is fresh in cache
   * @param key - Cache key
   * @returns true if key exists and is fresh
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }
    
    const now = Date.now();
    const age = now - entry.timestamp;
    
    // Strict fresh: return false if data is older than TTL
    if (age > entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  clear(): void {
    this.cache.clear();
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    this.cache.forEach((entry, key) => {
      const age = now - entry.timestamp;
      if (age > entry.ttl) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number } {
    return {
      size: this.cache.size,
    };
  }
}

// Global cache instance
const tmdbCache = new TMDBCache();

// Clean up expired entries every 10 minutes
setInterval(() => {
  tmdbCache.cleanup();
}, 10 * 60 * 1000);

/**
 * Get cached data for TMDB API
 * @param key - Cache key
 * @returns Cached data if fresh, null otherwise
 */
export function getTMDB<T>(key: string): T | null {
  return tmdbCache.get<T>(key);
}

/**
 * Set cached data for TMDB API (24-hour default TTL)
 * @param key - Cache key
 * @param data - Data to cache
 * @param ttl - Custom TTL in milliseconds (optional)
 */
export function setTMDB<T>(key: string, data: T, ttl?: number): void {
  tmdbCache.set<T>(key, data, ttl);
}

/**
 * Check if TMDB cache has fresh data for key
 * @param key - Cache key
 * @returns true if key exists and is fresh
 */
export function hasTMDB(key: string): boolean {
  return tmdbCache.has(key);
}

/**
 * Clear TMDB cache
 */
/**
 * Clear all TMDB cache entries.
 */
export function clearTMDBCache(): void {
  tmdbCache.clear();
  logger.info('TMDB cache cleared');
}

export default tmdbCache;

// Backward compatibility exports
/**
 * @deprecated Use getTMDB instead
 */
/**
 * Get cached media details (deprecated - use getTMDB instead).
 * 
 * @param tmdbId - TMDB ID of the media
 * @param mediaType - Type of media ('movie' or 'tv')
 * @returns Cached MovieDetails or null
 * @deprecated Use getTMDB instead
 */
export function getCachedMediaDetails(tmdbId: number, mediaType: string): MovieDetails | null {
  if (!mediaType) return null;
  const key = `${mediaType}:${tmdbId}`;
  return tmdbCache.get<MovieDetails>(key);
}

/**
 * @deprecated Use setTMDB instead
 */
/**
 * Set cached media details (deprecated - use setTMDB instead).
 * 
 * @param tmdbId - TMDB ID of the media
 * @param mediaType - Type of media ('movie' or 'tv')
 * @param data - MovieDetails to cache
 * @deprecated Use setTMDB instead
 */
export function setCachedMediaDetails(tmdbId: number, mediaType: string, data: MovieDetails): void {
  if (!mediaType) return;
  const key = `${mediaType}:${tmdbId}`;
  // Cache for 24 hours by default
  tmdbCache.set(key, data);
}
