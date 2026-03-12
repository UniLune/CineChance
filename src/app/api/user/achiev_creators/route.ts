import { NextResponse } from 'next/server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { MOVIE_STATUS_IDS } from '@/lib/movieStatusConstants';
import { withCache } from '@/lib/redis';
import { logger } from '@/lib/logger';
import type { TMDbMediaBase, TMDbGenre } from '@/lib/types/tmdb';

interface FilteredCrewDetail {
  movie: {
    id: number;
    title: string;
    release_date?: string;
    first_air_date?: string;
    job: string;
    department: string;
    media_type?: string;
  };
  mediaType: 'movie' | 'tv';
  isAnime: boolean;
  isCartoon: boolean;
  fetchSuccess: boolean;
}

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

const DIRECTOR_JOBS = ['Director'];

/**
 * Calculates a weighted score for a creator (director) based on multiple factors.
 * 
 * The score combines quality, engagement, volume, and viewing progress:
 * - Quality (35%): Average rating adjusted by rewatchs (+0.2 per rewatch) and drops (-0.3 per drop)
 * - Progress (25%): How much of the creator's filmography the user has watched
 * - Volume (15%): Logarithmic scale of total films in creator's filmography
 * - Engagement (15%): Logarithmic scale of watched films count
 * 
 * @param creator - Object containing creator statistics
 * @param creator.average_rating - User's average rating for this creator's work (0-10, null if unrated)
 * @param creator.watched_movies - Number of films watched by the user
 * @param creator.rewatched_movies - Number of films rewatched by the user
 * @param creator.dropped_movies - Number of films dropped by the user
 * @param creator.total_movies - Total films in creator's filmography
 * @param creator.progress_percent - Percentage of filmography watched (0-100)
 * @returns A weighted score value (typically 0-10 range)
 * @example
 * const score = _calculateCreatorScore({
 *   average_rating: 7.5,
 *   watched_movies: 20,
 *   rewatched_movies: 3,
 *   dropped_movies: 1,
 *   total_movies: 50,
 *   progress_percent: 40
 * });
 */
function _calculateCreatorScore(creator: {
  average_rating: number | null;
  watched_movies: number;
  rewatched_movies: number;
  dropped_movies: number;
  total_movies: number;
  progress_percent: number;
}): number {
  const baseRating = creator.average_rating || 0;
  
  const qualityBonus = Math.max(0, Math.min(10, 
    baseRating + (creator.rewatched_movies * 0.2) - (creator.dropped_movies * 0.3)
  ));
  
  const progressBonus = creator.total_movies > 0 
    ? Math.log(creator.total_movies + 1) * (creator.progress_percent / 100)
    : 0;
  
  const volumeBonus = creator.total_movies > 0 
    ? Math.log(creator.total_movies + 1) / Math.log(200)
    : 0;
  
  const watchedCountBonus = creator.watched_movies > 0
    ? Math.log(creator.watched_movies + 1) / Math.log(50)
    : 0;
  
  return (qualityBonus * 0.35) + (progressBonus * 0.25) + (volumeBonus * 0.15) + (watchedCountBonus * 0.15);
}

const creatorCreditsCache = new Map<number, { data: unknown; timestamp: number }>();
const CACHE_DURATION = 86400000;

/**
 * Fetches detailed information about a movie or TV show from TMDB.
 * Used to determine if content is anime or cartoon for filtering purposes.
 * 
 * @param tmdbId - The TMDB ID of the movie or TV show
 * @param mediaType - Whether the content is a 'movie' or 'tv' show
 * @returns Object containing genres, original language, and other details, or null on failure
 * @throws {Error} If the request times out or fails
 * 
 * @example
 * const details = await fetchMediaDetails(550, 'movie');
 * if (details && isAnime(details)) {
 *   // Filter out this anime
 * }
 */
