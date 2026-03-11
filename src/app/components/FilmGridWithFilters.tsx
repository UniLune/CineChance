// src/app/components/FilmGridWithFilters.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import MovieCard from './MovieCard';
import { MovieCardErrorBoundary } from './ErrorBoundary';
import LoaderSkeleton from './LoaderSkeleton';
import Loader from './Loader';
import FilmFilters, { FilmFilterState, SortState, AdditionalFilters } from '@/app/my-movies/FilmFilters';
import { Media } from '@/lib/tmdb';
import { logger } from '@/lib/logger';

const DEFAULT_FILTER_VALUES = {
  showMovies: true,
  showTv: true,
  showAnime: true,
  showCartoon: true,
};

const DEFAULT_SORT_VALUES = {
  sortBy: 'rating',
  sortOrder: 'desc',
};

const DEFAULT_ADDITIONAL_FILTERS = {
  minRating: 0,
  maxRating: 10,
  yearFrom: '',
  yearTo: '',
};

const INFINITE_SCROLL_CONFIG = {
  root: null,
  rootMargin: '400px',
  threshold: 0.1,
};

const createFilterObject = (
  page: number,
  limit: number,
  filmFilters: typeof DEFAULT_FILTER_VALUES,
  sort: { sortBy: string; sortOrder: 'asc' | 'desc' },
  additionalFilters: typeof DEFAULT_ADDITIONAL_FILTERS,
  genres: number[],
  tags: string[]
): FilmGridFilters => ({
  page,
  limit,
  showMovies: filmFilters.showMovies,
  showTv: filmFilters.showTv,
  showAnime: filmFilters.showAnime,
  showCartoon: filmFilters.showCartoon,
  sortBy: sort.sortBy,
  sortOrder: sort.sortOrder,
  minRating: additionalFilters.minRating,
  maxRating: additionalFilters.maxRating,
  yearFrom: additionalFilters.yearFrom,
  yearTo: additionalFilters.yearTo,
  genres,
  tags,
});

export interface FilmGridWithFiltersProps {
  /** Функция для загрузки фильмов. Должна вернуть {movies, hasMore} */
  fetchMovies: (page: number, filters: FilmGridFilters) => Promise<{ movies: Media[]; hasMore: boolean }>;
  
  /** Начальное значение для первой загрузки */
  initialLoading?: boolean;
  
  /** Доступные жанры для фильтрации */
  availableGenres?: { id: number; name: string }[];
  
  /** Доступные теги пользователя */
  userTags?: Array<{ id: string; name: string; count: number }>;
  
  /** Показывать ли плашку с оценкой на карточке */
  showRatingBadge?: boolean;
  
  /** Начальный статус фильма */
  initialStatus?: 'want' | 'watched' | 'dropped' | 'rewatched' | null;
  
  /** Функция для получения статуса конкретного фильма */
  getInitialStatus?: (movie: Media) => 'want' | 'watched' | 'dropped' | 'rewatched' | null;
  
  /** Режим восстановления из черного списка */
  restoreView?: boolean;
  
  /** Получить начальный статус блокировки для фильма */
  getInitialIsBlacklisted?: (movie: Media) => boolean;
  
  /** Получить начальную оценку для фильма */
  getInitialRating?: (movie: Media) => number | null | undefined;
  
  /** Сообщение при пустом списке */
  emptyMessage?: string;
  
  /** Количество элементов на странице */
  pageSize?: number;
  
  /** Скрывать ли блок фильтрации по рейтингам */
  hideRatingFilter?: boolean;
  
  /** Скрывать ли блок фильтрации по тегам */
  hideTagsFilter?: boolean;
  
  /** Скрывать ли блок фильтрации по жанрам */
  hideGenresFilter?: boolean;
  
  /** Показывать ли порядковый номер (индекс).
   * @default true - по умолчанию индекс показывается в сетке.
   * @example showIndex={false} - скрыть индекс в "Моих фильмах", где нумерация не нужна.
   */
  showIndex?: boolean;
}

