// src/lib/tmdb.ts
import { logger } from '@/lib/logger';
import { fetchTrendingMoviesMock, fetchPopularMoviesMock, searchMediaMock } from './tmdb-mock';
import { getTMDB, setTMDB } from './tmdbCache';
import { TMDbCast, TMDBCrew, TMDbPerson } from './types/tmdb';

export interface Media {
  id: number;
  media_type: 'movie' | 'tv';
  title: string;
  name?: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  release_date?: string;
  first_air_date?: string;
  overview: string;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  production_countries?: { iso_3166_1: string; name: string }[];
  original_language?: string;
  adult?: boolean;
}

// TMDB Collection Part type (used in collection API responses)
export interface TMDbCollectionPart {
  id: number;
  title: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  release_date?: string;
  overview: string;
}

// Generic type for TMDB list results
export interface TMDbListItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  release_date?: string;
  first_air_date?: string;
  overview: string;
}

/**
 * Transforms TMDB API response item to common Media format.
 * Preserves genre_ids and original_language for media type detection.
 * Correctly maps both movie and TV show fields.
 * 
 * @param item - Raw TMDB API response item
 * @returns Media - Transformed media object with all required fields
 */
function transformToMedia(item: TMDBMovieResponse): Media {
  return {
    id: item.id,
    media_type: item.media_type === 'tv' ? 'tv' : 'movie',
    title: item.title || item.name || 'Без названия',
    name: item.name || item.title || 'Без названия',
    poster_path: item.poster_path,
    vote_average: item.vote_average,
    vote_count: item.vote_count,
    release_date: item.release_date,
    first_air_date: item.first_air_date,
    overview: item.overview,
    genre_ids: item.genre_ids,
    original_language: item.original_language,
    adult: item.adult || false,
  };
}

// TMDB API Response types
interface TMDBMovieResponse {
  id: number;
  media_type: string;
  title?: string;
  name?: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  release_date?: string;
  first_air_date?: string;
  overview: string;
  adult?: boolean;
  genre_ids?: number[];
  original_language?: string;
}

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

// Проверяем, есть ли проблемы с сетью (прокси и т.д.) - только в development
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
const HAS_NETWORK_ISSUES = IS_DEVELOPMENT && !!(
  process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 
  process.env.https_proxy || process.env.http_proxy ||
  process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
);

// Убедитесь, что ключ загружен (для отладки)
if (!TMDB_API_KEY) {
  logger.warn('TMDB_API_KEY не найден! Проверьте .env.local', { context: 'TMDB' });
}

// Если есть проблемы с сетью в development, используем mock данные
if (HAS_NETWORK_ISSUES) {
  logger.info('Обнаружены проблемы с сетью в development, используем mock данные для TMDB', { context: 'TMDB' });
}

/**
 * Fetches trending movies and TV shows from TMDB.
 * Makes parallel requests to both /trending/movie/ and /trending/tv/ endpoints.
 * Returns combined array with correct media_type, genre_ids, and original_language.
 * 
 * @param timeWindow - 'day' for today's trending, 'week' for weekly trending
 * @returns Promise<Media[]> - Array of trending media (movies and TV shows)
 */
