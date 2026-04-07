/**
 * TasteMap Core Computation Functions
 * 
 * Functions to compute user preference profiles from watched movies.
 */

import { prisma } from '@/lib/prisma';
import { fetchMediaDetails } from '@/lib/tmdb';
import { MOVIE_STATUS_IDS } from '@/lib/movieStatusConstants';
import { GENRE_REVERSE_TRANSLATIONS } from '@/lib/genreData';
import { TMDB_GENRES } from '@/lib/genreData';
import type {
  TasteMap,
  GenreProfile,
  PersonProfiles,
  TypeProfile,
  RatingDistribution,
  BehaviorProfile,
  ComputedMetrics,
  WatchListItemFull,
} from './types';
import {
  storeTasteMap,
  storeGenreProfile,
  storePersonProfile,
  storeTypeProfile,
} from './redis';

// Completed status IDs from MovieStatus table
const COMPLETED_STATUS_IDS = [MOVIE_STATUS_IDS.WATCHED, MOVIE_STATUS_IDS.REWATCHED];

/** Number of official TMDB movie genres used for diversity calculation */
const TMDB_GENRE_COUNT = 19 as const;

/**
 * Normalize genre name to English using reverse translation.
 * TMDB returns Russian genre names when language=ru-RU is used.
 * Returns null for composite/unknown genres (e.g. "Боевик и Приключения").
 * Only the 19 official TMDB genres are counted.
 */
function normalizeGenreName(name: string): string | null {
  // Already an English TMDB genre — pass through as-is
  if ((TMDB_GENRES as readonly string[]).includes(name)) {
    return name;
  }

  // Direct match in reverse translations (Russian → English)
  if (GENRE_REVERSE_TRANSLATIONS[name]) {
    return GENRE_REVERSE_TRANSLATIONS[name];
  }

  // Case-insensitive match for Russian variants
  const lowerName = name.toLowerCase();
  for (const [ru, en] of Object.entries(GENRE_REVERSE_TRANSLATIONS)) {
    if (ru.toLowerCase() === lowerName) {
      return en;
    }
  }

  // Composite or unknown genre — skip it
  return null;
}

/**
 * Compute genre counts from watched movies
 * Counts how many times each genre appears across all watched movies
 * Each movie contributes once per genre (deduplicates within the same movie)
 * @param watchedMovies - Array of watched movies with genres
 * @returns Record mapping genre names to occurrence counts
 */
export function computeGenreCounts(watchedMovies: WatchListItemFull[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const movie of watchedMovies) {
    const genres = movie.genres || [];
    // Deduplicate genres within the same movie
    const uniqueGenres = new Set<string>();
    for (const genre of genres) {
      const normalized = normalizeGenreName(genre.name);
      if (normalized) {
        uniqueGenres.add(normalized);
      }
    }
    for (const name of uniqueGenres) {
      counts[name] = (counts[name] || 0) + 1;
    }
  }
  return counts;
}

/**
 * Compute genre profile from watched movies
 * Aggregates ratings by genre, returns 0-100 scale
 */
export function computeGenreProfile(watchedMovies: WatchListItemFull[]): GenreProfile {
  const genreMap = new Map<string, { totalRating: number; count: number }>();

  for (const movie of watchedMovies) {
    const rating = movie.userRating ?? movie.voteAverage;
    const genres = movie.genres || [];

    for (const genre of genres) {
      const normalized = normalizeGenreName(genre.name);
      if (!normalized) continue;
      const existing = genreMap.get(normalized) || { totalRating: 0, count: 0 };
      existing.totalRating += rating;
      existing.count += 1;
      genreMap.set(normalized, existing);
    }
  }

  const profile: GenreProfile = {};
  for (const [genre, data] of genreMap) {
    // Scale to 0-100 (rating 0-10 → 0-100)
    profile[genre] = Math.round((data.totalRating / data.count) * 10);
  }

  return profile;
}

/**
 * Compute person profile (actors and directors) from watched movies
 * Requires TMDB credits data
 */
