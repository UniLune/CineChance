// Helper function to fetch TMDB media details
async function fetchMediaDetails(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<{
  genre_ids: number[];
  original_language: string;
} | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    logger.warn('TMDB API key not configured', {
      context: 'CollectionAPI',
      tmdbId,
    });
    return null;
  }
  const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${apiKey}&language=ru-RU`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      next: { revalidate: 86400 },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      logger.warn('TMDB fetch failed', {
        context: 'CollectionAPI',
        tmdbId,
        status: res.status,
      });
      return null;
    }

    const data = await res.json();
    
    // IMPORTANT: TMDB movie/{id} and tv/{id} endpoints return genres array, not genre_ids!
    // Convert genres to genre_ids for consistency with search API
    let genreIds: number[] = [];
    if (data.genres && Array.isArray(data.genres)) {
      genreIds = data.genres.map((g: any) => g.id);
    } else if (data.genre_ids && Array.isArray(data.genre_ids)) {
      genreIds = data.genre_ids;
    }
    
    const result = {
      genre_ids: genreIds,
      original_language: data.original_language || '',
    };

    logger.debug('TMDB fetch successful', {
      context: 'CollectionAPI',
      tmdbId,
      genre_ids: result.genre_ids,
      original_language: result.original_language,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn('Failed to fetch TMDB details for movie in collection', {
      tmdbId,
      mediaType,
      error: errorMessage,
      context: 'CollectionAPI'
    });
    return null;
  }
}

// src/app/api/collection/[id]/route.ts

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/middleware/rateLimit';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import type { TMDbCollectionPart } from '@/lib/tmdb';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Get session FIRST for userId-based rate limiting
const session = await getServerSession(authOptions);
const userId = session?.user?.id;

// Rate limit with userId if authenticated, IP if not
const { success } = await rateLimit(req, '/api/collection', userId);
  if (!success) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }
  
  // Destructure id from params at function scope for catch block usage
  const { id } = await params;
  const collectionId = parseInt(id);

  if (!collectionId) {
    return NextResponse.json({ error: 'Invalid collection ID' }, { status: 400 });
  }

  try {

    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'TMDB API key not configured' }, { status: 500 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${apiKey}&language=ru-RU`,
      { 
        next: { revalidate: 86400 },
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!res.ok) {
      logger.warn('TMDB API error', {
        status: res.status,
        collectionId,
        context: 'CollectionAPI'
      });
      return NextResponse.json({ error: 'Failed to fetch from TMDB' }, { status: 500 });
    }

    const data = await res.json();

    logger.debug('TMDB Collection response', {
      context: 'CollectionAPI',
      collectionId,
      firstPartKeys: data.parts && data.parts.length > 0 ? Object.keys(data.parts[0]) : [],
      firstPartData: data.parts && data.parts.length > 0 ? {
        id: data.parts[0].id,
        title: data.parts[0].title,
        genre_ids: data.parts[0].genre_ids,
        original_language: data.parts[0].original_language,
      } : null,
    });

    // Получаем все blacklist IDs пользователя одним запросом
    let blacklistedIds: Set<number> = new Set();
    if (userId) {
      const blacklist = await prisma.blacklist.findMany({
        where: { userId },
        select: { tmdbId: true }
      });
      blacklistedIds = new Set(blacklist.map(b => b.tmdbId));
    }

    // Получаем все watchlist статусы пользователя одним запросом
    // Оптимизировано: используем select вместо include
    const watchlistMap: Map<string, { status: string | null; userRating: number | null }> = new Map();
    if (userId) {
      const watchlist = await prisma.watchList.findMany({
        where: { userId },
        select: {
          tmdbId: true,
          mediaType: true,
          status: { select: { name: true } },
          userRating: true,
          weightedRating: true, // Добавляем взвешенную оценку
        }
      });
      watchlist.forEach((item) => {
        watchlistMap.set(`${item.mediaType}_${item.tmdbId}`, { 
          status: item.status?.name || null, 
          userRating: item.weightedRating ?? item.userRating // Используем взвешенную оценку
        });
      });
    }

    // Формируем данные о фильмах и получаем TMDB детали для определения типа
    const moviesWithStatus = await Promise.all(
      (data.parts || []).map(async (movie: TMDbCollectionPart) => {
        const watchlistKey = `movie_${movie.id}`;
        const watchlistData = watchlistMap.get(watchlistKey);
        const isBlacklisted = blacklistedIds.has(movie.id);

        // Получаем TMDB детали для определения типа (аниме/мульт)
        const tmdbDetails = await fetchMediaDetails(movie.id, 'movie');

        logger.debug('MovieCard data from API', {
          context: 'CollectionAPI',
          movieId: movie.id,
          genre_ids: tmdbDetails?.genre_ids,
          original_language: tmdbDetails?.original_language,
        });

        const movieData = {
          id: movie.id,
          media_type: 'movie' as const,
          title: movie.title,
          name: movie.title,
          poster_path: movie.poster_path,
          vote_average: movie.vote_average,
          vote_count: movie.vote_count,
          release_date: movie.release_date,
          first_air_date: movie.release_date,
          overview: movie.overview,
          isBlacklisted,
          // Добавляем genre_ids и original_language для определения типа (Аниме/Мульт)
          genre_ids: tmdbDetails?.genre_ids ?? [],
          original_language: tmdbDetails?.original_language ?? '',
          // Добавляем status и userRating если есть в watchlist
          ...(watchlistData && {
            status: watchlistData.status,
            userRating: watchlistData.userRating,
          }),
        };

        return movieData;
      })
    );

    return NextResponse.json({
      id: data.id,
      name: data.name,
      overview: data.overview,
      poster_path: data.poster_path,
      backdrop_path: data.backdrop_path,
      parts: moviesWithStatus,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Collection error', { 
      error: errorMsg,
      collectionId: id,
      context: 'CollectionAPI'
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
