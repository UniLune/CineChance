// src/app/api/watchlist/route.ts
 
import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/middleware/rateLimit";
import { calculateWeightedRating } from "@/lib/calculateWeightedRating";
import { invalidateUserCache } from "@/lib/redis";
import { recomputeTasteMap } from '@/lib/taste-map/compute';
import { invalidateTasteMap } from '@/lib/taste-map/redis';
import { deleteSimilarityScoresByUser } from '@/lib/taste-map/similarity-storage';
import { trackOutcome } from '@/lib/recommendation-outcome-tracking';
import { incrementallyUpdatePersonProfile, ensureMoviePersonCacheExists } from '@/lib/taste-map/person-profile-v2';
import { randomUUID } from 'crypto';

// Helper to get or generate request ID
function getRequestId(headers: Headers): string {
  const existingId = headers.get('x-request-id');
  return existingId || randomUUID();
}

// Helper for consistent log format
function formatWatchlistLog(requestId: string, endpoint: string, userId: string, action?: string, tmdbId?: number, extra?: string): string {
  const parts = [
    `[${requestId}]`,
    endpoint,
    `user: ${userId}`,
    tmdbId ? `tmdb: ${tmdbId}` : '-',
    action || '-',
    extra || ''
  ].filter(Boolean);
  return parts.join(' - ');
}

// Маппинг: Код клиента -> Название в БД
const STATUS_TO_DB: Record<string, string> = {
  want: 'Хочу посмотреть',
  watched: 'Просмотрено',
  dropped: 'Брошено',
  rewatched: 'Пересмотрено',
};

// Маппинг: Название в БД -> Код клиента
const STATUS_FROM_DB: Record<string, string> = {
  'Хочу посмотреть': 'want',
  'Просмотрено': 'watched',
  'Брошено': 'dropped',
  'Пересмотрено': 'rewatched',
};

