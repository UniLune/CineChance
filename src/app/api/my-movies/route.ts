export const dynamic = 'force-dynamic';
export const dynamicParams = true;

// src/app/api/my-movies/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { MOVIE_STATUS_IDS, getStatusIdByName, getStatusNameById } from '@/lib/movieStatusConstants';
import { calculateCineChanceScore } from '@/lib/calculateCineChanceScore';
import { logger } from '@/lib/logger';
import { trackOutcome } from '@/lib/recommendation-outcome-tracking';

const ITEMS_PER_PAGE = 20;

// Helper function to get TMDB details
async function fetchMediaDetails(tmdbId: number, mediaType: 'movie' | 'tv') {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;
  const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${apiKey}&language=ru-RU`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch(url, { 
      next: { revalidate: 86400 },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Helper function to get CineChance ratings
async function fetchCineChanceRatings(tmdbIds: number[]) {
  if (tmdbIds.length === 0) return new Map();

  const watchlistRecords = await prisma.watchList.groupBy({
    by: ['tmdbId'],
    _avg: { userRating: true },
    _count: { userRating: true },
    where: { tmdbId: { in: tmdbIds }, userRating: { not: null } },
  });

  const ratingsMap = new Map<number, { averageRating: number; count: number }>();
  watchlistRecords.forEach(record => {
    if (record._avg.userRating && record._count.userRating > 0) {
      ratingsMap.set(record.tmdbId, {
        averageRating: record._avg.userRating,
        count: record._count.userRating,
      });
    }
  });
  return ratingsMap;
}

// Helper function to check if movie is anime
function isAnime(movie: any): boolean {
  let hasAnimeGenre = false;
  
  if (Array.isArray(movie.genre_ids)) {
    hasAnimeGenre = movie.genre_ids.includes(16);
  } else if (Array.isArray(movie.genres)) {
    hasAnimeGenre = movie.genres.some((g: any) => g.id === 16);
  }
  
  return hasAnimeGenre && movie.original_language === 'ja';
}

// Helper function to check if movie is cartoon (animation but not Japanese)
function isCartoon(movie: any): boolean {
  let hasAnimationGenre = false;
  
  if (Array.isArray(movie.genre_ids)) {
    hasAnimationGenre = movie.genre_ids.includes(16);
  } else if (Array.isArray(movie.genres)) {
    hasAnimationGenre = movie.genres.some((g: any) => g.id === 16);
  }
  
  return hasAnimationGenre && movie.original_language !== 'ja';
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || String(ITEMS_PER_PAGE));
    const sortBy = searchParams.get('sortBy') || 'rating';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const statusNameParam = searchParams.get('statusName');
    const includeHidden = searchParams.get('includeHidden') === 'true';

    // Parse filters
    const typesParam = searchParams.get('types');
    const yearFrom = searchParams.get('yearFrom');
    const yearTo = searchParams.get('yearTo');
    const minRating = parseFloat(searchParams.get('minRating') || '0');
    const maxRating = parseFloat(searchParams.get('maxRating') || '10');
    const genresParam = searchParams.get('genres');
    const tagsParam = searchParams.get('tags');

    logger.debug('Request params', {
      context: 'my-movies',
      page,
      limit,
      typesParam,
      yearFrom,
      yearTo,
      minRating,
      maxRating,
      genresParam: genresParam ? 'yes' : 'no',
      tagsParam: tagsParam ? 'yes' : 'no'
    });

    // Build where clause
    const whereClause: Record<string, unknown> = { userId };

    if (statusNameParam) {
      const statusNames = statusNameParam.split(',');
      const statusIds = statusNames.map(name => getStatusIdByName(name)).filter(id => id !== null) as number[];
      if (statusIds.length > 0) {
        whereClause.statusId = { in: statusIds };
      }
    }

    // Add tag filter to WHERE clause for efficient database filtering
    if (tagsParam) {
      const tagIds = tagsParam.split(',');
      whereClause.tags = {
        some: {
          id: { in: tagIds }
        }
      };
    }

    if (includeHidden) {
    // For hidden tab, we use blacklist
      // Determine if any TMDB-based filters are active
      const hasTMDBFilters = Boolean(
        (typesParam && typesParam !== 'all' && typesParam.trim() !== '') ||
        yearFrom ||
        yearTo
      );

      let blacklistRecords;
      let totalCount: number;

      if (hasTMDBFilters) {
        // When TMDB-based filters are active, fetch ALL records then filter and paginate
        logger.debug('Hidden tab: Using fetch-all-then-filter strategy', {
          context: 'my-movies',
          hasTMDBFilters,
          typesParam,
          yearFrom,
          yearTo
        });

        blacklistRecords = await prisma.blacklist.findMany({
          where: { userId },
          select: { tmdbId: true, mediaType: true, createdAt: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });

        totalCount = blacklistRecords.length;
      } else {
        // No TMDB filters - use efficient DB pagination
        const pageSkip = (page - 1) * limit;
        const pageTake = limit + 1; // +1 to detect hasMore

        // Count total
        totalCount = await prisma.blacklist.count({ where: { userId } });

        // Get records
        blacklistRecords = await prisma.blacklist.findMany({
          where: { userId },
          select: { tmdbId: true, mediaType: true, createdAt: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: pageSkip,
          take: pageTake,
        });
      }

      // Early exit if no records
      if (blacklistRecords.length === 0) {
        return NextResponse.json({
          movies: [],
          hasMore: false,
          totalCount: 0,
        });
      }

      // Get ratings
      const tmdbIds = blacklistRecords.map(r => r.tmdbId);
      const ratingsMap = await fetchCineChanceRatings(tmdbIds);

      // Fetch TMDB data
      const moviesWithDetails = await Promise.all(
        blacklistRecords.map(async (record) => {
          // ИСПРАВЛЕНИЕ 1: Добавлено "as 'movie' | 'tv'"
          const tmdbData = await fetchMediaDetails(record.tmdbId, record.mediaType as 'movie' | 'tv');
          const cineChanceData = ratingsMap.get(record.tmdbId);

          return {
            record,
            tmdbData,
            cineChanceData,
            isAnime: tmdbData ? isAnime(tmdbData) : false,
            isCartoon: tmdbData ? isCartoon(tmdbData) : false,
          };
        })
      );

      // Filter movies
      const filteredMovies = moviesWithDetails.filter(({ record, tmdbData, isAnime, isCartoon }) => {
        if (!tmdbData) return false;

        // Type filter - пропускаем если typesParam равен 'all' или null/undefined
        if (typesParam && typesParam !== 'all' && typesParam.trim() !== '') {
          const types = typesParam.split(',').filter(t => t.trim() !== '');
          const isAnimeItem = isAnime;
          const isCartoonItem = isCartoon;
          const isMovieItem = record.mediaType === 'movie';
          const isTvItem = record.mediaType === 'tv';

          // Определяем тип контента
          if (isAnimeItem) {
            // Это аниме - показываем только если 'anime' в списке типов
            if (!types.includes('anime')) return false;
          } else if (isCartoonItem) {
            // Это мульт - показываем только если 'cartoon' в списке типов
            if (!types.includes('cartoon')) return false;
          } else if (isMovieItem) {
            // Это фильм - показываем только если 'movie' в списке типов
            if (!types.includes('movie')) return false;
          } else if (isTvItem) {
            // Это сериал - показываем только если 'tv' в списке типов
            if (!types.includes('tv')) return false;
          }
        }

        // Year filter
        const releaseYear = (tmdbData.release_date || tmdbData.first_air_date || '').split('-')[0];
        if (yearFrom && parseInt(releaseYear) < parseInt(yearFrom)) return false;
        if (yearTo && parseInt(releaseYear) > parseInt(yearTo)) return false;

        return true;
      });

      // Transform to output format
      const movies = filteredMovies.map(({ record, tmdbData, cineChanceData }) => {
        const cineChanceRating = cineChanceData?.averageRating || null;
        const cineChanceVotes = cineChanceData?.count || 0;

        const combinedRating = calculateCineChanceScore({
          tmdbRating: tmdbData?.vote_average || 0,
          tmdbVotes: tmdbData?.vote_count || 0,
          cineChanceRating,
          cineChanceVotes,
        });

        return {
          id: record.tmdbId,
          media_type: record.mediaType as 'movie' | 'tv',
          title: tmdbData?.title || tmdbData?.name || 'Без названия',
          name: tmdbData?.title || tmdbData?.name || 'Без названия',
          poster_path: tmdbData?.poster_path || null,
          vote_average: tmdbData?.vote_average || 0,
          vote_count: tmdbData?.vote_count || 0,
          release_date: tmdbData?.release_date || tmdbData?.first_air_date || '',
          first_air_date: tmdbData?.release_date || tmdbData?.first_air_date || '',
          overview: tmdbData?.overview || '',
          genre_ids: tmdbData?.genres?.map((g: any) => g.id) || [],
          original_language: tmdbData?.original_language || '',
          combinedRating,
          averageRating: cineChanceRating,
          ratingCount: cineChanceVotes,
          addedAt: record.createdAt?.toISOString() || '',
          userRating: null,
          isBlacklisted: true,
        };
      });

      // Sort movies
      const sortedMovies = sortMovies(movies, sortBy, sortOrder);

      // Paginate filtered results
      const pageStartIndex = (page - 1) * limit;
      const pageEndIndex = pageStartIndex + limit;
      const paginatedMovies = sortedMovies.slice(pageStartIndex, pageEndIndex);
      
      // hasMore: Check if there are more records after this page
      const hasMore = pageEndIndex < sortedMovies.length;

      return NextResponse.json({
        movies: paginatedMovies,
        hasMore,
        totalCount: sortedMovies.length,
      });
    }

    // For regular tabs (watched, wantToWatch, dropped)
    // Determine if any TMDB-based filters are active
    const hasTMDBFilters = Boolean(
      (typesParam && typesParam !== 'all' && typesParam.trim() !== '') ||
      yearFrom ||
      yearTo ||
      genresParam
    );

    // Rating filter CAN be done at DB level since userRating is in watchList
    // Build rating filter for DB if needed
    let ratingFilter: { userRating?: { gte?: number; lte?: number } } | undefined;
    if (minRating > 0 || maxRating < 10) {
      ratingFilter = {};
      if (minRating > 0) ratingFilter.userRating = { gte: minRating };
      if (maxRating < 10) {
        ratingFilter.userRating = {
          ...ratingFilter.userRating,
          lte: maxRating
        };
      }
    }

    // Add rating filter to whereClause if applicable
    const whereClauseWithRating = ratingFilter
      ? { ...whereClause, ...ratingFilter }
      : whereClause;

    let watchListRecords;
    let totalCount: number;

    // Use FIXED buffer based on whether filters are active, NOT page number.
    // Each page request is independent, so we need consistent data.
    // This is the proven approach from 2026-02-19 fix.
    const hasFilters = hasTMDBFilters || minRating > 0 || maxRating < 10 || yearFrom || yearTo;
    const BUFFER_SIZE = hasFilters ? 1000 : 100; // Fixed buffer, not page-dependent

    logger.debug('Using fixed buffer pagination', {
      context: 'my-movies',
      hasFilters,
      page,
      limit,
      bufferSize: BUFFER_SIZE
    });

    // Always fetch from start with fixed buffer
    watchListRecords = await prisma.watchList.findMany({
      where: whereClauseWithRating,
      select: {
        id: true,
        tmdbId: true,
        mediaType: true,
        title: true,
        voteAverage: true,
        userRating: true,
        weightedRating: true,
        addedAt: true,
        statusId: true,
        tags: { select: { id: true, name: true } },
      },
      orderBy: [{ addedAt: 'desc' }, { id: 'desc' }],
      take: BUFFER_SIZE,
    });

    totalCount = await prisma.watchList.count({ where: whereClauseWithRating });

    // Early exit if no records
    if (watchListRecords.length === 0) {
      return NextResponse.json({
        movies: [],
        hasMore: false,
        totalCount: 0,
      });
    }

    // Fetch all ratings and TMDB data
    const tmdbIds = watchListRecords.map(r => r.tmdbId);
    const ratingsMap = await fetchCineChanceRatings(tmdbIds);

    // Fetch TMDB data
    const moviesWithDetails = await Promise.all(
      watchListRecords.map(async (record) => {
        const tmdbData = await fetchMediaDetails(record.tmdbId, record.mediaType as 'movie' | 'tv');
        const cineChanceData = ratingsMap.get(record.tmdbId);

        return {
          record,
          tmdbData,
          cineChanceData,
          isAnime: tmdbData ? isAnime(tmdbData) : false,
          isCartoon: tmdbData ? isCartoon(tmdbData) : false,
        };
      })
    );

    // Filter movies
    logger.debug('Before filter', { context: 'my-movies', count: moviesWithDetails.length });
    const filteredMovies = moviesWithDetails.filter(({ record, tmdbData, isAnime, isCartoon }) => {
      if (!tmdbData) return false;

      // Type filter - пропускаем если typesParam равен 'all' или null/undefined
      if (typesParam && typesParam !== 'all' && typesParam.trim() !== '') {
        const types = typesParam.split(',').filter(t => t.trim() !== '');
        const isAnimeItem = isAnime;
        const isCartoonItem = isCartoon;
        const isMovieItem = record.mediaType === 'movie';
        const isTvItem = record.mediaType === 'tv';

        // Определяем тип контента
        if (isAnimeItem) {
          // Это аниме - показываем только если 'anime' в списке типов
          if (!types.includes('anime')) return false;
        } else if (isCartoonItem) {
          // Это мульт - показываем только если 'cartoon' в списке типов
          if (!types.includes('cartoon')) return false;
        } else if (isMovieItem) {
          // Это фильм - показываем только если 'movie' в списке типов
          if (!types.includes('movie')) return false;
        } else if (isTvItem) {
          // Это сериал - показываем только если 'tv' в списке типов
          if (!types.includes('tv')) return false;
        }
      }

      // Year filter
      const releaseYear = (tmdbData.release_date || tmdbData.first_air_date || '').split('-')[0];
      if (yearFrom && parseInt(releaseYear) < parseInt(yearFrom)) return false;
      if (yearTo && parseInt(releaseYear) > parseInt(yearTo)) return false;

      // Rating filter is now handled at DB level via Prisma WHERE clause (ratingFilter)
      // No need to filter in memory

      // Genre filter
      if (genresParam) {
        const genreIds = genresParam.split(',').map(Number);
        const movieGenres = tmdbData.genres?.map((g: any) => g.id) || [];
        const hasMatchingGenre = genreIds.some(genreId => movieGenres.includes(genreId));
        if (!hasMatchingGenre) return false;
      }

      // Tags filter is now handled at DB level via Prisma WHERE clause, no need to filter in memory

      return true;
    });

    logger.debug('After filter', { context: 'my-movies', count: filteredMovies.length });

    // Transform to output format
    const movies = filteredMovies.map(({ record, tmdbData, cineChanceData }) => {
      const cineChanceRating = cineChanceData?.averageRating || null;
      const cineChanceVotes = cineChanceData?.count || 0;

      const combinedRating = calculateCineChanceScore({
        tmdbRating: tmdbData?.vote_average || 0,
        tmdbVotes: tmdbData?.vote_count || 0,
        cineChanceRating,
        cineChanceVotes,
      });

      return {
        id: record.tmdbId,
        media_type: record.mediaType as 'movie' | 'tv',
        title: record.title,
        name: record.title,
        poster_path: tmdbData?.poster_path || null,
        vote_average: tmdbData?.vote_average || 0,
        vote_count: tmdbData?.vote_count || 0,
        release_date: tmdbData?.release_date || tmdbData?.first_air_date || '',
        first_air_date: tmdbData?.release_date || tmdbData?.first_air_date || '',
        overview: tmdbData?.overview || '',
        genre_ids: tmdbData?.genres?.map((g: any) => g.id) || [],
        original_language: tmdbData?.original_language || '',
        statusName: getStatusNameById(record.statusId) || 'Unknown',
        combinedRating,
        averageRating: cineChanceRating,
        ratingCount: cineChanceVotes,
        addedAt: record.addedAt?.toISOString() || '',
        userRating: record.weightedRating ?? record.userRating, // Fallback на взвешенную оценку
        tags: record.tags || [],
      };
    });

    // Sort movies
    const sortedMovies = sortMovies(movies, sortBy, sortOrder);

    // Paginate: use limit for slicing
    const pageStartIndex = (page - 1) * limit;
    const pageEndIndex = pageStartIndex + limit;
    const paginatedMovies = sortedMovies.slice(pageStartIndex, pageEndIndex);
    
    // hasMore: Check if there are more records in the filtered/sorted result
    const hasMore = sortedMovies.length > pageEndIndex;

    logger.debug('Pagination result', {
      context: 'my-movies',
      page,
      limit,
      hasTMDBFilters,
      watchListRecordsLength: watchListRecords.length,
      sortedMoviesLength: sortedMovies.length,
      paginatedMoviesLength: paginatedMovies.length,
      hasMore,
      pageStartIndex,
      pageEndIndex
    });

    return NextResponse.json({
      movies: paginatedMovies,
      hasMore,
      totalCount: sortedMovies.length,
    });
  } catch (error) {
    logger.error('Error fetching my movies', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function sortMovies(
  movies: any[],
  sortBy: string,
  sortOrder: string
): any[] {
  return [...movies].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'popularity':
        comparison = b.vote_count - a.vote_count;
        break;
      case 'rating':
        const ratingA = a.combinedRating ?? a.vote_average;
        const ratingB = b.combinedRating ?? b.vote_average;
        comparison = ratingB - ratingA;
        break;
      case 'date':
        const dateA = a.release_date || a.first_air_date || '';
        const dateB = b.release_date || b.first_air_date || '';
        comparison = dateB.localeCompare(dateA);
        break;
      case 'savedDate':
        const savedA = a.addedAt || '';
        const savedB = b.addedAt || '';
        comparison = savedB.localeCompare(savedA);
        break;
      default:
        comparison = 0;
    }

    // Secondary sort by id to ensure stable ordering
    if (comparison === 0) {
      comparison = (a.id || 0) - (b.id || 0);
    }

    return sortOrder === 'desc' ? comparison : -comparison;
  });
}

// POST endpoint for updating watch status
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    
    const { action, tmdbId, mediaType, newStatus, rating, recommendationLogId } = body;

    if (action === 'updateWatchStatus') {
      // Находим или создаем запись в WatchList
      let watchListEntry = await prisma.watchList.findUnique({
        where: {
          userId_tmdbId_mediaType: { userId, tmdbId, mediaType },
        },
      });

      if (!watchListEntry) {
        // Если записи нет, создаем новую
        const tmdbData = await fetchMediaDetails(tmdbId, mediaType);
        const status = await prisma.movieStatus.findUnique({
          where: { name: newStatus },
        });

        if (!status) {
          return NextResponse.json({ error: `Статус ${newStatus} не найден` }, { status: 400 });
        }

        watchListEntry = await prisma.watchList.create({
          data: {
            userId,
            tmdbId,
            mediaType,
            title: tmdbData?.title || tmdbData?.name || 'Без названия',
            voteAverage: tmdbData?.vote_average || 0,
            statusId: status.id,
            watchCount: 1,
            watchedDate: new Date(),
          },
        });

        // Track outcome: user added recommendation to their list
        if (recommendationLogId) {
          await trackOutcome({
            recommendationLogId,
            userId,
            action: 'added',
          });
          logger.info('Outcome tracked: movie added to watchlist', {
            recommendationLogId,
            userId,
            context: 'my-movies-api',
          });
        }
      } else {
        // Обновляем существующую запись
        const previousWatchCount = watchListEntry.watchCount;
        const status = await prisma.movieStatus.findUnique({
          where: { name: newStatus },
        });

        if (status) {
          await prisma.watchList.update({
            where: { id: watchListEntry.id },
            data: {
              watchCount: previousWatchCount + 1,
              watchedDate: new Date(),
              statusId: status.id,
            },
          });

          // Track outcome: user dropped recommendation
          if (recommendationLogId && newStatus === 'Брошено') {
            await trackOutcome({
              recommendationLogId,
              userId,
              action: 'dropped',
            });
            logger.info('Outcome tracked: movie dropped', {
              recommendationLogId,
              userId,
              context: 'my-movies-api',
            });
          }
        }
      }

      // Создаем запись в RewatchLog
      await prisma.rewatchLog.create({
        data: {
          userId,
          tmdbId,
          mediaType,
          watchedAt: new Date(),
          previousWatchCount: watchListEntry.watchCount,
          recommendationLogId: recommendationLogId || null,
        },
      });

      // Если оценка передана, создаем запись в RatingHistory
      if (rating !== undefined) {
        await prisma.ratingHistory.create({
          data: {
            userId,
            tmdbId,
            mediaType,
            rating,
            previousRating: watchListEntry.userRating,
            actionType: 'update',
          },
        });

        // Track outcome: user rated recommendation
        if (recommendationLogId) {
          await trackOutcome({
            recommendationLogId,
            userId,
            action: 'rated',
            userRating: rating,
          });
          logger.info('Outcome tracked: movie rated', {
            recommendationLogId,
            userId,
            rating,
            context: 'my-movies-api',
          });
        }

        // Обновляем оценку в WatchList
        await prisma.watchList.update({
          where: { id: watchListEntry.id },
          data: { userRating: rating },
        });
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'getMoviesCounts') {
      const [watched, wantToWatch, dropped, hidden] = await Promise.all([
        prisma.watchList.count({
          where: {
            userId,
            statusId: { in: [MOVIE_STATUS_IDS.WATCHED, MOVIE_STATUS_IDS.REWATCHED] },
          },
        }),
        prisma.watchList.count({ where: { userId, statusId: MOVIE_STATUS_IDS.WANT_TO_WATCH } }),
        prisma.watchList.count({ where: { userId, statusId: MOVIE_STATUS_IDS.DROPPED } }),
        prisma.blacklist.count({ where: { userId } }),
      ]);

      return NextResponse.json({ watched, wantToWatch, dropped, hidden });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    logger.error('Error in my-movies POST', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}