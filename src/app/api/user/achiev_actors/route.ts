import { NextResponse } from 'next/server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { MOVIE_STATUS_IDS } from '@/lib/movieStatusConstants';
import { withCache } from '@/lib/redis';
import { logger } from '@/lib/logger';
import type { MovieDetails, TMDbMediaBase, TMDbGenre, TMDbPersonCastCredit, TMDbPersonCrewCredit, TMDbPersonCredits } from '@/lib/types/tmdb';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

// Кэш для фильмографии актёров
const actorCreditsCache = new Map<number, { data: unknown; timestamp: number }>();
const CACHE_DURATION = 86400000; // 24 часа

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

function isAnime(movie: TMDbMediaBase): boolean {
  const hasAnimeGenre = movie.genres?.some((g: TMDbGenre) => g.id === 16) ?? false;
  const isJapanese = movie.original_language === 'ja';
  return hasAnimeGenre && isJapanese;
}

function isCartoon(movie: TMDbMediaBase): boolean {
  const hasAnimationGenre = movie.genres?.some((g: TMDbGenre) => g.id === 16) ?? false;
  const isNotJapanese = movie.original_language !== 'ja';
  return hasAnimationGenre && isNotJapanese;
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

async function fetchMovieCredits(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<{ cast: Array<{ id: number; name: string; profile_path: string | null; character: string }> } | null> {
  if (!TMDB_API_KEY) return null;
  
  try {
    const url = new URL(`${BASE_URL}/${mediaType}/${tmdbId}/credits`);
    url.searchParams.append('api_key', TMDB_API_KEY);
    url.searchParams.append('language', 'ru-RU');

    const response = await fetch(url.toString(), {
      headers: { 'accept': 'application/json' },
      next: { revalidate: 86400, tags: [`${mediaType}-credits`] },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

async function fetchPersonCredits(actorId: number): Promise<TMDbPersonCredits | null> {
  const cached = actorCreditsCache.get(actorId);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    return cached.data as Awaited<ReturnType<typeof fetchPersonCredits>>;
  }

  if (!TMDB_API_KEY) return null;

  try {
    const url = new URL(`${BASE_URL}/person/${actorId}/combined_credits`);
    url.searchParams.append('api_key', TMDB_API_KEY);
    url.searchParams.append('language', 'ru-RU');

    const response = await fetch(url.toString(), {
      headers: { 'accept': 'application/json' },
      next: { revalidate: 86400, tags: ['person-credits'] },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    actorCreditsCache.set(actorId, { data, timestamp: now });
    return data as Awaited<ReturnType<typeof fetchPersonCredits>>;
  } catch {
    return null;
  }
}

type ActorEntry = {
  id: number;
  name: string;
  profile_path: string | null;
  watchedIds: Set<number>;
  rewatchedIds: Set<number>;
  droppedIds: Set<number>;
  ratings: number[];
  watched_movies: number;
  rewatched_movies: number;
  dropped_movies: number;
  total_movies: number;
  progress_percent: number;
  average_rating: number | null;
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
            userRating: true,
          },
        }),
      ]);

      if (watchedMoviesData.length === 0 && rewatchedMoviesData.length === 0) {
        return { actors: [], hasMore: false, total: 0 };
      }

      const actorMap = new Map<number, ActorEntry>();

      const BATCH_SIZE = 10;
      for (let i = 0; i < watchedMoviesData.length; i += BATCH_SIZE) {
        const batch = watchedMoviesData.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.all(
          batch.map(async (movie) => {
            const mediaDetails = await fetchMediaDetails(movie.tmdbId, movie.mediaType as 'movie' | 'tv');
            
            if (mediaDetails && (isAnime(mediaDetails) || isCartoon(mediaDetails))) {
              return { credits: null, rating: movie.userRating };
            }
            
             const credits = await fetchMovieCredits(movie.tmdbId, movie.mediaType as 'movie' | 'tv');
             return { credits, rating: movie.userRating, tmdbId: movie.tmdbId };
          })
        );

         for (const { credits, rating, tmdbId } of results) {
          if (credits?.cast) {
            const topActors = credits.cast.slice(0, 5);
            
            for (const actor of topActors) {
              if (!actorMap.has(actor.id)) {
                actorMap.set(actor.id, {
                  id: actor.id,
                  name: actor.name,
                  profile_path: actor.profile_path,
                  watchedIds: new Set(),
                  rewatchedIds: new Set(),
                  droppedIds: new Set(),
                  ratings: [],
                  watched_movies: 0,
                  rewatched_movies: 0,
                  dropped_movies: 0,
                  total_movies: 0,
                  progress_percent: 0,
                  average_rating: null,
                });
              }
              
                const actorEntry = actorMap.get(actor.id)!;
                actorEntry.watchedIds.add(tmdbId);
                if (rating !== null && rating !== undefined) {
                actorEntry.ratings.push(rating);
              }
            }
          }
        }

        if (i + BATCH_SIZE < watchedMoviesData.length) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }

      for (let i = 0; i < rewatchedMoviesData.length; i += BATCH_SIZE) {
        const batch = rewatchedMoviesData.slice(i, i + BATCH_SIZE);
        
        await Promise.all(
          batch.map(async (movie) => {
            const credits = await fetchMovieCredits(movie.tmdbId, movie.mediaType as 'movie' | 'tv');
            
            if (credits?.cast) {
              for (const actor of credits.cast) {
                 if (actorMap.has(actor.id)) {
                   actorMap.get(actor.id)!.rewatchedIds.add(movie.tmdbId);
                   const actorEntry = actorMap.get(actor.id)!;
                  if (movie.userRating !== null && movie.userRating !== undefined) {
                    actorEntry.ratings.push(movie.userRating);
                  }
                }
              }
            }
          })
        );

        if (i + BATCH_SIZE < rewatchedMoviesData.length) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }

      for (let i = 0; i < droppedMoviesData.length; i += BATCH_SIZE) {
        const batch = droppedMoviesData.slice(i, i + BATCH_SIZE);
        
        await Promise.all(
          batch.map(async (movie) => {
            const credits = await fetchMovieCredits(movie.tmdbId, movie.mediaType as 'movie' | 'tv');
            
            if (credits?.cast) {
              for (const actor of credits.cast) {
               if (actorMap.has(actor.id)) {
                 actorMap.get(actor.id)!.droppedIds.add(movie.tmdbId);
               }
              }
            }
          })
        );

        if (i + BATCH_SIZE < droppedMoviesData.length) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }

      const allActors = Array.from(actorMap.entries())
        .sort((a, b) => b[1].watchedIds.size - a[1].watchedIds.size);
      
      const baseActorsData = allActors.map(([actorId, actorData]) => ({
        id: actorId,
        name: actorData.name,
        profile_path: actorData.profile_path,
        watched_movies: actorData.watchedIds.size + actorData.rewatchedIds.size,
        rewatched_movies: actorData.rewatchedIds.size,
        dropped_movies: actorData.droppedIds.size,
        total_movies: 0,
        progress_percent: 0,
        average_rating: actorData.ratings.length > 0
          ? Number((actorData.ratings.reduce((a, b) => a + b, 0) / actorData.ratings.length).toFixed(1))
          : null,
      }));

      if (singleLoad) {
        const maxActorsToProcess = Math.min(baseActorsData.length, limit);
        const actorsToProcess = baseActorsData.slice(0, maxActorsToProcess);
        
        const batchSize = 10;
        const achievementsPromises: Promise<ActorEntry[]>[] = [];
        
        for (let i = 0; i < actorsToProcess.length; i += batchSize) {
          const batch = actorsToProcess.slice(i, i + batchSize);
          
          const batchPromises = batch.map(async (actor): Promise<ActorEntry> => {
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
              const watchedMovies = actor.watched_movies;
              
              const progressPercent = totalMovies > 0 
                ? Math.round((watchedMovies / totalMovies) * 100)
                : 0;

               const originalEntry = actorMap.get(actor.id)!;
               return {
                 ...originalEntry,
                 total_movies: totalMovies,
                 progress_percent: progressPercent,
               };
            } catch {
              const originalEntry = actorMap.get(actor.id)!;
              return {
                ...originalEntry,
                total_movies: actor.watched_movies,
                progress_percent: actor.watched_movies > 0 ? 100 : 0,
              };
            }
          });
          
          achievementsPromises.push(Promise.all(batchPromises));
        }

        const allActorsWithFullData = (await Promise.all(achievementsPromises)).flat();
        
        const actorsWithScores = allActorsWithFullData.map(actor => ({
          ...actor,
          actor_score: calculateActorScore(actor)
        }));
        
        actorsWithScores.sort((a, b) => b.actor_score - a.actor_score);

        const result = actorsWithScores.slice(0, limit);

        return {
          actors: result,
          hasMore: false,
          total: allActorsWithFullData.length,
          singleLoad: true,
        };
      }

      const actorsForProcessing = baseActorsData.slice(0, Math.min(offset + limit + 50, baseActorsData.length));
      
      const achievementsPromises = actorsForProcessing.map(async (actor) => {
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
        const watchedMovies = actor.watched_movies;
        
        const progressPercent = totalMovies > 0 
          ? Math.round((watchedMovies / totalMovies) * 100)
          : 0;

         const originalEntry = actorMap.get(actor.id)!;
         return {
           ...originalEntry,
           total_movies: totalMovies,
           progress_percent: progressPercent,
         };
      });

      const actorsWithFullData = await Promise.all(achievementsPromises);
      
      actorsWithFullData.sort((a, b) => {
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

      const result = actorsWithFullData.slice(offset, Math.min(offset + limit, actorsWithFullData.length));

      return {
        actors: result,
        hasMore: offset + limit < baseActorsData.length,
        total: baseActorsData.length,
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