// GET: Получить статус фильма для текущего пользователя
export async function GET(req: Request) {
  const requestId = getRequestId(req.headers);
  const endpoint = 'GET /api/watchlist';
  
  // Apply rate limiting for watchlist
  const { success } = await rateLimit(req, '/api/watchlist');
  if (!success) {
    logger.warn(formatWatchlistLog(requestId, endpoint, '-', 'rate_limit'));
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      logger.debug(formatWatchlistLog(requestId, endpoint, '-', 'unauthorized'));
      return NextResponse.json({ status: null }, { status: 200 });
    }

    const { searchParams } = new URL(req.url);
    const tmdbId = parseInt(searchParams.get('tmdbId') || '0');
    const mediaType = searchParams.get('mediaType');

    if (!tmdbId || !mediaType) {
      logger.warn(formatWatchlistLog(requestId, endpoint, session.user.id, 'missing_params'));
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    // Оптимизированный запрос - загружаем только необходимые поля
    const record = await prisma.watchList.findUnique({
      where: {
        userId_tmdbId_mediaType: {
          userId: session.user.id,
          tmdbId,
          mediaType,
        },
      },
      select: {
        status: { select: { name: true } },
        userRating: true,
        weightedRating: true, // Добавляем новое поле
        watchedDate: true,
        watchCount: true,
      },
    });

    // Переводим название из БД в код клиента
    const dbStatusName = record?.status?.name;
    const clientStatus = dbStatusName ? (STATUS_FROM_DB[dbStatusName] || null) : null;

    if (record) {
      logger.debug(formatWatchlistLog(requestId, endpoint, session.user.id, 'found', tmdbId));
    } else {
      logger.debug(formatWatchlistLog(requestId, endpoint, session.user.id, 'not_found', tmdbId));
    }

    // Возвращаем статус и данные оценки (если есть)
    return NextResponse.json({ 
      status: clientStatus,
      userRating: record?.weightedRating ?? record?.userRating, // Fallback логика
      watchedDate: record?.watchedDate,
      watchCount: record?.watchCount || 0,
    });
  } catch (error) {
    logger.error(formatWatchlistLog(requestId, endpoint, '-', 'error', undefined, `Error: ${error instanceof Error ? error.message : String(error)}`));
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Добавить или обновить статус
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const endpoint = 'POST /api/watchlist';
  
  // Apply rate limiting for watchlist
  const { success } = await rateLimit(req, '/api/watchlist');
  if (!success) {
    logger.warn(formatWatchlistLog(requestId, endpoint, '-', 'rate_limit'));
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      logger.warn(formatWatchlistLog(requestId, endpoint, '-', 'unauthorized'));
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { tmdbId, mediaType, status, title, voteAverage, userRating, watchedDate, isRewatch, isRatingOnly, recommendationLogId } = body;
    
    logger.debug(formatWatchlistLog(requestId, endpoint, session.user.id, 'request', tmdbId, `status: ${status}, isRewatch: ${isRewatch}, isRatingOnly: ${isRatingOnly}`));

    // При переоценке без смены статуса - не требуем статус
    if (isRatingOnly) {
      if (!tmdbId || !mediaType) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }

      // Получаем текущую запись
      const existingRecord = await prisma.watchList.findUnique({
        where: {
          userId_tmdbId_mediaType: {
            userId: session.user.id,
            tmdbId,
            mediaType,
          },
        },
      });

      if (!existingRecord) {
        return NextResponse.json({ error: 'Movie not found in watchlist' }, { status: 404 });
      }

      const previousRating = existingRecord.userRating;
      const newRating = userRating ? Number(userRating) : null;
      const isRatingChanged = newRating !== null && previousRating !== newRating;

      // Расчитываем взвешенную оценку
      let weightedValue = null;
      if (newRating !== null) {
        const weightedResult = await calculateWeightedRating(
          session.user.id,
          tmdbId,
          mediaType
        );
        weightedValue = weightedResult.weightedRating;
        
        // Debug логирование для понимания проблемы
        logger.debug('Weighted Rating Debug', {
          userId: session.user.id,
          tmdbId,
          mediaType,
          newRating,
          weightedValue,
          calculationDetails: weightedResult.calculationDetails
        });
      }

      // Обновляем только оценку
      await prisma.watchList.update({
        where: {
          userId_tmdbId_mediaType: {
            userId: session.user.id,
            tmdbId,
            mediaType,
          },
        },
        data: {
          userRating: newRating,
          weightedRating: weightedValue, // Сохраняем взвешенную оценку
          title,
          voteAverage,
        },
      });

      // Логируем изменение оценки
      if (isRatingChanged && newRating !== null) {
        await prisma.ratingHistory.create({
          data: {
            userId: session.user.id,
            tmdbId,
            mediaType,
            rating: newRating,
            actionType: 'rating_change',
            previousRating,
            ratingChange: newRating - (previousRating || 0),
          },
        });
       }

       // Trigger background taste map recomputation and similarity invalidation
       after(async () => {
         try {
           await recomputeTasteMap(session.user.id);
           await invalidateTasteMap(session.user.id);
           await deleteSimilarityScoresByUser(session.user.id);
         } catch (error) {
           logger.error('Background invalidation failed', {
             error: error instanceof Error ? error.message : String(error),
             userId: session.user.id,
             context: 'WatchlistPOST',
           });
         }
       });

       return NextResponse.json({ success: true });
     }

     // Логика пересмотра - обновляем только оценку и счётчик просмотров, НЕ меняем статус
    if (isRewatch) {
      if (!tmdbId || !mediaType || !title) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }

      // Получаем текущую запись
      const existingRecord = await prisma.watchList.findUnique({
        where: {
          userId_tmdbId_mediaType: {
            userId: session.user.id,
            tmdbId,
            mediaType,
          },
        },
      });

      const previousWatchCount = existingRecord?.watchCount || 0;
      const previousRating = existingRecord?.userRating;
      const newRating = userRating ? Number(userRating) : null;
      const isRatingChanged = existingRecord && newRating !== null && previousRating !== newRating;

      // Расчитываем взвешенную оценку для пересмотра
      let weightedValue = null;
      if (newRating !== null) {
        const weightedResult = await calculateWeightedRating(
          session.user.id,
          tmdbId,
          mediaType
        );
        weightedValue = weightedResult.weightedRating;
        
        // Debug логирование для понимания проблемы
        logger.debug('Weighted Rating Debug (REWATCH)', {
          userId: session.user.id,
          tmdbId,
          mediaType,
          newRating,
          weightedValue,
          calculationDetails: weightedResult.calculationDetails
        });
      }

      // Получаем ID статуса "Пересмотрено" для создания/обновления записи
      const rewatchedStatus = await prisma.movieStatus.findUnique({
        where: { name: 'Пересмотрено' },
      });
      if (!rewatchedStatus) {
        return NextResponse.json({ error: 'Status "Пересмотрено" not found' }, { status: 404 });
      }

      // Обновляем существующую запись или создаём новую
      await prisma.watchList.upsert({
        where: {
          userId_tmdbId_mediaType: {
            userId: session.user.id,
            tmdbId,
            mediaType,
          },
        },
        update: {
          statusId: rewatchedStatus.id,
          title,
          voteAverage,
          userRating: newRating,
          weightedRating: weightedValue, // Сохраняем взвешенную оценку
          watchedDate: watchedDate ? new Date(watchedDate) : null,
          watchCount: previousWatchCount + 1,
        },
        create: {
          userId: session.user.id,
          tmdbId,
          mediaType,
          title,
          voteAverage,
          statusId: rewatchedStatus.id,
          userRating: newRating,
          weightedRating: weightedValue, // Сохраняем взвешенную оценку
          watchedDate: watchedDate ? new Date(watchedDate) : null,
          watchCount: 1,
        },
      });

      // Логируем пересмотр
      await prisma.rewatchLog.create({
        data: {
          userId: session.user.id,
          tmdbId,
          mediaType,
          previousWatchCount,
        },
      });

      // Логируем изменение оценки
      if (isRatingChanged && newRating !== null) {
        await prisma.ratingHistory.create({
          data: {
            userId: session.user.id,
            tmdbId,
            mediaType,
            rating: newRating,
            actionType: 'rewatch',
            previousRating,
            ratingChange: newRating - (previousRating || 0),
          },
        });
       }

       // Trigger background taste map recomputation and similarity invalidation
       after(async () => {
         try {
           await recomputeTasteMap(session.user.id);
           await invalidateTasteMap(session.user.id);
           await deleteSimilarityScoresByUser(session.user.id);
         } catch (error) {
           logger.error('Background invalidation failed', {
             error: error instanceof Error ? error.message : String(error),
             userId: session.user.id,
             context: 'WatchlistPOST',
           });
         }
       });

       return NextResponse.json({ success: true });
     }

     // Обычная логика добавления/изменения статуса
    if (!tmdbId || !mediaType || !status || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Переводим код клиента в название для БД
    const dbStatusName = STATUS_TO_DB[status];

    if (!dbStatusName) {
      return NextResponse.json({ error: 'Invalid status name sent from client' }, { status: 400 });
    }

    // Ищем ID статуса в БД по русскому названию
    const statusRecord = await prisma.movieStatus.findUnique({
      where: { name: dbStatusName },
    });

    if (!statusRecord) {
      return NextResponse.json({ error: 'Status not found in DB' }, { status: 404 });
    }

    // Получаем текущую запись для логирования пересмотра
    const existingRecord = await prisma.watchList.findUnique({
      where: {
        userId_tmdbId_mediaType: {
          userId: session.user.id,
          tmdbId,
          mediaType,
        },
      },
    });

    const previousWatchCount = existingRecord?.watchCount || 0;
    const previousRating = existingRecord?.userRating;
    const newRating = userRating ? Number(userRating) : null;
    const isRatingChanged = existingRecord && newRating !== null && previousRating !== newRating;

    // Расчитываем взвешенную оценку
    let weightedValue = null;
    if (newRating !== null) {
      const weightedResult = await calculateWeightedRating(
        session.user.id,
        tmdbId,
        mediaType
      );
      weightedValue = weightedResult.weightedRating;
      
      // Debug логирование для понимания проблемы
      logger.debug('Weighted Rating Debug (POST)', {
        userId: session.user.id,
        tmdbId,
        mediaType,
        newRating,
        weightedValue,
        calculationDetails: weightedResult.calculationDetails
      });
    }

    const record = await prisma.watchList.upsert({
      where: {
        userId_tmdbId_mediaType: {
          userId: session.user.id,
          tmdbId,
          mediaType,
        },
      },
      update: {
        statusId: statusRecord.id,
        title,
        voteAverage,
        userRating: newRating,
        weightedRating: weightedValue, // Сохраняем взвешенную оценку
        watchedDate: watchedDate ? new Date(watchedDate) : null,
        watchCount: isRewatch ? previousWatchCount + 1 : previousWatchCount,
      },
      create: {
        userId: session.user.id,
        tmdbId,
        mediaType,
        title,
        voteAverage,
        statusId: statusRecord.id,
        userRating: newRating,
        weightedRating: weightedValue, // Сохраняем взвешенную оценку
        watchedDate: watchedDate ? new Date(watchedDate) : null,
        watchCount: isRewatch ? 1 : 0,
      },
    });

    // Логируем пересмотр, если это повторный просмотр
    if (isRewatch && existingRecord) {
      // Создаём запись в RewatchLog
      await prisma.rewatchLog.create({
        data: {
          userId: session.user.id,
          tmdbId,
          mediaType,
          ratingBefore: previousRating,
          ratingAfter: newRating,
          previousWatchCount,
        },
      });
    }

    // Логируем изменение оценки в RatingHistory
    if (isRatingChanged && newRating !== null) {
      await prisma.ratingHistory.create({
        data: {
          userId: session.user.id,
          tmdbId,
          mediaType,
          rating: newRating,
          actionType: existingRecord ? 'rating_change' : 'initial',
          previousRating,
          ratingChange: newRating - (previousRating || 0),
        },
      });
    } else if (!existingRecord && newRating !== null) {
      // Первичная оценка
      await prisma.ratingHistory.create({
        data: {
          userId: session.user.id,
          tmdbId,
          mediaType,
          rating: newRating,
          actionType: 'initial',
        },
      });
    }

    await invalidateUserCache(session.user.id);

    // Incrementally update person profile (non-blocking)
    after(async () => {
      try {
        await ensureMoviePersonCacheExists(tmdbId, mediaType);
        await incrementallyUpdatePersonProfile(
          session.user.id,
          tmdbId,
          mediaType,
          'add'
        );
      } catch (error) {
        logger.error('Person profile update failed (non-blocking)', {
          error: error instanceof Error ? error.message : String(error),
          userId: session.user.id,
          tmdbId,
        });
      }
    });

    // Track recommendation outcome if recommendationLogId provided and status is watched/rewatched
    if (recommendationLogId && (status === 'watched' || status === 'rewatched')) {
      try {
        await trackOutcome({
          recommendationLogId,
          userId: session.user.id,
          action: 'added',
        });
        logger.debug('Recommendation outcome tracked', {
          recommendationLogId,
          userId: session.user.id,
          tmdbId,
          status,
        });
      } catch (error) {
        // Non-blocking - outcome tracking failure shouldn't fail the request
        logger.error('Failed to track recommendation outcome', {
          error: error instanceof Error ? error.message : String(error),
          recommendationLogId,
          userId: session.user.id,
        });
      }
     }

     // Trigger background taste map recomputation and similarity invalidation
     after(async () => {
       try {
         await recomputeTasteMap(session.user.id);
         await invalidateTasteMap(session.user.id);
         await deleteSimilarityScoresByUser(session.user.id);
       } catch (error) {
         logger.error('Background invalidation failed', {
           error: error instanceof Error ? error.message : String(error),
           userId: session.user.id,
           context: 'WatchlistPOST',
         });
       }
     });

     logger.info(formatWatchlistLog(requestId, endpoint, session.user.id, 'success', tmdbId, `status: ${status}`));
     return NextResponse.json({ success: true, record });
   } catch (error) {
    logger.error(formatWatchlistLog(requestId, endpoint, '-', 'error', undefined, `Error: ${error instanceof Error ? error.message : String(error)}`));
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Удалить из списка
export async function DELETE(req: Request) {
  const requestId = getRequestId(req.headers);
  const endpoint = 'DELETE /api/watchlist';
  
  // Apply rate limiting for watchlist
  const { success } = await rateLimit(req, '/api/watchlist');
  if (!success) {
    logger.warn(formatWatchlistLog(requestId, endpoint, '-', 'rate_limit'));
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      logger.warn(formatWatchlistLog(requestId, endpoint, '-', 'unauthorized'));
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { tmdbId, mediaType } = body;

    if (!tmdbId || !mediaType) {
      logger.warn(formatWatchlistLog(requestId, endpoint, session.user.id, 'missing_params'));
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    await prisma.watchList.deleteMany({
      where: {
        userId: session.user.id,
        tmdbId,
        mediaType,
      },
    });

     await invalidateUserCache(session.user.id);

     // Trigger background taste map recomputation and similarity invalidation
     after(async () => {
       try {
         await recomputeTasteMap(session.user.id);
         await invalidateTasteMap(session.user.id);
         await deleteSimilarityScoresByUser(session.user.id);
       } catch (error) {
         logger.error('Background invalidation failed', {
           error: error instanceof Error ? error.message : String(error),
           userId: session.user.id,
           context: 'WatchlistDELETE',
         });
       }
     });

     logger.info(formatWatchlistLog(requestId, endpoint, session.user.id, 'deleted', tmdbId));
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(formatWatchlistLog(requestId, endpoint, '-', 'error', undefined, `Error: ${error instanceof Error ? error.message : String(error)}`));
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}