export function computePersonProfile(
  watchedMovies: WatchListItemFull[]
): PersonProfiles {
  const actorMap = new Map<string, { totalRating: number; count: number }>();
  const directorMap = new Map<string, { totalRating: number; count: number }>();

  for (const movie of watchedMovies) {
    const rating = movie.userRating ?? movie.voteAverage;
    const credits = movie.credits;

    if (!credits) continue;

    // Aggregate actors
    for (const actor of credits.cast || []) {
      const existing = actorMap.get(actor.name) || { totalRating: 0, count: 0 };
      existing.totalRating += rating;
      existing.count += 1;
      actorMap.set(actor.name, existing);
    }

    // Aggregate directors
    for (const crew of credits.crew || []) {
      if (crew.job === 'Director') {
        const existing = directorMap.get(crew.name) || { totalRating: 0, count: 0 };
        existing.totalRating += rating;
        existing.count += 1;
        directorMap.set(crew.name, existing);
      }
    }
  }

  // Normalize to 0-100 scale
  const actors: Record<string, number> = {};
  for (const [name, data] of actorMap) {
    actors[name] = Math.round((data.totalRating / data.count) * 10);
  }

  const directors: Record<string, number> = {};
  for (const [name, data] of directorMap) {
    directors[name] = Math.round((data.totalRating / data.count) * 10);
  }

  return { actors, directors };
}

/**
 * Compute type profile (movie vs tv) from watched movies
 * Returns percentages
 */
export function computeTypeProfile(watchedMovies: WatchListItemFull[]): TypeProfile {
  if (watchedMovies.length === 0) {
    return { movie: 0, tv: 0 };
  }

  let movieCount = 0;
  let tvCount = 0;

  for (const movie of watchedMovies) {
    if (movie.mediaType === 'movie') {
      movieCount++;
    } else {
      tvCount++;
    }
  }

  return {
    movie: Math.round((movieCount / watchedMovies.length) * 100),
    tv: Math.round((tvCount / watchedMovies.length) * 100),
  };
}

/**
 * Compute rating distribution (high/medium/low percentages)
 * High: 8-10, Medium: 5-7, Low: 1-4
 */
export function computeRatingDistribution(
  watchedMovies: WatchListItemFull[]
): RatingDistribution {
  if (watchedMovies.length === 0) {
    return { high: 0, medium: 0, low: 0 };
  }

  let high = 0;
  let medium = 0;
  let low = 0;

  for (const movie of watchedMovies) {
    const rating = movie.userRating ?? movie.voteAverage;
    if (rating >= 8) {
      high++;
    } else if (rating >= 5) {
      medium++;
    } else {
      low++;
    }
  }

  return {
    high: Math.round((high / watchedMovies.length) * 100),
    medium: Math.round((medium / watchedMovies.length) * 100),
    low: Math.round((low / watchedMovies.length) * 100),
  };
}

/**
 * Compute average rating
 */
export function computeAverageRating(watchedMovies: WatchListItemFull[]): number {
  if (watchedMovies.length === 0) {
    return 0;
  }

  let total = 0;
  let count = 0;

  for (const movie of watchedMovies) {
    if (movie.userRating !== null) {
      total += movie.userRating;
      count++;
    }
  }

  // If no user ratings, use voteAverage
  if (count === 0) {
    total = watchedMovies.reduce((sum, m) => sum + m.voteAverage, 0);
    return Math.round((total / watchedMovies.length) * 10) / 10;
  }

  return Math.round((total / count) * 10) / 10;
}

/**
 * Compute behavior profile from watch list data
 */