export const fetchTrendingMovies = async (timeWindow: 'day' | 'week' = 'week'): Promise<Media[]> => {
  const cacheKey = `trending:${timeWindow}`;
  
  // Check cache first (silent fallback)
  const cached = getTMDB<Media[]>(cacheKey);
  if (cached) {
    return cached;
  }
  
  // If there are network issues, return mock data without caching
  if (HAS_NETWORK_ISSUES) {
    return await fetchTrendingMoviesMock(timeWindow);
  }

  try {
    // Parallel requests for movies and TV shows
    const [movieUrl, tvUrl] = [
      new URL(`${BASE_URL}/trending/movie/${timeWindow}`),
      new URL(`${BASE_URL}/trending/tv/${timeWindow}`),
    ];
    
    [movieUrl, tvUrl].forEach(url => {
      url.searchParams.append('api_key', TMDB_API_KEY || '');
      url.searchParams.append('language', 'ru-RU');
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const [movieResponse, tvResponse] = await Promise.all([
      fetch(movieUrl.toString(), {
        headers: { 'accept': 'application/json' },
        signal: controller.signal,
      }),
      fetch(tvUrl.toString(), {
        headers: { 'accept': 'application/json' },
        signal: controller.signal,
      }),
    ]);
    
    clearTimeout(timeoutId);
    
    // Process responses
    const allMedia: Media[] = [];
    
    // Process movies response
    if (movieResponse.ok) {
      const movieData = await movieResponse.json();
      const movies = (movieData.results || []).map((item: TMDBMovieResponse) => transformToMedia(item));
      allMedia.push(...movies);
    } else {
      const errorText = await movieResponse.text();
      logger.error('Ошибка TMDB API при получении trending movies', { 
        status: movieResponse.status, 
        error: errorText, 
        context: 'TMDB' 
      });
    }
    
    // Process TV response
    if (tvResponse.ok) {
      const tvData = await tvResponse.json();
      const tvShows = (tvData.results || []).map((item: TMDBMovieResponse) => transformToMedia(item));
      allMedia.push(...tvShows);
    } else {
      const errorText = await tvResponse.text();
      logger.error('Ошибка TMDB API при получении trending TV', { 
        status: tvResponse.status, 
        error: errorText, 
        context: 'TMDB' 
      });
    }
    
    // Cache successful response (even if one failed, we cache what we got)
    if (allMedia.length > 0) {
      setTMDB(cacheKey, allMedia);
    }
    
    return allMedia;
  } catch (error) {
    logger.error('Сетевая ошибка при запросе к TMDB (trending)', { error, context: 'TMDB' });
    // Silent fallback: no error shown to user, try mock data
    return await fetchTrendingMoviesMock(timeWindow);
  }
};

/**
 * Fetches popular movies and TV shows from TMDB.
 * Makes parallel requests to both /movie/popular and /tv/popular endpoints.
 * Returns combined array with correct media_type, genre_ids, and original_language.
 * 
 * @param page - Page number for pagination (default: 1)
 * @returns Promise<Media[]> - Array of popular media (movies and TV shows)
 */
export const fetchPopularMovies = async (page: number = 1): Promise<Media[]> => {
  const cacheKey = `popular:${page}`;
  
  // Check cache first (silent fallback)
  const cached = getTMDB<Media[]>(cacheKey);
  if (cached) {
    return cached;
  }

  // Если есть проблемы с сетью, сразу возвращаем mock данные
  if (HAS_NETWORK_ISSUES) {
    return await fetchPopularMoviesMock(page);
  }

  try {
    // Parallel requests for popular movies and TV shows
    const [movieUrl, tvUrl] = [
      new URL(`${BASE_URL}/movie/popular`),
      new URL(`${BASE_URL}/tv/popular`),
    ];
    
    [movieUrl, tvUrl].forEach(url => {
      url.searchParams.append('api_key', TMDB_API_KEY || '');
      url.searchParams.append('language', 'ru-RU');
    });
    
    movieUrl.searchParams.append('page', page.toString());
    tvUrl.searchParams.append('page', page.toString());

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const [movieResponse, tvResponse] = await Promise.all([
      fetch(movieUrl.toString(), {
        headers: { 'accept': 'application/json' },
        signal: controller.signal,
      }),
      fetch(tvUrl.toString(), {
        headers: { 'accept': 'application/json' },
        signal: controller.signal,
      }),
    ]);
    
    clearTimeout(timeoutId);
    
    // Process responses
    const allMedia: Media[] = [];
    
    // Process popular movies response
    if (movieResponse.ok) {
      const movieData = await movieResponse.json();
      const movies = (movieData.results || []).map((item: TMDBMovieResponse) => transformToMedia(item));
      allMedia.push(...movies);
    } else {
      const errorText = await movieResponse.text();
      logger.error('Ошибка TMDB API при получении popular movies', { 
        status: movieResponse.status, 
        error: errorText, 
        context: 'TMDB' 
      });
    }
    
    // Process popular TV response
    if (tvResponse.ok) {
      const tvData = await tvResponse.json();
      const tvShows = (tvData.results || []).map((item: TMDBMovieResponse) => transformToMedia(item));
      allMedia.push(...tvShows);
    } else {
      const errorText = await tvResponse.text();
      logger.error('Ошибка TMDB API при получении popular TV', { 
        status: tvResponse.status, 
        error: errorText, 
        context: 'TMDB' 
      });
    }
    
    // Cache successful response (even if one failed, we cache what we got)
    if (allMedia.length > 0) {
      setTMDB(cacheKey, allMedia);
    }
    
    return allMedia;
  } catch (error) {
    logger.error('Ошибка при запросе популярных медиа', { error, context: 'TMDB' });
    // Silent fallback: no error shown to user
    return await fetchPopularMoviesMock(page);
  }
};

export const searchMedia = async (query: string, page: number = 1): Promise<Media[]> => {
  if (!query.trim()) return [];

  const cacheKey = `search:${query.trim().toLowerCase()}:${page}`;
  
  // Check cache first (silent fallback)
  const cached = getTMDB<Media[]>(cacheKey);
  if (cached) {
    return cached;
  }

  // Если есть проблемы с сетью, сразу возвращаем mock данные
  if (HAS_NETWORK_ISSUES) {
    return await searchMediaMock(query, page);
  }

  try {
    const url = new URL(`${BASE_URL}/search/multi`);
    url.searchParams.append('api_key', TMDB_API_KEY || '');
    url.searchParams.append('query', query.trim());
    url.searchParams.append('language', 'ru-RU');
    url.searchParams.append('page', page.toString());

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url.toString(), {
      headers: { 'accept': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.error('Ошибка TMDB search', { status: response.status, context: 'TMDB' });
      return [];
    }

    const data = await response.json();
    
    // Фильтруем только фильмы и сериалы
    const filteredResults = (data.results || []).filter(
      (item: TMDBMovieResponse) => item.media_type === 'movie' || item.media_type === 'tv'
    );
    
    // Преобразуем в общий формат Media
    const media: Media[] = filteredResults.map((item: TMDBMovieResponse) => ({
      id: item.id,
      media_type: item.media_type,
      title: item.title || item.name || 'Без названия',
      name: item.name || item.title || 'Без названия',
      poster_path: item.poster_path,
      vote_average: item.vote_average,
      vote_count: item.vote_count,
      release_date: item.release_date || item.first_air_date,
      first_air_date: item.first_air_date || item.release_date,
      overview: item.overview,
      genre_ids: item.genre_ids,
      original_language: item.original_language,
      adult: item.adult || false,
    }));

    const result = media.slice(0, 100); // Ограничиваем 100 результатами
    
    // Cache successful response for 24 hours
    setTMDB(cacheKey, result);
    
    return result;
  } catch (error) {
    logger.error('Ошибка при поиске медиа', { error, context: 'TMDB' });
    // Silent fallback: no error shown to user
    return await searchMediaMock(query, page);
  }
};

// Интерфейс для расширенных данных о фильме
export interface MovieDetails {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  release_date?: string | null;
  first_air_date?: string | null;
  overview: string;
  runtime?: number;
  episode_run_time?: number[];
  genres?: { id: number; name: string }[];
  original_language?: string;
  adult?: boolean;
}

// Получение деталей конкретного фильма/сериала
export const fetchMediaDetails = async (
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<MovieDetails | null> => {
  const cacheKey = `details:${mediaType}:${tmdbId}`;
  
  // Check cache first (silent fallback)
  const cached = getTMDB<MovieDetails>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const url = new URL(`${BASE_URL}/${mediaType}/${tmdbId}`);
    url.searchParams.append('api_key', TMDB_API_KEY || '');
    url.searchParams.append('language', 'ru-RU');
    url.searchParams.append('append_to_response', 'credits');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url.toString(), {
      headers: { 'accept': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.error('Ошибка TMDB details', { status: response.status, context: 'TMDB' });
      return null;
    }

    const data = await response.json();

    const result = {
      id: data.id,
      title: data.title,
      name: data.name,
      poster_path: data.poster_path,
      vote_average: data.vote_average || 0,
      vote_count: data.vote_count || 0,
      release_date: data.release_date,
      first_air_date: data.first_air_date,
      overview: data.overview || '',
      runtime: data.runtime,
      episode_run_time: data.episode_run_time,
      genres: data.genres || [],
      original_language: data.original_language,
      adult: data.adult || false,
    };
    
    // Cache successful response for 24 hours
    setTMDB(cacheKey, result);
    
    return result;
  } catch (error) {
    logger.error('Ошибка при получении деталей медиа', { error, context: 'TMDB' });
    // Silent fallback: return null without showing error to user
    return null;
  }
};

/**
 * Получает топ-5 актёров и режиссёров для фильма/сериала из TMDB
 * @param tmdbId - ID фильма в TMDB
 * @param mediaType - тип медиа ('movie' или 'tv')
 * @returns Объект с массивами topActors и topDirectors
 */
export const getMediaCredits = async (
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<{
  topActors: Array<{ id: number; name: string; character?: string }>;
  topDirectors: Array<{ id: number; name: string }>;
} | null> => {
  const cacheKey = `credits:${mediaType}:${tmdbId}`;
  
  // Check cache first
  const cached = getTMDB<{
    topActors: Array<{ id: number; name: string; character?: string }>;
    topDirectors: Array<{ id: number; name: string }>;
  }>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url = new URL(`${BASE_URL}/${mediaType}/${tmdbId}/credits`);
    url.searchParams.append('api_key', TMDB_API_KEY || '');
    url.searchParams.append('language', 'ru-RU');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url.toString(), {
      headers: { 'accept': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.debug('Ошибка TMDB credits', { status: response.status, context: 'TMDB' });
      return null;
    }

    const data = await response.json();

     // Extract top-5 actors
     const topActors = (data.cast || [])
       .slice(0, 5)
       .map((actor: TMDbCast) => ({
         id: actor.id,
         name: actor.name,
         character: actor.character,
       }));

     // Extract top directors (crew with job === 'Director')
     const topDirectors = (data.crew || [])
       .filter((member: TMDBCrew) => member.job === 'Director')
       .slice(0, 5)
       .map((director: TMDBCrew) => ({
         id: director.id,
         name: director.name,
       }));

    const result = { topActors, topDirectors };

    // Cache for 7 days
    setTMDB(cacheKey, result);

    return result;
  } catch (error) {
    logger.debug('Ошибка при получении кредитов медиа', {
      error: error instanceof Error ? error.message : String(error),
      tmdbId,
      mediaType,
      context: 'TMDB'
    });
    return null;
  }
};

/**
 * Получает постер фильма из FANART_TV (резервный источник)
 * @param tmdbId - ID фильма в TMDB
 * @param mediaType - тип медиа ('movie' или 'tv')
 * @returns URL постера из FANART_TV или null
 */
export const getFanartTvPoster = async (
  tmdbId: number,
  mediaType: 'movie' | 'tv' = 'movie'
): Promise<string | null> => {
  const FANART_API_KEY = process.env.FANART_API_KEY;
  
  if (!FANART_API_KEY) {
    // FANART_API_KEY опциональный, просто логируем что его нет
    return null;
  }

  try {
    const endpoint = mediaType === 'tv' ? 'series' : 'movies';
    const url = `https://webservice.fanart.tv/v3/${endpoint}/${tmdbId}?api_key=${FANART_API_KEY}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 секунды таймаут
    
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      logger.warn('FANART_TV API не вернул постер', {
        status: response.status,
        tmdbId,
        mediaType,
        context: 'FANART_TV'
      });
      return null;
    }
    
    const data = await response.json();
    
    // Ищем постер в приоритете: movieposter (основной) → moviethumb (превью)
    // Берем первый из доступных (Fanart.tv возвращает массивы)
    const posters = data.movieposter || data.tvposter || [];
    if (Array.isArray(posters) && posters.length > 0) {
      const poster = posters[0];
      return poster.url || null;
    }
    
    // Альтернатива - thumbs
    const thumbs = data.moviethumb || data.tvthumb || [];
    if (Array.isArray(thumbs) && thumbs.length > 0) {
      const thumb = thumbs[0];
      return thumb.url || null;
    }
    
    logger.debug('No poster found in FANART_TV', { tmdbId, mediaType, context: 'FANART_TV' });
    return null;
  } catch (error) {
    logger.warn('Ошибка при получении постера из FANART_TV', {
      error: error instanceof Error ? error.message : String(error),
      tmdbId,
      mediaType,
      context: 'FANART_TV'
    });
    return null;
  }
};

