'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
const RatingModal = dynamic(() => import('../components/RatingModal'), { ssr: false });
import FilmGridWithFilters, { FilmGridFilters } from '@/app/components/FilmGridWithFilters';
import { Media } from '@/lib/tmdb';
import { logger } from '@/lib/logger';
import { BlacklistProvider } from '../components/BlacklistContext';

/**
 * Props for EnhancedMoviesContentClient component.
 */
interface EnhancedMoviesContentClientProps {
  /** The ID of the user whose movies are being displayed */
  userId: string;
  /** The initial active tab. Defaults to 'watched' */
  initialTab?: 'watched' | 'wantToWatch' | 'dropped' | 'hidden';
  /** Initial counts for each tab */
  initialCounts: {
    watched: number;
    wantToWatch: number;
    dropped: number;
    hidden: number;
  };
}

interface AcceptedRecommendation {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: string;
  logId: string;
}

type EnhancedMovie = Media & {
  userRating: number | null;
  statusName: string;
  isBlacklisted: boolean;
};

const STATUS_MAP: Record<string, 'want' | 'watched' | 'dropped' | 'rewatched' | null> = {
  'Хочу посмотреть': 'want',
  'Просмотрено': 'watched',
  'Брошено': 'dropped',
  'Пересмотрено': 'rewatched',
};