export async function computeBehaviorProfile(
  userId: string,
  preFetched?: { statusId: number; watchCount: number }[]
): Promise<BehaviorProfile> {
  const allItems = preFetched ?? await prisma.watchList.findMany({
    where: { userId },
    select: {
      statusId: true,
      watchCount: true,
    },
  });

  if (allItems.length === 0) {
    return { rewatchRate: 0, dropRate: 0, completionRate: 0 };
  }

  // Count items by status using statusId
  let wantCount = 0;
  let watchedCount = 0;
  let rewatchedCount = 0;
  let droppedCount = 0;
  let rewatchTotal = 0; // Count of items with watchCount > 1

  for (const item of allItems) {
    if (item.statusId === MOVIE_STATUS_IDS.WANT_TO_WATCH) {
      wantCount++;
    } else if (item.statusId === MOVIE_STATUS_IDS.WATCHED) {
      watchedCount++;
      if (item.watchCount > 1) rewatchTotal++;
    } else if (item.statusId === MOVIE_STATUS_IDS.REWATCHED) {
      rewatchedCount++;
      // Rewatched items always count as rewatched
      rewatchTotal++;
    } else if (item.statusId === MOVIE_STATUS_IDS.DROPPED) {
      droppedCount++;
    }
  }

  // Calculate metrics
  // Rewatch rate: items with watchCount > 1 / (watched + rewatched)
  const totalWatched = watchedCount + rewatchedCount;
  const rewatchRate = totalWatched > 0
    ? Math.round((rewatchTotal / totalWatched) * 100)
    : 0;

  // Drop rate: dropped / (want + dropped) - from items user added but didn't watch
  const totalWantOrDropped = wantCount + droppedCount;
  const dropRate = totalWantOrDropped > 0
    ? Math.round((droppedCount / totalWantOrDropped) * 100)
    : 0;

  // Completion rate: watched / (want + watched + rewatched) - successful completion rate
  const totalWithStatus = wantCount + watchedCount + rewatchedCount;
  const completionRate = totalWithStatus > 0
    ? Math.round(((watchedCount + rewatchedCount) / totalWithStatus) * 100)
    : 100;

  return { rewatchRate, dropRate, completionRate };
}

/**
 * Compute derived metrics from genre profile and rating distribution.
 *
 * Calculates four key metrics:
 * - positiveIntensity: percentage of high ratings (8-10)
 * - negativeIntensity: percentage of low ratings (1-4)
 * - consistency: percentage of medium ratings (5-7) - higher = more consistent
 * - diversity: percentage of unique genres out of 19 TMDB genres
 *
 * @param genreProfile - User's genre preferences (keys are genre names)
 * @param ratingDistribution - User's rating distribution breakdown
 * @returns Computed metrics normalized to 0-100 scale
 */
export function computeMetrics(
  genreProfile: GenreProfile,
  ratingDistribution: RatingDistribution
): ComputedMetrics {
  // Positive intensity: percentage of high ratings
  const positiveIntensity = ratingDistribution.high;

  // Negative intensity: percentage of low ratings
  const negativeIntensity = ratingDistribution.low;

  // Consistency: based on how centered ratings are
  // High medium % = high consistency
  const consistency = ratingDistribution.medium;

  // Diversity: percentage of unique genres out of 19 TMDB genres
  const genreCount = Object.keys(genreProfile).length;
  const diversity = Math.round((genreCount / TMDB_GENRE_COUNT) * 100);

  return { positiveIntensity, negativeIntensity, consistency, diversity };
}

/**
 * Fetch TMDB credits for a list of movies
 */
