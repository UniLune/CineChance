import { NextResponse } from 'next/server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { MOVIE_STATUS_IDS } from '@/lib/movieStatusConstants';
import { withCache } from '@/lib/redis';
import { logger } from '@/lib/logger';
import type { MovieDetails, TMDbPersonCastCredit, TMDbPersonCredits } from '@/lib/types/tmdb';
import { getOrCreateMoviePersonCache } from '@/lib/taste-map/movie-person-cache';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

// Вспомогательная функция для получения деталей с TMDB
async function fetchMediaDetails(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<MovieDetails | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;
  const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${apiKey}&language=ru-RU`;
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    return await res.json() as MovieDetails;
  } catch {
    return null;
  }
}

function isAnime(movie: MovieDetails): boolean {
  const hasAnimeGenre = movie.genres?.some((g: { id: number }) => g.id === 16) ?? false;
  const isJapanese = movie.original_language === 'ja';
  return hasAnimeGenre && isJapanese;
}

function isCartoon(movie: MovieDetails): boolean {
  const hasAnimationGenre = movie.genres?.some((g: { id: number }) => g.id === 16) ?? false;
  const isNotJapanese = movie.original_language !== 'ja';
  return hasAnimationGenre && isNotJapanese;
}

// In-memory cache for person credits
const personCreditsCache = new Map<number, { data: TMDbPersonCredits; timestamp: number }>();
const CACHE_DURATION = 86400000; // 24 hours

async function fetchPersonCredits(actorId: number): Promise<TMDbPersonCredits | null> {
  const cached = personCreditsCache.get(actorId);
  const now = Date.now();

  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }

  if (!TMDB_API_KEY) return null;

  try {
    const url = new URL(`${BASE_URL}/person/${actorId}/combined_credits`);
    url.searchParams.append('api_key', TMDB_API_KEY);
    url.searchParams.append('language', 'ru-RU');

    const response = await fetch(url.toString(), {
      headers: { 'accept': 'application/json' },
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as TMDbPersonCredits;
    personCreditsCache.set(actorId, { data, timestamp: now });
    return data;
  } catch (error) {
    logger.debug('Error fetching person credits', {
      error: error instanceof Error ? error.message : String(error),
      actorId,
      context: 'AchieveActorsAPI',
    });
    return null;
  }
}

function calculateActorScore(actor: {
  average_rating: number | null;
  watched_movies: number;
  rewatched_movies: number;
  dropped_movies: number;
  total_movies: number;
  progress_percent: number;
}): number {
  const baseRating = actor.average_rating || 0;
  const qualityBonus = Math.max(0, Math.min(10,
    baseRating + (actor.rewatched_movies * 0.2) - (actor.dropped_movies * 0.3)
  ));
  const progressBonus = actor.total_movies > 0
    ? Math.log(actor.total_movies + 1) * (actor.progress_percent / 100)
    : 0;
  const volumeBonus = actor.total_movies > 0
    ? Math.log(actor.total_movies + 1) / Math.log(200)
    : 0;
  const watchedCountBonus = actor.watched_movies > 0
    ? Math.log(actor.watched_movies + 1) / Math.log(50)
    : 0;

  return (qualityBonus * 0.35) + (progressBonus * 0.25) + (volumeBonus * 0.15) + (watchedCountBonus * 0.15);
}

type ActorEntry = {
  id: number;
  name: string;
  profile_path: string | null;
  watchedIds: Set<number>;
  rewatchedIds: Set<number>;
  droppedIds: Set<number>;
  ratingSumWeighted: number;
  watchCountSum: number;
  // Computed later
  watched_movies: number;
  rewatched_movies: number;
  dropped_movies: number;
  total_movies: number;
  progress_percent: number;
  average_rating: number | null;
  actor_score: number;
};

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Требуется аутентификация' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId') || userId;

    const limit = Math.min(parseInt(searchParams.get('limit') || '24'), 50);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
    const singleLoad = searchParams.get('singleLoad') === 'true';

    const cacheKey = `user:${targetUserId}:achiev_actors:${limit}:${offset}:${singleLoad}`;

    const fetchActors = async () => {
      // Fetch all movies by status (only include movies and TV)
      const [watchedMoviesData, rewatchedMoviesData, droppedMoviesData] = await Promise.all([
        prisma.watchList.findMany({
          where: {
            userId: targetUserId,
            statusId: MOVIE_STATUS_IDS.WATCHED,
            mediaType: { in: ['movie', 'tv'] },
          },
          select: {
            tmdbId: true,
            mediaType: true,
            userRating: true,
            watchCount: true,
          },
        }),
        prisma.watchList.findMany({
          where: {
            userId: targetUserId,
            statusId: MOVIE_STATUS_IDS.REWATCHED,
            mediaType: { in: ['movie', 'tv'] },
          },
          select: {
            tmdbId: true,
            mediaType: true,
            userRating: true,
            watchCount: true,
          },
        }),
        prisma.watchList.findMany({
          where: {
            userId: targetUserId,
            statusId: MOVIE_STATUS_IDS.DROPPED,
            mediaType: { in: ['movie', 'tv'] },
          },
          select: {
            tmdbId: true,
            mediaType: true,
          },
        }),
      ]);

      if (watchedMoviesData.length === 0 && rewatchedMoviesData.length === 0) {
        return { actors: [], hasMore: false, total: 0 };
      }

      const actorMap = new Map<number, ActorEntry>();

      // Process watched movies (top 5 actors per movie)
      const BATCH_SIZE = 10;
      for (let i = 0; i < watchedMoviesData.length; i += BATCH_SIZE) {
        const batch = watchedMoviesData.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async (movie) => {
            const mediaDetails = await fetchMediaDetails(movie.tmdbId, movie.mediaType as 'movie' | 'tv');
            if (!mediaDetails) return;

            // Skip anime/cartoon
            if (isAnime(mediaDetails) || isCartoon(mediaDetails)) {
              return;
            }

            const { topActors } = await getOrCreateMoviePersonCache(movie.tmdbId, movie.mediaType as 'movie' | 'tv');
            const top5 = topActors.slice(0, 5);

            for (const actor of top5) {
              if (!actorMap.has(actor.id)) {
                actorMap.set(actor.id, {
                  id: actor.id,
                  name: actor.name,
                  profile_path: actor.profile_path,
                  watchedIds: new Set(),
                  rewatchedIds: new Set(),
                  droppedIds: new Set(),
                  ratingSumWeighted: 0,
                  watchCountSum: 0,
                  watched_movies: 0,
                  rewatched_movies: 0,
                  dropped_movies: 0,
                  total_movies: 0,
                  progress_percent: 0,
                  average_rating: null,
                  actor_score: 0,
                });
              }

              const entry = actorMap.get(actor.id)!;
              entry.watchedIds.add(movie.tmdbId);
              const weight = movie.watchCount ?? 1;
              const rating = movie.userRating ?? 0;
              entry.ratingSumWeighted += rating * weight;
              entry.watchCountSum += weight;
            }
          })
        );

        // Small delay between batches
        if (i + BATCH_SIZE < watchedMoviesData.length) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }

      // Process rewatched movies
      for (let i = 0; i < rewatchedMoviesData.length; i += BATCH_SIZE) {
        const batch = rewatchedMoviesData.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async (movie) => {
            const mediaDetails = await fetchMediaDetails(movie.tmdbId, movie.mediaType as 'movie' | 'tv');
            if (!mediaDetails) return;

            if (isAnime(mediaDetails) || isCartoon(mediaDetails)) {
              return;
            }

            const { topActors } = await getOrCreateMoviePersonCache(movie.tmdbId, movie.mediaType as 'movie' | 'tv');
            const top5 = topActors.slice(0, 5);

            for (const actor of top5) {
              if (!actorMap.has(actor.id)) {
                actorMap.set(actor.id, {
                  id: actor.id,
                  name: actor.name,
                  profile_path: actor.profile_path,
                  watchedIds: new Set(),
                  rewatchedIds: new Set(),
                  droppedIds: new Set(),
                  ratingSumWeighted: 0,
                  watchCountSum: 0,
                  watched_movies: 0,
                  rewatched_movies: 0,
                  dropped_movies: 0,
                  total_movies: 0,
                  progress_percent: 0,
                  average_rating: null,
                  actor_score: 0,
                });
              }

              const entry = actorMap.get(actor.id)!;
              entry.rewatchedIds.add(movie.tmdbId);
              const weight = movie.watchCount ?? 1;
              const rating = movie.userRating ?? 0;
              entry.ratingSumWeighted += rating * weight;
              entry.watchCountSum += weight;
            }
          })
        );

        if (i + BATCH_SIZE < rewatchedMoviesData.length) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }

      // Process dropped movies (just count, no ratings)
      for (let i = 0; i < droppedMoviesData.length; i += BATCH_SIZE) {
        const batch = droppedMoviesData.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async (movie) => {
            const mediaDetails = await fetchMediaDetails(movie.tmdbId, movie.mediaType as 'movie' | 'tv');
            if (!mediaDetails) return;

            if (isAnime(mediaDetails) || isCartoon(mediaDetails)) {
              return;
            }

            const { topActors } = await getOrCreateMoviePersonCache(movie.tmdbId, movie.mediaType as 'movie' | 'tv');
            const top5 = topActors.slice(0, 5);

            for (const actor of top5) {
              if (!actorMap.has(actor.id)) {
                actorMap.set(actor.id, {
                  id: actor.id,
                  name: actor.name,
                  profile_path: actor.profile_path,
                  watchedIds: new Set(),
                  rewatchedIds: new Set(),
                  droppedIds: new Set(),
                  ratingSumWeighted: 0,
                  watchCountSum: 0,
                  watched_movies: 0,
                  rewatched_movies: 0,
                  dropped_movies: 0,
                  total_movies: 0,
                  progress_percent: 0,
                  average_rating: null,
                  actor_score: 0,
                });
              }

              actorMap.get(actor.id)!.droppedIds.add(movie.tmdbId);
            }
          })
        );

        if (i + BATCH_SIZE < droppedMoviesData.length) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }

      // Convert map to array and compute derived fields
      let allActors: ActorEntry[] = Array.from(actorMap.entries()).map(([id, entry]) => {
        const watched_movies = entry.watchedIds.size + entry.rewatchedIds.size;
        const rewatched_movies = entry.rewatchedIds.size;
        const dropped_movies = entry.droppedIds.size;
        const average_rating = entry.watchCountSum > 0
          ? Number((entry.ratingSumWeighted / entry.watchCountSum).toFixed(1))
          : null;

        return {
          ...entry,
          watched_movies,
          rewatched_movies,
          dropped_movies,
          average_rating,
        };
      });

      // For singleLoad, we only need top N by watched_movies to limit TMDB calls
      if (singleLoad) {
        // Sort by watched_movies descending to get top candidates
        allActors.sort((a, b) => b.watched_movies - a.watched_movies);
        const actorsToProcess = allActors.slice(0, Math.min(limit, allActors.length));

        // Fetch person credits and compute total_movies, progress, actor_score in batches
        const batchSize = 10;
        const results: ActorEntry[] = [];

        for (let i = 0; i < actorsToProcess.length; i += batchSize) {
          const batch = actorsToProcess.slice(i, i + batchSize);

          const enriched = await Promise.all(
            batch.map(async (actor) => {
              try {
                const credits = await fetchPersonCredits(actor.id);
                let filteredCast = credits?.cast || [];

                if (filteredCast.length > 0) {
                  // Filter out anime/cartoon from filmography
                  const moviesToProcess = filteredCast.slice(0, 100);
                  const FETCH_BATCH_SIZE = 5;
                  const filteredCastDetails: Array<{ movie: TMDbPersonCastCredit; isAnime: boolean; isCartoon: boolean }> = [];

                  for (let j = 0; j < moviesToProcess.length; j += FETCH_BATCH_SIZE) {
                    const movieBatch = moviesToProcess.slice(j, j + FETCH_BATCH_SIZE);

                    const batchResults = await Promise.all(
                      movieBatch.map(async (movie) => {
                        const mediaType = movie.release_date ? 'movie' : 'tv';
                        const mediaDetails = await fetchMediaDetails(movie.id, mediaType);
                        return {
                          movie,
                          isAnime: mediaDetails ? isAnime(mediaDetails) : false,
                          isCartoon: mediaDetails ? isCartoon(mediaDetails) : false,
                        };
                      })
                    );

                    filteredCastDetails.push(...batchResults);

                    if (j + FETCH_BATCH_SIZE < moviesToProcess.length) {
                      await new Promise(resolve => setTimeout(resolve, 10));
                    }
                  }

                  filteredCast = filteredCastDetails
                    .filter(({ isAnime, isCartoon }) => !isAnime && !isCartoon)
                    .map(({ movie }) => movie);
                }

                const totalMovies = filteredCast.length;
                const progressPercent = totalMovies > 0
                  ? Math.round((actor.watched_movies / totalMovies) * 100)
                  : 0;

                return {
                  ...actor,
                  total_movies: totalMovies,
                  progress_percent: progressPercent,
                  // Keep existing profile_path from topActors
                  actor_score: calculateActorScore({
                    average_rating: actor.average_rating,
                    watched_movies: actor.watched_movies,
                    rewatched_movies: actor.rewatched_movies,
                    dropped_movies: actor.dropped_movies,
                    total_movies: totalMovies,
                    progress_percent: progressPercent,
                  }),
                };
              } catch {
                return {
                  ...actor,
                  total_movies: actor.watched_movies, // fallback
                  progress_percent: actor.watched_movies > 0 ? 100 : 0,
                  profile_path: actor.profile_path,
                  actor_score: calculateActorScore({
                    average_rating: actor.average_rating,
                    watched_movies: actor.watched_movies,
                    rewatched_movies: actor.rewatched_movies,
                    dropped_movies: actor.dropped_movies,
                    total_movies: actor.watched_movies,
                    progress_percent: actor.watched_movies > 0 ? 100 : 0,
                  }),
                };
              }
            })
          );

          results.push(...enriched);
        }

        // Final sort by actor_score descending
        results.sort((a, b) => b.actor_score - a.actor_score);

        return {
          actors: results,
          hasMore: false,
          total: allActors.length,
          singleLoad: true,
        };
      }

      // Paginated mode: process all actors to compute scores
      // First, fetch person credits for all actors (could be many)
      const allEnriched = await Promise.all(
        allActors.map(async (actor) => {
          try {
            const credits = await fetchPersonCredits(actor.id);
            let filteredCast = credits?.cast || [];

            if (filteredCast.length > 0) {
              const moviesToProcess = filteredCast.slice(0, 100);
              const FETCH_BATCH_SIZE = 5;
              const filteredCastDetails: Array<{ movie: TMDbPersonCastCredit; isAnime: boolean; isCartoon: boolean }> = [];

              for (let j = 0; j < moviesToProcess.length; j += FETCH_BATCH_SIZE) {
                const movieBatch = moviesToProcess.slice(j, j + FETCH_BATCH_SIZE);

                const batchResults = await Promise.all(
                  movieBatch.map(async (movie) => {
                    const mediaType = movie.release_date ? 'movie' : 'tv';
                    const mediaDetails = await fetchMediaDetails(movie.id, mediaType);
                    return {
                      movie,
                      isAnime: mediaDetails ? isAnime(mediaDetails) : false,
                      isCartoon: mediaDetails ? isCartoon(mediaDetails) : false,
                    };
                  })
                );

                filteredCastDetails.push(...batchResults);

                if (j + FETCH_BATCH_SIZE < moviesToProcess.length) {
                  await new Promise(resolve => setTimeout(resolve, 10));
                }
              }

              filteredCast = filteredCastDetails
                .filter(({ isAnime, isCartoon }) => !isAnime && !isCartoon)
                .map(({ movie }) => movie);
            }

            const totalMovies = filteredCast.length;
            const progressPercent = totalMovies > 0
              ? Math.round((actor.watched_movies / totalMovies) * 100)
              : 0;

            return {
              ...actor,
              total_movies: totalMovies,
              progress_percent: progressPercent,
              // Keep existing profile_path from topActors
              actor_score: calculateActorScore({
                average_rating: actor.average_rating,
                watched_movies: actor.watched_movies,
                rewatched_movies: actor.rewatched_movies,
                dropped_movies: actor.dropped_movies,
                total_movies: totalMovies,
                progress_percent: progressPercent,
              }),
            };
          } catch {
            return {
              ...actor,
              total_movies: actor.watched_movies,
              progress_percent: actor.watched_movies > 0 ? 100 : 0,
              profile_path: actor.profile_path,
              actor_score: calculateActorScore({
                average_rating: actor.average_rating,
                watched_movies: actor.watched_movies,
                rewatched_movies: actor.rewatched_movies,
                dropped_movies: actor.dropped_movies,
                total_movies: actor.watched_movies,
                progress_percent: actor.watched_movies > 0 ? 100 : 0,
              }),
            };
          }
        })
      );

      // Sort by average_rating desc, then progress_percent, then name (as original for paginated)
      allEnriched.sort((a, b) => {
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

      const resultList = allEnriched.slice(offset, Math.min(offset + limit, allEnriched.length));

      return {
        actors: resultList,
        hasMore: offset + limit < allEnriched.length,
        total: allEnriched.length,
        singleLoad: false,
      };
    };

    const result = await withCache(cacheKey, fetchActors, 3600);
    return NextResponse.json(result);

  } catch (error) {
    logger.error('Ошибка при получении актеров', {
      error: error instanceof Error ? error.message : String(error),
      context: 'AchievActorsAPI'
    });
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера' },
      { status: 500 }
    );
  }
}
