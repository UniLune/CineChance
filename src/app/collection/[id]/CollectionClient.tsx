// src/app/collection/[id]/CollectionClient.tsx
'use client';

import { useState, useEffect } from 'react';
import ImageWithProxy from '@/app/components/ImageWithProxy';
import { useRouter } from 'next/navigation';
import MovieCard from '@/app/components/MovieCard';
import { MovieCardErrorBoundary } from '@/app/components/ErrorBoundary';
import Loader from '@/app/components/Loader';
import { logger } from '@/lib/logger';
import { BlacklistProvider } from '@/app/components/BlacklistContext';

interface CollectionMovie {
  id: number;
  media_type: 'movie';
  title: string;
  name: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  release_date: string;
  first_air_date: string;
  overview: string;
  status?: 'want' | 'watched' | 'dropped' | 'rewatched' | null;
  userRating?: number | null;
  isBlacklisted: boolean;
  genre_ids: number[];
  original_language: string;
}

interface CollectionData {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: CollectionMovie[];
}

interface WatchlistStatus {
  tmdbId: number;
  mediaType: string;
  status: 'want' | 'watched' | 'dropped' | 'rewatched' | null;
  userRating: number | null;
}

export default function CollectionClient({ collectionId }: { collectionId: string }) {
  const router = useRouter();
  const [collection, setCollection] = useState<CollectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchlistStatuses, setWatchlistStatuses] = useState<Map<string, WatchlistStatus>>(new Map());

  useEffect(() => {
    const abortController = new AbortController();
    let isMounted = true;

    const fetchCollection = async () => {
      try {
        const res = await fetch(`/api/collection/${collectionId}`, {
          signal: abortController.signal
        });
        
        if (!abortController.signal.aborted && isMounted) {
          if (!res.ok) throw new Error(`API returned ${res.status}`);
          const data = await res.json();
          
          // DEBUG: Log movie data from API
          if (data.parts && data.parts.length > 0) {
            console.log('[CollectionClient] First movie from API:', {
              id: data.parts[0].id,
              title: data.parts[0].title,
              genre_ids: data.parts[0].genre_ids,
              original_language: data.parts[0].original_language,
            });
          }
          
          if (!abortController.signal.aborted && isMounted) {
            setCollection(data);
            setError(null);
          }
        }
      } catch (err) {
        if (!abortController.signal.aborted && isMounted) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          // Не логируем AbortError - это нормально при отмене
          if (errorMsg !== 'The operation was aborted.') {
            setError('Failed to load collection');
            logger.error('Collection fetch error', { 
              error: errorMsg,
              collectionId,
              context: 'CollectionClient'
            });
          }
        }
      } finally {
        if (!abortController.signal.aborted && isMounted) {
          setLoading(false);
        }
      }
    };

    fetchCollection();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [collectionId]);

  // Batch-загрузка статусов из вишлиста для всех фильмов коллекции
  useEffect(() => {
    if (!collection) return;

    const abortController = new AbortController();
    let isMounted = true;

    const fetchWatchlistStatuses = async () => {
      const movies = collection.parts.map(item => ({
        tmdbId: item.id,
        mediaType: item.media_type
      }));

      try {
        const res = await fetch('/api/movies/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ movies }),
          signal: abortController.signal
        });

        if (!abortController.signal.aborted && isMounted) {
          if (res.ok) {
            const data = await res.json();
            
            if (!abortController.signal.aborted && isMounted) {
              const statuses = new Map<string, WatchlistStatus>();
              
              collection.parts.forEach(item => {
                const key = `${item.media_type}_${item.id}`;
                const movieData = data[key];
                if (movieData) {
                  statuses.set(key, {
                    tmdbId: item.id,
                    mediaType: item.media_type,
                    status: movieData.status,
                    userRating: movieData.userRating,
                  });
                }
              });
              
              setWatchlistStatuses(statuses);
            }
          }
        }
      } catch (err) {
        if (!abortController.signal.aborted && isMounted) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          if (errorMsg !== 'The operation was aborted.') {
            logger.error('Failed to fetch watchlist statuses', { 
              error: errorMsg,
              context: 'CollectionClient'
            });
          }
        }
      }
    };

    fetchWatchlistStatuses();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [collection]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader size="large" text="Загрузка..." />
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-red-400 text-lg">{error || 'Collection not found'}</div>
      </div>
    );
  }

  return (
    <BlacklistProvider>
      <div className="min-h-screen bg-gray-950 py-3 sm:py-4">
        <div className="container mx-auto px-2 sm:px-3">
          {/* Навигация назад */}
          <div className="mb-4">
            <button
              onClick={() => router.back()}
              className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Назад
            </button>
          </div>

          {/* Информация о коллекции */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mb-6">
            {/* Постер коллекции */}
            {collection.poster_path && (
              <div className="flex-shrink-0 mx-auto sm:mx-0 relative w-32 h-48 sm:w-44 sm:h-66">
                <ImageWithProxy
                  src={`https://image.tmdb.org/t/p/w300${collection.poster_path}`}
                  alt={collection.name}
                  fill
                  className="object-cover rounded-lg shadow-lg"
                  sizes="(max-width: 640px) 128px, (max-width: 768px) 176px, 176px"
                />
              </div>
            )}
            
            {/* Название и описание */}
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                {collection.name}
              </h1>
              
              {collection.overview && (
                <p className="text-gray-400 text-sm max-w-3xl">
                  {collection.overview}
                </p>
              )}
            </div>
          </div>

          {/* Список фильмов */}
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">
              Фильмы серии ({collection.parts.length})
            </h2>
            
            {collection.parts.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                {collection.parts.map((movie, index) => {
                  const statusKey = `${movie.media_type}_${movie.id}`;
                  const watchlistStatus = watchlistStatuses.get(statusKey);
                  
                  return (
                    <div key={movie.id} className="p-1">
                      <MovieCardErrorBoundary>
                        <MovieCard
                          movie={movie}
                          initialIsBlacklisted={movie.isBlacklisted}
                          initialStatus={watchlistStatus?.status}
                          initialUserRating={watchlistStatus?.userRating}
                          showRatingBadge
                          priority={index < 6}
                        />
                      </MovieCardErrorBoundary>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-20">
                <p className="text-gray-400 text-lg">
                  В этой коллекции пока нет фильмов
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </BlacklistProvider>
  );
}