async function fetchMovieCredits(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<{ cast: { id: number; name: string; character?: string }[]; crew: { id: number; name: string; job?: string }[] } | null> {
  // fetchMediaDetails appends credits but doesn't return them
  // We need to fetch credits separately or modify the function
  // For now, return null and handle in caller
  try {
    const url = new URL(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}/credits`);
    url.searchParams.append('api_key', process.env.TMDB_API_KEY || '');
    
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      cast: data.cast?.slice(0, 20) || [], // Top 20 cast members
      crew: data.crew?.filter((c: { job: string }) => c.job === 'Director') || [],
    };
  } catch {
    return null;
  }
}

/**
 * Normalize custom mediaType values from DB to TMDB-compatible types.
 * DB may store 'cartoon' or 'anime', but TMDB only supports 'movie' and 'tv'.
 */
function normalizeMediaType(mediaType: string): 'movie' | 'tv' {
  // Cartoons on TMDB are typically movies
  if (mediaType === 'cartoon') return 'movie';
  // Anime on TMDB is typically TV series
  if (mediaType === 'anime') return 'tv';
  // Fallback: if it's already a valid TMDB type, use it
  if (mediaType === 'movie' || mediaType === 'tv') return mediaType;
  // Default to movie for unknown types
  return 'movie';
}

/** Max TMDB requests to send in parallel to avoid rate limiting */
const TMDB_BATCH_SIZE = 5 as const;

/** Delay between TMDB request batches (ms) to respect rate limits */
const TMDB_BATCH_DELAY_MS = 200 as const;

/**
 * Build complete watch list item with TMDB details
 */
async function buildWatchListItem(
  item: { tmdbId: number; mediaType: string; userRating: number | null; voteAverage: number }
): Promise<WatchListItemFull> {
  const tmdbMediaType = normalizeMediaType(item.mediaType);
  
  // Fetch TMDB details (includes genres)
  const details = await fetchMediaDetails(item.tmdbId, tmdbMediaType);
  
  // Fetch credits separately
  const credits = await fetchMovieCredits(item.tmdbId, tmdbMediaType);
  
  return {
    userId: '', // Not needed for computation
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    userRating: item.userRating,
    voteAverage: item.voteAverage,
    genres: details?.genres || [],
    credits: credits || undefined,
  };
}

/**
 * Process items in batches with delays to avoid TMDB rate limiting
 */
async function processInBatches<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize: number = TMDB_BATCH_SIZE,
  delayMs: number = TMDB_BATCH_DELAY_MS
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    
    // Delay between batches (but not after the last one)
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

/**
 * Main function to compute complete TasteMap for a user
 */
export async function computeTasteMap(userId: string): Promise<TasteMap> {
  // Get items from database (watched + rewatched for better coverage)
  const watchedItems = await prisma.watchList.findMany({
    where: {
      userId,
      statusId: { in: COMPLETED_STATUS_IDS },
    },
    select: {
      tmdbId: true,
      mediaType: true,
      userRating: true,
      voteAverage: true,
    },
  });

  if (watchedItems.length === 0) {
    // Return empty taste map for new users
    return {
      userId,
      genreProfile: {},
      genreCounts: {},
      totalWatched: 0,
      ratingDistribution: { high: 0, medium: 0, low: 0 },
      averageRating: 0,
      personProfiles: { actors: {}, directors: {} },
      behaviorProfile: { rewatchRate: 0, dropRate: 0, completionRate: 100 },
      computedMetrics: { positiveIntensity: 0, negativeIntensity: 0, consistency: 0, diversity: 0 },
      updatedAt: new Date(),
    };
  }

  // Build full items with TMDB data (batched to avoid rate limiting)
  const watchListItems = await processInBatches(
    watchedItems,
    buildWatchListItem
  );

  // Compute profiles
  const genreProfile = computeGenreProfile(watchListItems);
  const genreCounts = computeGenreCounts(watchListItems);
  const personProfiles = computePersonProfile(watchListItems);
  const typeProfile = computeTypeProfile(watchListItems);
  const ratingDistribution = computeRatingDistribution(watchListItems);
  const averageRating = computeAverageRating(watchListItems);

  // Fetch all items for behavior profile in a single query
  const allItems = await prisma.watchList.findMany({
    where: { userId },
    select: { statusId: true, watchCount: true },
  });
  const behaviorProfile = await computeBehaviorProfile(userId, allItems);
  const computedMetrics = computeMetrics(genreProfile, ratingDistribution);

  const tasteMap: TasteMap = {
    userId,
    genreProfile,
    genreCounts,
    totalWatched: watchedItems.length,
    ratingDistribution,
    averageRating,
    personProfiles,
    behaviorProfile,
    computedMetrics,
    updatedAt: new Date(),
  };

  return tasteMap;
}

/**
 * Get genre profile with caching
 * Used for efficient retrieval without full taste map
 */
export async function getCachedGenreProfile(userId: string): Promise<GenreProfile> {
  const { getGenreProfile } = await import('./redis');
  
  const cached = await getGenreProfile(userId);
  if (cached) return cached;
  
  // Compute fresh
  const tasteMap = await computeTasteMap(userId);
  return tasteMap.genreProfile;
}

/**
 * Get person profile with caching
 */
export async function getCachedPersonProfile(userId: string): Promise<PersonProfiles> {
  const { getPersonProfile } = await import('./redis');
  
  const cached = await getPersonProfile(userId);
  if (cached) return cached;
  
  const tasteMap = await computeTasteMap(userId);
  return tasteMap.personProfiles;
}
