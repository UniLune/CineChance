// src/app/api/person/[id]/route.ts

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/middleware/rateLimit';

interface CreditRaw {
  id: number;
  media_type: 'movie' | 'tv';
  title?: string;
  name?: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  release_date?: string;
  first_air_date?: string;
  overview: string;
  popularity: number;
  character?: string;
  job?: string;
  department?: string;
}

interface CreditItem extends CreditRaw {
  role_type: 'cast' | 'crew';
}

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { success } = await rateLimit(request, 'default');
  if (!success) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }
  
  try {
    const { id } = await props.params;
    const personId = parseInt(id);
    
    logger.debug('PersonAPI: Request started', { personId, rawId: id });
    
    if (!personId || isNaN(personId)) {
      logger.warn('PersonAPI: Invalid person ID', { id, personId });
      return NextResponse.json({ error: 'Missing or invalid person ID' }, { status: 400 });
    }

    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      logger.error('PersonAPI: TMDB API key not configured', {});
      return NextResponse.json({ error: 'TMDB API key not configured' }, { status: 500 });
    }

    // Получаем информацию об актере
    const personController = new AbortController();
    const personTimeoutId = setTimeout(() => personController.abort(), 15000);
    
    logger.debug('PersonAPI: Fetching person details', { personId });
    
    const personRes = await fetch(
      `https://api.themoviedb.org/3/person/${personId}?api_key=${apiKey}&language=ru-RU`,
      { 
        next: { revalidate: 86400 },
        signal: personController.signal
      }
    );
    
    clearTimeout(personTimeoutId);

    if (!personRes.ok) {
      const status = personRes.status;
      logger.warn('PersonAPI: Person fetch failed', { personId, status, statusText: personRes.statusText });
      if (status === 404) {
        return NextResponse.json({ error: 'Person not found' }, { status: 404 });
      }
      return NextResponse.json({ error: `Failed to fetch person (${status})` }, { status: 500 });
    }

    const personData = await personRes.json();
    logger.debug('PersonAPI: Person details fetched', { personId, name: personData.name });

    // Получаем фильмографию актера
    const creditsController = new AbortController();
    const creditsTimeoutId = setTimeout(() => creditsController.abort(), 15000);
    
    logger.debug('PersonAPI: Fetching credits', { personId });
    
    const creditsRes = await fetch(
      `https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${apiKey}&language=ru-RU`,
      { 
        next: { revalidate: 86400 },
        signal: creditsController.signal
      }
    );
    
    clearTimeout(creditsTimeoutId);

    if (!creditsRes.ok) {
      logger.warn('PersonAPI: Credits fetch failed, returning person without filmography', { 
        personId, 
        status: creditsRes.status 
      });
      // Если не удалось получить фильмографию, возвращаем данные актера без неё
      return NextResponse.json({
        id: personData.id,
        name: personData.name,
        biography: personData.biography,
        profile_path: personData.profile_path,
        birthday: personData.birthday,
        deathday: personData.deathday,
        place_of_birth: personData.place_of_birth,
        known_for_department: personData.known_for_department,
        filmography: [],
        error: 'Filmography unavailable'
      });
    }

     const creditsData = await creditsRes.json() as { cast?: CreditRaw[]; crew?: CreditRaw[] };
     logger.debug('PersonAPI: Credits fetched', { 
       personId, 
       castCount: creditsData.cast?.length || 0,
       crewCount: creditsData.crew?.length || 0
     });

     // Фильтруем и сортируем фильмографию (включая cast и crew)
     const seen = new Set<string>();
     
     // Объединяем cast и crew
     const allCredits: CreditItem[] = [
       ...(creditsData.cast || []).map((item: CreditRaw) => ({ ...item, role_type: 'cast' as const })),
       ...(creditsData.crew || []).map((item: CreditRaw) => ({ ...item, role_type: 'crew' as const }))
     ];
     
     const filmography = allCredits
       ?.filter((item: CreditItem) => {
         // Только с постером
         if (!item.poster_path) return false;
         
         // Удаляем дубликаты (один и тот же id + media_type)
         const key = `${item.media_type}_${item.id}`;
         if (seen.has(key)) return false;
         seen.add(key);
         return true;
       })
       ?.sort((a: CreditItem, b: CreditItem) => {
         // Сначала сортируем по популярности, затем по дате
         if (b.popularity !== a.popularity) {
           return b.popularity - a.popularity;
         }
         // Для фильмов по дате выхода (новые сначала)
         const dateA = a.release_date || a.first_air_date || '';
         const dateB = b.release_date || b.first_air_date || '';
         return dateB.localeCompare(dateA);
       })
       ?.map((item: CreditItem) => ({
         id: item.id,
         media_type: item.media_type,
         title: item.title || item.name,
         name: item.title || item.name,
         poster_path: item.poster_path,
         vote_average: item.vote_average,
         vote_count: item.vote_count,
         release_date: item.release_date || item.first_air_date || '',
         overview: item.overview,
         character: item.character || '',
         job: item.job || '',
         department: item.department || '',
         role_type: item.role_type,
         popularity: item.popularity,
       })) || [];

    return NextResponse.json({
      id: personData.id,
      name: personData.name,
      biography: personData.biography,
      profile_path: personData.profile_path,
      birthday: personData.birthday,
      deathday: personData.deathday,
      place_of_birth: personData.place_of_birth,
      known_for_department: personData.known_for_department,
      filmography,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isAbort = errorMessage.includes('abort') || errorMessage.includes('timed out');
    const errorName = error instanceof Error ? error.name : 'Unknown';
    
    if (isAbort) {
      logger.warn('PersonAPI: Request timeout', { 
        error: errorMessage,
        errorName,
        context: 'Person'
      });
    } else {
      logger.error('PersonAPI: Request failed', { 
        error: errorMessage,
        errorName,
        errorType: typeof error,
        context: 'Person'
      });
    }
    
    return NextResponse.json({ 
      error: isAbort ? 'Request timeout' : 'Failed to fetch person data' 
    }, { status: isAbort ? 504 : 500 });
  }
}