export interface FilmGridFilters {
  page: number;
  limit: number;
  showMovies: boolean;
  showTv: boolean;
  showAnime: boolean;
  showCartoon: boolean;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  minRating: number;
  maxRating: number;
  yearFrom: string;
  yearTo: string;
  genres: number[];
  tags?: string[];
}

export default function FilmGridWithFilters({
  fetchMovies,
  initialLoading = true,
  availableGenres = [],
  userTags = [],
  showRatingBadge = true,
  initialStatus = 'watched',
  getInitialStatus,
  restoreView = false,
  getInitialIsBlacklisted,
  getInitialRating,
  emptyMessage = 'Нет фильмов',
  pageSize = 20,
  hideRatingFilter = false,
  hideTagsFilter = false,
  hideGenresFilter = false,
  showIndex = true,
}: FilmGridWithFiltersProps) {
  const [movies, setMovies] = useState<Media[]>([]);
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [isFetchingNext, setIsFetchingNext] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasInitialLoaded, setHasInitialLoaded] = useState(false); // Track if we've loaded at least once
  
  // Фильтры
  const [filmFilters, setFilmFilters] = useState<FilmFilterState>({
    showMovies: true,
    showTv: true,
    showAnime: true,
    showCartoon: true,
  });
  const [sort, setSort] = useState<SortState>({
    sortBy: 'rating',
    sortOrder: 'desc',
  });
  const [additionalFilters, setAdditionalFilters] = useState<AdditionalFilters>({
    minRating: 0,
    maxRating: 10,
    yearFrom: '',
    yearTo: '',
  });
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);

  // Функция загрузки фильмов с параметрами фильтрации
  const handleFetchMovies = useCallback(
    async (page: number) => {
      try {
        const filters = createFilterObject(
          page,
          pageSize,
          filmFilters,
          sort,
          additionalFilters,
          selectedGenres,
          selectedTags
        );

        const data = await fetchMovies(page, filters);
        const newMovies = data.movies || [];

        logger.debug('FilmGrid fetch result', {
          context: 'FilmGridWithFilters',
          page,
          newMoviesCount: newMovies.length,
          hasMore: data.hasMore,
          sampleMovie: newMovies[0] ? { id: newMovies[0].id, title: newMovies[0].title } : null
        });

        if (page === 1) {
          setMovies(newMovies);
        } else {
          setMovies((prev) => {
            const combined = [...prev, ...newMovies];
            logger.debug('FilmGrid setMovies', {
              context: 'FilmGridWithFilters',
              prevCount: prev.length,
              newCount: newMovies.length,
              combinedCount: combined.length
            });
            return combined;
          });
        }

        setHasMore(data.hasMore || false);
        setCurrentPage(page);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        if (page === 1) {
          setMovies([]);
        }
      }
    },
    [fetchMovies, pageSize, filmFilters, sort, additionalFilters, selectedGenres, selectedTags]
  );

  // Начальная загрузка и загрузка при изменении фильтров
  useEffect(() => {
    // Только показываем скелет при первоначальной загрузке
    if (!hasInitialLoaded) {
      setIsLoading(true);
    }
    setError(null);
    setCurrentPage(1);

    // Создаем фильтры с текущими значениями 
    const filters: FilmGridFilters = {
      page: 1,
      limit: pageSize,
      showMovies: filmFilters.showMovies,
      showTv: filmFilters.showTv,
      showAnime: filmFilters.showAnime,
      showCartoon: filmFilters.showCartoon,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
      minRating: additionalFilters.minRating,
      maxRating: additionalFilters.maxRating,
      yearFrom: additionalFilters.yearFrom,
      yearTo: additionalFilters.yearTo,
      genres: selectedGenres,
      tags: selectedTags,
    };

    // Вызываем fetchMovies напрямую
    (async () => {
      try {
        const data = await fetchMovies(1, filters);
        const newMovies = data.movies || [];
        setMovies(newMovies);
        setHasMore(data.hasMore || false);
        setCurrentPage(1);
        setIsLoading(false);
        setHasInitialLoaded(true);
      } catch (err) {
        logger.error('Failed to fetch movies', { error: err instanceof Error ? err.message : String(err) });
        setError(err instanceof Error ? err.message : 'An error occurred');
        setMovies([]);
        setIsLoading(false);
        setHasInitialLoaded(true);
      }
    })();
  }, [filmFilters, sort, additionalFilters, selectedGenres, selectedTags, fetchMovies, pageSize])

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const sentinel = entries[0];
        if (sentinel.isIntersecting && hasMore && !isFetchingNext && !isFetchingRef.current) {
          isFetchingRef.current = true;
          setIsFetchingNext(true);
          handleFetchMovies(currentPage + 1).then(() => {
            isFetchingRef.current = false;
            setIsFetchingNext(false);
          });
        }
      },
      {
        root: null,
        rootMargin: '400px',
        threshold: 0.1,
      }
    );

    const currentSentinel = sentinelRef.current;
    if (currentSentinel) {
      observer.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
    };
  }, [hasMore, isFetchingNext, currentPage, handleFetchMovies]);

  if (isLoading) {
    return <LoaderSkeleton variant="grid" text="Загрузка фильмов..." skeletonCount={12} />;
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Фильтры */}
      <FilmFilters
        onFiltersChange={setFilmFilters}
        onSortChange={setSort}
        onAdditionalFiltersChange={(filters, genres) => {
          setAdditionalFilters(filters);
          setSelectedGenres(genres);
          // Извлекаем selectedTags из filters если они присутствуют
          const tagsFromFilters = filters.selectedTags || [];
          setSelectedTags(tagsFromFilters);
        }}
        availableGenres={availableGenres}
        userTags={userTags}
        hideRatingFilter={hideRatingFilter}
        hideTagsFilter={hideTagsFilter}
        hideGenresFilter={hideGenresFilter}
      />

      {movies.length > 0 ? (
        <>
          {/* Сетка фильмов */}
          {/* Sequential numbering: each MovieCard receives its 0-based index for order number display */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {movies.map((movie, index) => (
              <div key={`${movie.id || 'unknown'}-${movie.media_type || 'unknown'}-${index}`} className="p-1">
                <MovieCardErrorBoundary>
                  <MovieCard
                    movie={movie}
                    showRatingBadge={showRatingBadge}
                    priority={index < 6}
                    restoreView={restoreView}
                    initialIsBlacklisted={getInitialIsBlacklisted ? getInitialIsBlacklisted(movie) : undefined}
                    initialStatus={getInitialStatus ? getInitialStatus(movie) : initialStatus}
                    initialAverageRating={movie.vote_average}
                    initialRatingCount={movie.vote_count}
                    initialUserRating={getInitialRating ? getInitialRating(movie) : undefined}
                    index={showIndex ? index : undefined} // Передаем undefined вместо -1, чтобы MovieCard скрыл индекс полностью
                  />
                </MovieCardErrorBoundary>
              </div>
            ))}
          </div>

          {/* Sentinel для infinite scroll */}
          <div ref={sentinelRef} className="h-4" />

          {/* Кнопка "Ещё" как фоллбек */}
          {hasMore && !isFetchingNext && (
            <div className="flex justify-center mt-6">
              <button
                onClick={() => {
                  isFetchingRef.current = true;
                  setIsFetchingNext(true);
                  handleFetchMovies(currentPage + 1).then(() => {
                    isFetchingRef.current = false;
                    setIsFetchingNext(false);
                  });
                }}
                className="px-6 py-2 rounded-lg bg-gray-800 text-white text-sm hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                Ещё...
              </button>
            </div>
          )}

          {/* Loader во время загрузки */}
          {isFetchingNext && (
            <div className="flex justify-center mt-6">
              <Loader size="small" />
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg">{emptyMessage}</p>
        </div>
      )}
    </div>
  );
}