async function fetchMediaDetails(tmdbId: number, mediaType: 'movie' | 'tv') {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    logger.warn('fetchMediaDetails: TMDB_API_KEY not configured', { tmdbId, mediaType });
    return null;
  }
  const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${apiKey}&language=ru-RU`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5sec timeout per request
    
    const res = await fetch(url, { 
      next: { revalidate: 86400 },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      logger.warn('fetchMediaDetails failed', { tmdbId, mediaType, status: res.status });
      return null;
    }
    return await res.json();
  } catch (error) {
    logger.error('fetchMediaDetails error', {
      error: error instanceof Error ? error.message : String(error),
      tmdbId,
      mediaType,
    });
    return null;
  }
}

/**
 * Determines if a TMDB media item is anime.
 * 
 * Anime is defined as content that:
 * 1. Has the Animation genre (id: 16)
 * 2. Has Japanese as the original language
 * 
 * This filtering excludes anime from creator statistics to focus on live-action work.
 * 
 * @param movie - TMDB media object with genres and original_language
 * @returns true if the content is anime, false otherwise
 * @example
 * const details = await fetchMediaDetails(12345, 'movie');
 * if (details && isAnime(details)) {
 *   console.log('This is anime, will be filtered out');
 * }
 */
function isAnime(movie: TMDbMediaBase): boolean {
  const hasAnimeGenre = movie.genres?.some((g: TMDbGenre) => g.id === 16) ?? false;
  const isJapanese = movie.original_language === 'ja';
  return hasAnimeGenre && isJapanese;
}

/**
 * Determines if a TMDB media item is a cartoon (non-Japanese animation).
 * 
 * Cartoons are defined as content that:
 * 1. Has the Animation genre (id: 16)
 * 2. Does NOT have Japanese as the original language
 * 
 * This filters out Western/Cartoon animations from creator statistics.
 * 
 * @param movie - TMDB media object with genres and original_language
 * @returns true if the content is a cartoon, false otherwise
 * @example
 * const details = await fetchMediaDetails(12345, 'movie');
 * if (details && isCartoon(details)) {
 *   console.log('This is a cartoon, will be filtered out');
 * }
 */
function isCartoon(movie: TMDbMediaBase): boolean {
  const hasAnimationGenre = movie.genres?.some((g: TMDbGenre) => g.id === 16) ?? false;
  const isNotJapanese = movie.original_language !== 'ja';
  return hasAnimationGenre && isNotJapanese;
}

interface TMDBMovieCredits {
  id: number;
  crew: Array<{
    id: number;
    name: string;
    profile_path: string | null;
    job: string;
    department: string;
  }>;
}

interface TMDBPersonCredits {
  id: number;
  cast: Array<{
    id: number;
    title: string;
    release_date: string;
    character: string;
  }>;
  crew: Array<{
    id: number;
    title: string;
    release_date?: string;
    first_air_date?: string;
    media_type?: string;
    job: string;
    department: string;
  }>;
}

type CreatorJobType = 'director';

function getJobType(job: string, _department: string): CreatorJobType | null {
  if (DIRECTOR_JOBS.includes(job)) return 'director';
  return null;
}

/**
 * Fetches the crew members for a specific movie or TV show from TMDB.
 * Used to identify directors and other crew members associated with a work.
 * 
 * @param tmdbId - The TMDB ID of the movie or TV show
 * @param mediaType - Whether the content is a 'movie' or 'tv' show
 * @returns Object containing crew array with id, name, profile_path, job, department, or null on failure
 * 
 * @example
 * const credits = await fetchMovieCredits(550, 'movie');
 * const directors = credits?.crew.filter(member => member.job === 'Director');
 */
async function fetchMovieCredits(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<TMDBMovieCredits | null> {
  if (!TMDB_API_KEY) {
    logger.warn('fetchMovieCredits: TMDB_API_KEY not configured', { tmdbId, mediaType });
    return null;
  }
  
  try {
    const url = new URL(`${BASE_URL}/${mediaType}/${tmdbId}/credits`);
    url.searchParams.append('api_key', TMDB_API_KEY);
    url.searchParams.append('language', 'ru-RU');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5sec timeout

    const response = await fetch(url.toString(), {
      headers: { 'accept': 'application/json' },
      next: { revalidate: 86400, tags: [`${mediaType}-credits`] },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn('fetchMovieCredits failed', { tmdbId, mediaType, status: response.status });
      return null;
    }
    return await response.json();
  } catch (error) {
    logger.error('fetchMovieCredits error', {
      error: error instanceof Error ? error.message : String(error),
      tmdbId,
      mediaType,
    });
    return null;
  }
}

/**
 * Fetches all combined credits (cast and crew) for a person from TMDB.
 * Used to get a creator's complete filmography for progress calculation.
 * 
 * Results are cached in memory for 24 hours (86400000ms) to avoid repeated API calls.
 * This cache is specific to the server process and does not persist across restarts.
 * 
 * @param personId - The TMDB person ID
 * @returns Object containing cast and crew arrays, or null on failure
 * 
 * @example
 * const credits = await fetchPersonCredits(500);
 * console.log(`Total works: ${credits?.cast.length + credits?.crew.length}`);
 */
async function fetchPersonCredits(personId: number): Promise<TMDBPersonCredits | null> {
  const cached = creatorCreditsCache.get(personId);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    logger.debug('fetchPersonCredits: cache hit', { personId });
    return cached.data as TMDBPersonCredits;
  }

  if (!TMDB_API_KEY) {
    logger.warn('fetchPersonCredits: TMDB_API_KEY not configured', { personId });
    return null;
  }

  try {
    logger.debug('fetchPersonCredits: starting fetch', { personId });
    
    const url = new URL(`${BASE_URL}/person/${personId}/combined_credits`);
    url.searchParams.append('api_key', TMDB_API_KEY);
    url.searchParams.append('language', 'ru-RU');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5sec timeout

    const response = await fetch(url.toString(), {
      headers: { 'accept': 'application/json' },
      next: { revalidate: 86400, tags: ['person-credits'] },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn('fetchPersonCredits failed', { personId, status: response.status });
      return null;
    }

    const data = await response.json() as TMDBPersonCredits;
    logger.info('fetchPersonCredits: success', { 
      personId, 
      castCount: data.cast?.length || 0,
      crewCount: data.crew?.length || 0 
    });
    creatorCreditsCache.set(personId, { data, timestamp: now });
    return data;
  } catch (error) {
    logger.error('fetchPersonCredits error', {
      error: error instanceof Error ? error.message : String(error),
      personId,
    });
    return null;
  }
}

/**
 * API endpoint for retrieving user achievement creators (directors).
 * 
 * This endpoint calculates which movie/TV creators (directors) the user has
 * watched the most content from, based on their watchlist entries.
 * 
 * **Algorithm Overview:**
 * 1. Fetches user's watched, rewatched, and dropped movies from watchlist
 * 2. For each watched movie, fetches crew data from TMDB to identify directors
 * 3. Aggregates statistics per director: watched count, rewatch count, drop count, ratings
 * 4. For singleLoad=true: fetches full filmography for top creators to calculate progress %
 * 5. Calculates a weighted creator_score based on quality, progress, volume, and engagement
 * 6. Sorts by creator_score with tie-breakers (rating, progress, name)
 * 7. Saves results to database for future fast retrieval
 * 
 * **Sorting Logic:**
 * - Primary: creator_score (descending) - weighted combination of all factors
 * - Tie-breaker 1: average_rating (descending, nulls last)
 * - Tie-breaker 2: progress_percent (descending)
 * - Tie-breaker 3: name (alphabetical, Russian locale)
 * 
 * **Filtering:**
 * - Anime (Animation genre + Japanese language) is excluded from filmography
 * - Cartoons (Animation genre + non-Japanese) is excluded from filmography
 * - Only 'movie' and 'tv' media types are considered
 * 
 * @param request - The incoming GET request
 * @returns JSON response with creators array, hasMore boolean, total count
 * 
 * @queryParam {number} [limit=24] - Maximum number of creators to return (max 50)
 * @queryParam {number} [offset=0] - Number of creators to skip (for pagination)
 * @queryParam {boolean} [singleLoad=false] - If true, calculates full filmography progress
 * @queryParam {string} [userId] - Optional user ID to view another user's creators
 * 
 * @response 200 - { creators: CreatorAchievement[], hasMore: boolean, total: number, singleLoad?: boolean }
 * @response 401 - Unauthorized if not logged in
 * @response 500 - Internal server error
 * 
 * @example
 * // Get top 24 directors
 * const response = await fetch('/api/user/achiev_creators?limit=24');
 * const { creators, hasMore, total } = await response.json();
 * 
 * @example
 * // Get full filmography progress for top 50
 * const response = await fetch('/api/user/achiev_creators?limit=50&singleLoad=true');
 */
export async function GET(request: Request) {
  const startTime = Date.now();
  logger.info('AchievCreatorsAPI: Request started', { timestamp: new Date().toISOString() });
  
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Требуется аутентификация' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId') || userId;
    
    const limit = Math.min(parseInt(searchParams.get('limit') || '24'), 50);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
    const singleLoad = searchParams.get('singleLoad') === 'true';

    logger.info('AchievCreatorsAPI: Parameters loaded', { userId, targetUserId, limit, offset, singleLoad });

    const cacheKey = `user:${targetUserId}:achiev_creators:${limit}:${offset}:${singleLoad}`;

    const fetchCreators = async () => {
      const [watchedMoviesData, rewatchedMoviesData, droppedMoviesData] = await Promise.all([
        prisma.watchList.findMany({
          where: {
            userId: targetUserId,
            statusId: MOVIE_STATUS_IDS.WATCHED,
            mediaType: { in: ['movie', 'tv'] },
          },
          select: { tmdbId: true, mediaType: true, userRating: true },
        }),
        prisma.watchList.findMany({
          where: {
            userId: targetUserId,
            statusId: MOVIE_STATUS_IDS.REWATCHED,
            mediaType: { in: ['movie', 'tv'] },
          },
          select: { tmdbId: true, mediaType: true, userRating: true },
        }),
        prisma.watchList.findMany({
          where: {
            userId: targetUserId,
            statusId: MOVIE_STATUS_IDS.DROPPED,
            mediaType: { in: ['movie', 'tv'] },
          },
          select: { tmdbId: true, mediaType: true, userRating: true },
        }),
      ]);

      if (watchedMoviesData.length === 0 && rewatchedMoviesData.length === 0) {
        return { creators: [], hasMore: false, total: 0 };
      }

      const creatorMap = new Map<number, {
        name: string;
        profile_path: string | null;
        job_types: Set<CreatorJobType>;
        watchedIds: Set<number>;
        rewatchedIds: Set<number>;
        droppedIds: Set<number>;
        ratingsByJobType: Map<CreatorJobType, number[]>;
      }>();

      const BATCH_SIZE = 10;

      for (let i = 0; i < watchedMoviesData.length; i += BATCH_SIZE) {
        const batch = watchedMoviesData.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.all(
          batch.map(async (movie) => {
            const credits = await fetchMovieCredits(movie.tmdbId, movie.mediaType as 'movie' | 'tv');
            return { credits, rating: movie.userRating };
          })
        );

        for (const { credits, rating } of results) {
          if (credits?.crew) {
            for (const member of credits.crew) {
              const jobType = getJobType(member.job, member.department);
              if (!jobType) continue;

              const memberId = Number(member.id);
              if (!creatorMap.has(memberId)) {
                creatorMap.set(memberId, {
                  name: member.name,
                  profile_path: member.profile_path,
                  job_types: new Set([jobType]),
                  watchedIds: new Set(),
                  rewatchedIds: new Set(),
                  droppedIds: new Set(),
                  ratingsByJobType: new Map([[jobType, rating !== null && rating !== undefined ? [rating] : []]]),
                });
              } else {
                const existing = creatorMap.get(memberId)!;
                existing.job_types.add(jobType);
                // Обновляем name и profile_path если они отсутствуют
                if (!existing.profile_path && member.profile_path) {
                  existing.name = member.name;
                  existing.profile_path = member.profile_path;
                }
                const existingRatings = existing.ratingsByJobType.get(jobType);
                if (existingRatings && rating !== null && rating !== undefined) {
                  existingRatings.push(rating);
                } else if (rating !== null && rating !== undefined) {
                  existing.ratingsByJobType.set(jobType, [rating]);
                }
              }
              
              creatorMap.get(memberId)!.watchedIds.add(credits.id);
            }
          }
        }

        if (i + BATCH_SIZE < watchedMoviesData.length) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }

      for (let i = 0; i < rewatchedMoviesData.length; i += BATCH_SIZE) {
        const batch = rewatchedMoviesData.slice(i, i + BATCH_SIZE);
        
        const _results = await Promise.all(
          batch.map(async (movie) => {
            const rating = movie.userRating;
            const credits = await fetchMovieCredits(movie.tmdbId, movie.mediaType as 'movie' | 'tv');
            
            if (credits?.crew) {
              for (const member of credits.crew) {
                const jobType = getJobType(member.job, member.department);
                if (!jobType) continue;

                const memberId = Number(member.id);
                if (creatorMap.has(memberId)) {
                  const existing = creatorMap.get(memberId)!;
                  existing.rewatchedIds.add(credits.id);
                  existing.job_types.add(jobType);
                  if (!existing.profile_path && member.profile_path) {
                    existing.name = member.name;
                    existing.profile_path = member.profile_path;
                  }
                  const existingRatings = existing.ratingsByJobType.get(jobType);
                  if (existingRatings && rating !== null && rating !== undefined) {
                    existingRatings.push(rating);
                  } else if (rating !== null && rating !== undefined) {
                    existing.ratingsByJobType.set(jobType, [rating]);
                  }
                }
              }
            }
            return credits;
          })
        );

        if (i + BATCH_SIZE < rewatchedMoviesData.length) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }

      for (let i = 0; i < droppedMoviesData.length; i += BATCH_SIZE) {
        const batch = droppedMoviesData.slice(i, i + BATCH_SIZE);
        
        const _results = await Promise.all(
          batch.map(async (movie) => {
            const credits = await fetchMovieCredits(movie.tmdbId, movie.mediaType as 'movie' | 'tv');
            
            if (credits?.crew) {
              for (const member of credits.crew) {
                const jobType = getJobType(member.job, member.department);
                if (!jobType) continue;

                const memberId = Number(member.id);
                if (creatorMap.has(memberId)) {
                  const existing = creatorMap.get(memberId)!;
                  existing.droppedIds.add(credits.id);
                  existing.job_types.add(jobType);
                  if (!existing.profile_path && member.profile_path) {
                    existing.name = member.name;
                    existing.profile_path = member.profile_path;
                  }
                }
              }
            }
            return credits;
          })
        );

        if (i + BATCH_SIZE < droppedMoviesData.length) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }

      const allCreators = Array.from(creatorMap.entries())
        .sort((a, b) => b[1].watchedIds.size - a[1].watchedIds.size);
      
      const baseCreatorsData = allCreators.map(([creatorId, creatorData]) => {
        // Собираем рейтинги только по тем job_types, которые есть у человека
        const relevantRatings: number[] = [];
        const jobTypesArray = Array.from(creatorData.job_types);
        for (const jobType of jobTypesArray) {
          const ratings = creatorData.ratingsByJobType.get(jobType);
          if (ratings) {
            relevantRatings.push(...ratings);
          }
        }
        
        return {
          id: creatorId,
          name: creatorData.name,
          profile_path: creatorData.profile_path,
          job_types: Array.from(creatorData.job_types),
          watched_movies: creatorData.watchedIds.size,
          rewatched_movies: creatorData.rewatchedIds.size,
          dropped_movies: creatorData.droppedIds.size,
          total_movies: 0,
          progress_percent: 0,
          average_rating: relevantRatings.length > 0
            ? Number((relevantRatings.reduce((a, b) => a + b, 0) / relevantRatings.length).toFixed(1))
            : null,
        };
      });

      if (singleLoad) {
        const maxCreatorsToProcess = Math.min(baseCreatorsData.length, limit);
        const creatorsToProcess = baseCreatorsData.slice(0, maxCreatorsToProcess);
        
        const batchSize = 10;
        const achievementsPromises = [];
        
        for (let i = 0; i < creatorsToProcess.length; i += batchSize) {
          const batch = creatorsToProcess.slice(i, i + batchSize);
          
          const batchPromises = batch.map(async (creator) => {
            try {
              const credits = await fetchPersonCredits(creator.id);
              
              if (!credits) {
                logger.warn('Creator: fetchPersonCredits returned null', { 
                  creatorId: creator.id,
                  name: creator.name,
                });
              }
              
              let filteredCrew = credits?.crew || [];
               let filteredCrewDetails: FilteredCrewDetail[] = [];
              
              logger.debug('Creator crew data fetched', {
                creatorId: creator.id,
                name: creator.name,
                totalCrewRecords: filteredCrew.length,
                hasCrewData: !!credits?.crew,
                crewSample: filteredCrew.slice(0, 3).map(c => ({
                  id: c.id,
                  title: c.title,
                  job: c.job,
                  department: c.department,
                  release_date: c.release_date,
                  first_air_date: c.first_air_date,
                })),
              });
              
              if (filteredCrew.length > 0) {
                // Limit to first 100 movies, same as actors
                const moviesToProcess = filteredCrew.slice(0, 100);
                
                const FETCH_BATCH_SIZE = 5;
                
                for (let j = 0; j < moviesToProcess.length; j += FETCH_BATCH_SIZE) {
                  const movieBatch = moviesToProcess.slice(j, j + FETCH_BATCH_SIZE);
                  
                  const batchResults = await Promise.all(
                    movieBatch.map(async (movie) => {
                      // Определяем тип медиа по наличию дат
                      // В TMDB crew might have either release_date (movies) или first_air_date (TV)
                      let mediaType: 'movie' | 'tv' = 'movie';
                      if (movie.media_type === 'tv' || movie.first_air_date) {
                        mediaType = 'tv';
                      }
                      // movie.media_type === 'movie' или release_date
                      const mediaDetails = await fetchMediaDetails(movie.id, mediaType);
                      return {
                        movie,
                        mediaType,
                        isAnime: mediaDetails ? isAnime(mediaDetails) : false,
                        isCartoon: mediaDetails ? isCartoon(mediaDetails) : false,
                        fetchSuccess: !!mediaDetails,
                      };
                    })
                  );
                  
                  filteredCrewDetails.push(...batchResults);
                  
                   logger.debug('Creator crew batch processed', {
                     creatorId: creator.id,
                     batchIndex: Math.floor(j / FETCH_BATCH_SIZE),
                     batchSize: movieBatch.length,
                     successfulFetches: batchResults.filter(r => r.fetchSuccess).length,
                     animeCount: batchResults.filter(r => r.isAnime).length,
                     cartoonCount: batchResults.filter(r => r.isCartoon).length,
                     validCount: batchResults.filter(r => !r.isAnime && !r.isCartoon).length,
                   });
                  
                  if (j + FETCH_BATCH_SIZE < moviesToProcess.length) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                  }
                }
                
                filteredCrew = filteredCrewDetails
                  .filter(({ isAnime, isCartoon }) => !isAnime && !isCartoon)
                  .map(({ movie }) => movie);
              }
              
               logger.debug('Creator crew after anime filter', {
                 creatorId: creator.id,
                 name: creator.name,
                 totalDetailsProcessed: filteredCrewDetails.length,
                 crewRecordsAfterFilter: filteredCrew.length,
                 animeFiltered: filteredCrewDetails.filter(r => r.isAnime).length,
                 cartoonFiltered: filteredCrewDetails.filter(r => r.isCartoon).length,
                 fetchFailures: filteredCrewDetails.filter(r => !r.fetchSuccess).length,
               });
              
              // Считаем УНИКАЛЬНЫЕ фильмы по их ID (независимо от job-ов)
              // Один фильм может иметь несколько job-ов (режиссер, продюсер, и т.д.)
              const uniqueMovieIds = new Set<number>();
              for (const crew of filteredCrew) {
                uniqueMovieIds.add(crew.id);
              }
              
              const totalMovies = uniqueMovieIds.size; // Количество уникальных фильмов
              const watchedMovies = creator.watched_movies;
              
              const progressPercent = totalMovies > 0 
                ? Math.round((watchedMovies / totalMovies) * 100)
                : 0;

              logger.info('Creator filmography calculated', {
                creatorId: creator.id,
                name: creator.name,
                originalCrewRecords: credits?.crew?.length || 0,
                afterAnimeFilter: filteredCrew.length,
                uniqueMoviesCount: totalMovies,
                watchedMovies,
                progressPercent,
              });

              return {
                ...creator,
                total_movies: totalMovies,
                progress_percent: progressPercent,
              };
            } catch (error) {
              logger.error('Error processing creator filmography', {
                creatorId: creator.id,
                name: creator.name,
                error: error instanceof Error ? error.message : String(error),
              });
              return {
                ...creator,
                total_movies: creator.watched_movies,
                progress_percent: creator.watched_movies > 0 ? 100 : 0,
              };
            }
          });
          
          achievementsPromises.push(Promise.all(batchPromises));
        }

         const allCreatorsWithFullData = (await Promise.all(achievementsPromises)).flat();

         // Add creator_score to each creator before sorting
         const creatorsWithScores = allCreatorsWithFullData.map(creator => ({
           ...creator,
           creator_score: _calculateCreatorScore(creator),
         }));

         // Sort by creator_score with tie-breakers (matching actors pattern)
         creatorsWithScores.sort((a, b) => {
           // Primary: creator_score descending
           if (b.creator_score !== a.creator_score) {
             return b.creator_score - a.creator_score;
           }
           // Tie-breaker 1: average_rating (nulls last)
           if (a.average_rating !== null && b.average_rating !== null) {
             if (b.average_rating !== a.average_rating) {
               return b.average_rating - a.average_rating;
             }
           } else if (a.average_rating === null && b.average_rating !== null) {
             return 1;
           } else if (a.average_rating !== null && b.average_rating === null) {
             return -1;
           }
           // Tie-breaker 2: progress_percent descending
           if (b.progress_percent !== a.progress_percent) {
             return b.progress_percent - a.progress_percent;
           }
           // Tie-breaker 3: name alphabetical (Russian locale)
           return a.name.localeCompare(b.name, 'ru');
         });

         const result = creatorsWithScores.slice(0, limit);

         // Save full creatorsWithScores to database (matching actors behavior)
         try {
           await prisma.personProfile.upsert({
             where: { userId_personType: { userId: targetUserId, personType: 'director' } },
             update: {
               topPersons: creatorsWithScores,
               computedAt: new Date(),
               computationMethod: 'full',
             },
             create: {
               userId: targetUserId,
               personType: 'director',
               topPersons: creatorsWithScores,
               computationMethod: 'full',
             },
           });
         } catch (error) {
           logger.error('Error saving PersonProfile', {
             error: error instanceof Error ? error.message : String(error),
             userId: targetUserId,
           });
         }

         return {
           creators: result,
           hasMore: false,
           total: creatorsWithScores.length,
           singleLoad: true,
         };
      }

       // Add creator_score to baseCreatorsData
       const creatorsWithScores = baseCreatorsData.map(creator => ({
         ...creator,
         creator_score: _calculateCreatorScore(creator),
       }));

       // Sort by creator_score with tie-breakers
       creatorsWithScores.sort((a, b) => {
         if (b.creator_score !== a.creator_score) {
           return b.creator_score - a.creator_score;
         }
         if (a.average_rating !== null && b.average_rating !== null) {
           if (b.average_rating !== a.average_rating) {
             return b.average_rating - a.average_rating;
           }
         } else if (a.average_rating === null && b.average_rating !== null) {
           return 1;
         } else if (a.average_rating !== null && b.average_rating === null) {
           return -1;
         }
         if (b.progress_percent !== a.progress_percent) {
           return b.progress_percent - a.progress_percent;
         }
         return a.name.localeCompare(b.name, 'ru');
       });

       const result = creatorsWithScores.slice(offset, Math.min(offset + limit, creatorsWithScores.length));

       return {
         creators: result,
         hasMore: offset + limit < creatorsWithScores.length,
         total: creatorsWithScores.length,
       };
    };

     const result = await withCache(cacheKey, fetchCreators, 3600);

     // result.creators already includes creator_score (added inside fetchCreators)

     const duration = Date.now() - startTime;
     logger.info('AchievCreatorsAPI: Request completed successfully', {
       duration: `${duration}ms`,
       creatorCount: result.creators.length,
       singleLoad: result.singleLoad,
       hasMore: result.hasMore,
       total: result.total,
     });

     return NextResponse.json(result);
  } catch (error) {
    logger.error('Ошибка при получении создателей', { 
      error: error instanceof Error ? error.message : String(error),
      context: 'AchievCreatorsAPI'
    });
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