export default function EnhancedMoviesContentClient({
  userId,
  initialTab = 'watched',
  initialCounts,
}: EnhancedMoviesContentClientProps) {
  const [activeTab, setActiveTab] = useState<'watched' | 'wantToWatch' | 'dropped' | 'hidden'>(
    initialTab
  );
  const [availableGenres, setAvailableGenres] = useState<{ id: number; name: string }[]>([]);
  const [userTags, setUserTags] = useState<Array<{ id: string; name: string; count: number }>>([]);
  const [currentCounts, setCurrentCounts] = useState(initialCounts);

  // Popup state
  const [showWatchedPopup, setShowWatchedPopup] = useState(false);
  const [acceptedRecommendation, setAcceptedRecommendation] = useState<AcceptedRecommendation | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  /** Состояние видимости кнопки "Наверх" - показывается при прокрутке более 300px */
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Загружаем доступные жанры и теги пользователя
  useEffect(() => {
    const fetchData = async () => {
      try {
        const genresRes = await fetch('/api/user/genres');
        if (genresRes.ok) {
          const genresData = await genresRes.json();
          setAvailableGenres(genresData.genres || []);
        }
      } catch (error) {
        logger.error('Error fetching genres', { error: error instanceof Error ? error.message : String(error) });
      }

      try {
        const tagsRes = await fetch('/api/user/tag-usage');
        if (tagsRes.ok) {
           const tagsData = await tagsRes.json();
           setUserTags((tagsData.tags || []).map((tag: { id: string; name: string; count: number }) => ({
             id: tag.id,
             name: tag.name,
             count: tag.count
           })));
        }
      } catch (error) {
        logger.error('Error fetching tags', { error: error instanceof Error ? error.message : String(error) });
      }
    };

    fetchData();
  }, [userId]);

  // Scroll to top button - отслеживаем позицию скролла
  // Паттерн скопирован из SearchClient - показываем кнопку когда пользователь прокрутил страницу вниз
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Проверка: пришел ли пользователь со страницы рекомендаций
  useEffect(() => {
    const recommendationData = sessionStorage.getItem('recommendationAccepted');
    if (recommendationData) {
      try {
        const data = JSON.parse(recommendationData) as AcceptedRecommendation;
        setAcceptedRecommendation(data);
        setShowWatchedPopup(true);
        sessionStorage.removeItem('recommendationAccepted');
      } catch (e) {
        logger.error('Error parsing recommendation data', { error: e instanceof Error ? e.message : String(e) });
      }
    }
  }, []);

  // Логирование действия
  const logRecommendationAction = async (action: 'accepted_no' | 'accepted_yes') => {
    if (!acceptedRecommendation?.logId) return;

    try {
      await fetch(`/api/recommendations/${acceptedRecommendation.logId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
    } catch (err) {
      logger.error('Error logging recommendation action', { error: err instanceof Error ? err.message : String(err) });
    }
  };

  // Обработчик "Нет" - закрыть popup
  const handleWatchedNo = async () => {
    await logRecommendationAction('accepted_no');
    setShowWatchedPopup(false);
    setAcceptedRecommendation(null);
  };

  // Обработчик "Да" - открыть RatingModal
  const handleWatchedYes = async () => {
    setShowWatchedPopup(false);
    setShowRatingModal(true);
  };

  // Обработчик сохранения оценки
  const handleRatingSave = async (rating: number, _date: string) => {
    if (!acceptedRecommendation) return;

    const newStatus = acceptedRecommendation.title.includes('(пересмотр)')
      ? 'Просмотрено'
      : 'Пересмотрено';

    try {
      await fetch('/api/my-movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateWatchStatus',
          tmdbId: acceptedRecommendation.tmdbId,
          mediaType: acceptedRecommendation.mediaType,
          newStatus,
          rating,
          recommendationLogId: acceptedRecommendation.logId,
        }),
      });

      await logRecommendationAction('accepted_yes');

      const countsRes = await fetch('/api/my-movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getMoviesCounts' }),
      });
      const newCounts = await countsRes.json();
      setCurrentCounts(newCounts);
    } catch (error) {
        logger.error('Error updating watch status', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setShowRatingModal(false);
      setAcceptedRecommendation(null);
    }
  };

  const fetchMovies = useCallback(
    async (page: number, filters: FilmGridFilters) => {
      try {
        const params = new URLSearchParams();
        params.append('page', String(page));
        params.append('limit', String(20));
        
        // Добавляем типы контента
        const types: string[] = [];
        if (filters.showMovies) types.push('movie');
        if (filters.showTv) types.push('tv');
        if (filters.showAnime) types.push('anime');
        if (filters.showCartoon) types.push('cartoon');
        
        // Передаём типы только если выбраны не все 4 (чтобы показать все по умолчанию)
        if (types.length > 0 && types.length < 4) {
          params.append('types', types.join(','));
        }
        // Если выбраны все 4 типа - передаём специальный маркер "all"
        if (types.length === 4) {
          params.append('types', 'all');
        }
        
        // Добавляем сортировку
        params.append('sortBy', filters.sortBy);
        params.append('sortOrder', filters.sortOrder);
        
        // Добавляем рейтинг
        if (filters.minRating > 0) {
          params.append('minRating', String(filters.minRating));
        }
        if (filters.maxRating < 10) {
          params.append('maxRating', String(filters.maxRating));
        }
        
        // Добавляем год
        if (filters.yearFrom) {
          params.append('yearFrom', filters.yearFrom);
        }
        if (filters.yearTo) {
          params.append('yearTo', filters.yearTo);
        }
        
        // Добавляем жанры
        if (filters.genres?.length) {
          params.append('genres', filters.genres.join(','));
        }
        
        // Добавляем теги
        if (filters.tags?.length) {
          params.append('tags', filters.tags.join(','));
        }

        // Добавляем статус в зависимости от вкладки
        if (activeTab === 'watched') {
          params.append('statusName', 'Просмотрено,Пересмотрено');
        } else if (activeTab === 'wantToWatch') {
          params.append('statusName', 'Хочу посмотреть');
        } else if (activeTab === 'dropped') {
          params.append('statusName', 'Брошено');
        } else if (activeTab === 'hidden') {
          params.append('includeHidden', 'true');
        }

        const response = await fetch(`/api/my-movies?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch movies');

        const data = await response.json();
        
        return {
          movies: data.movies || [],
          hasMore: data.hasMore || false,
        };
      } catch (error) {
        logger.error('Error fetching movies', { error: error instanceof Error ? error.message : String(error) });
        return { movies: [], hasMore: false };
      }
    },
    [activeTab]
  );

  const tabs = [
    { id: 'watched' as const, label: 'Просмотрено', count: currentCounts.watched },
    { id: 'wantToWatch' as const, label: 'Хочу посмотреть', count: currentCounts.wantToWatch },
    { id: 'dropped' as const, label: 'Брошено', count: currentCounts.dropped },
    {
      id: 'hidden' as const,
      label: 'Скрытые',
      count: currentCounts.hidden,
      className: 'text-gray-500 hover:text-gray-400'
    },
  ];

  const isRestoreView = activeTab === 'hidden';

  const getInitialStatus = () => {
    if (isRestoreView) return null;
    if (activeTab === 'watched') return 'watched';
    if (activeTab === 'wantToWatch') return 'want';
    if (activeTab === 'dropped') return 'dropped';
    return null;
  };

  const initialStatus = getInitialStatus();

  return (
    <div className="min-h-screen bg-gray-950 py-3 sm:py-4">
      {/* Popup: Вы просмотрели фильм? */}
      {showWatchedPopup && acceptedRecommendation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full border border-gray-700">
            <h3 className="text-xl font-bold text-white text-center mb-4">
              Вы просмотрели фильм
            </h3>
            <p className="text-gray-300 text-center mb-6">
              {acceptedRecommendation.title} ({acceptedRecommendation.year})?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleWatchedNo}
                className="flex-1 py-3 px-4 bg-gray-700 text-white rounded-xl font-medium hover:bg-gray-600 transition"
              >
                Нет
              </button>
              <button
                onClick={handleWatchedYes}
                className="flex-1 py-3 px-4 bg-green-600 text-white rounded-xl font-medium hover:bg-green-500 transition"
              >
                Да
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RatingModal */}
      {acceptedRecommendation && (
        <RatingModal
          isOpen={showRatingModal}
          onClose={() => {
            setShowRatingModal(false);
            setAcceptedRecommendation(null);
          }}
          onSave={handleRatingSave}
          title={acceptedRecommendation.title}
          releaseDate={acceptedRecommendation.year}
          defaultRating={6}
          showWatchedDate={true}
        />
      )}

      <div className="container mx-auto px-2 sm:px-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6">
          Мои фильмы
        </h1>

        <div className="flex flex-wrap gap-4 mb-8 border-b border-gray-800 pb-2">
          {tabs.map((tab) => {
            let baseClasses = "pb-2 px-2 border-b-2 transition-colors relative cursor-pointer ";
            if (activeTab === tab.id) {
              baseClasses += "border-blue-500 text-white";
            } else {
              baseClasses += "border-transparent hover:border-gray-600 ";
              baseClasses += tab.className || "text-gray-400 hover:text-white";
            }

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={baseClasses}
              >
                <span className="font-medium text-sm sm:text-base">{tab.label}</span>
                <span className="ml-2 text-xs sm:text-sm">({tab.count})</span>
              </button>
            );
          })}
        </div>

        <BlacklistProvider>
          <FilmGridWithFilters
            fetchMovies={fetchMovies}
            availableGenres={availableGenres}
            userTags={userTags}
            showRatingBadge={true}
             getInitialRating={(movie) => (movie as EnhancedMovie).userRating}
             getInitialStatus={(movie) => {
               const statusName = (movie as EnhancedMovie).statusName;
              if (statusName === 'Пересмотрено') return 'rewatched';
              if (statusName === 'Просмотрено') return 'watched';
              if (statusName === 'Хочу посмотреть') return 'want';
              if (statusName === 'Брошено') return 'dropped';
              return initialStatus;
            }}
             getInitialIsBlacklisted={(movie) => (movie as EnhancedMovie).isBlacklisted === true}
            restoreView={isRestoreView}
            initialStatus={initialStatus}
            emptyMessage={
              isRestoreView
                ? 'Добавляйте фильмы в черный список на главной странице'
                : 'В этом списке пока ничего нет'
            }
            showIndex={false}
          />
        </BlacklistProvider>

        {/* Кнопка "Наверх" - появляется при прокрутке страницы вниз */}
        {showScrollTop && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg hover:bg-blue-700 transition-colors z-50"
            aria-label="Наверх"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 10l7-7m0 0l7 7m-7-7v18"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
