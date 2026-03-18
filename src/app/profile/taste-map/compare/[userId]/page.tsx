'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';

interface ComparisonMetrics {
  tasteSimilarity: number;
  ratingCorrelation: number;
  personOverlap: number;
  overallMatch: number;
  genreRatingSimilarity?: number;
}

interface RatingMatchPatterns {
  perfectMatches: number;
  closeMatches: number;
  moderateMatches: number;
  largeDifference: number;
  sameCategory: number;
  differentIntensity: number;
  avgRatingUser1: number;
  avgRatingUser2: number;
  intensityMatch: number;
  pearsonCorrelation: number;
  totalSharedMovies: number;
  avgRatingDifference: number;
  positiveRatingsPercentage: number;
  bothRewatchedCount: number;
  overallMovieMatch: number;
}

interface SharedMovie {
  tmdbId: number;
  title: string;
  myRating: number;
  theirRating: number;
  difference: number;
}

interface ComparisonData {
  userId: string;
  comparedUserId: string;
  metrics: ComparisonMetrics;
  ratingPatterns?: RatingMatchPatterns;
  genreProfiles?: {
    current: Record<string, number>;
    compared: Record<string, number>;
  };
  sharedMovies: SharedMovie[];
  myWatchedCount: number;
  theirWatchedCount: number;
  commonWatchedCount: number;
}

export default function ComparisonPage() {
  const params = useParams();
  const router = useRouter();
  const comparedUserId = params.userId as string;

  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadComparison = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/user/taste-map-comparison/${comparedUserId}`,
          { cache: 'no-store' }
        );

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        setComparison(data);
        setError(null);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error('Failed to load comparison', {
          error: errorMsg,
          context: 'ComparisonPage',
          comparedUserId,
        });
        
        let displayError = 'Ошибка при загрузке сравнения';
        if (err instanceof Error && err.message.includes('API returned')) {
          if (err.message.includes('404')) {
            displayError = 'Пользователь не найден';
          } else if (err.message.includes('500')) {
            displayError = 'Ошибка сервера при расчёте сравнения';
          }
        }
        
        setError(displayError);
      } finally {
        setLoading(false);
      }
    };

    loadComparison();
  }, [comparedUserId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.back()}
            className="mb-6 text-purple-400 hover:text-purple-300 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Назад
          </button>
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
            <span className="ml-4 text-white">Загрузка анализа совпадений...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !comparison) {
    return (
      <div className="min-h-screen bg-black p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.back()}
            className="mb-6 text-purple-400 hover:text-purple-300 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Назад
          </button>
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 text-center">
            <p className="text-red-300">{error || 'Сравнение не найдено'}</p>
          </div>
        </div>
      </div>
    );
  }

  const getMatchColor = (percentage: number): string => {
    if (percentage > 75) return 'text-green-400';
    if (percentage > 50) return 'text-yellow-400';
    if (percentage > 25) return 'text-orange-400';
    return 'text-red-400';
  };

  const getMatchBgColor = (percentage: number): string => {
    if (percentage > 75) return 'bg-green-900/20 border-green-700';
    if (percentage > 50) return 'bg-yellow-900/20 border-yellow-700';
    if (percentage > 25) return 'bg-orange-900/20 border-orange-700';
    return 'bg-red-900/20 border-red-700';
  };

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="mb-6 text-purple-400 hover:text-purple-300 flex items-center gap-2 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Вернуться к близнецам
        </button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Анализ совпадений вкусов
          </h1>
          <p className="text-gray-400">
            Подробное сравнение профилей предпочтений кинозрителей
          </p>
        </div>

        {/* Overall Match Card */}
        <div className={`border rounded-lg p-8 mb-8 ${getMatchBgColor(comparison.metrics.overallMatch * 100)}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">Общее совпадение</h2>
            <div className={`text-4xl font-bold ${getMatchColor(comparison.metrics.overallMatch * 100)}`}>
              {(comparison.metrics.overallMatch * 100).toFixed(0)}%
            </div>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden">
            <div
              className="bg-gradient-to-r from-purple-500 to-blue-500 h-full transition-all duration-300"
              style={{ width: `${comparison.metrics.overallMatch * 100}%` }}
            />
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Genre Similarity */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold">Жанры</h3>
              <span className="text-2xl">🎬</span>
            </div>
            <p className="text-3xl font-bold text-purple-400 mb-2">
              {(comparison.metrics.tasteSimilarity * 100).toFixed(0)}%
            </p>
            <p className="text-sm text-gray-400">
              Совпадение предпочитаемых жанров фильмов
            </p>
            <div className="mt-4 w-full bg-gray-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-purple-500 h-full"
                style={{ width: `${comparison.metrics.tasteSimilarity * 100}%` }}
              />
            </div>
          </div>

          {/* Rating Patterns Combined Metric */}
          {comparison.ratingPatterns && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">Совпадение по фильмам</h3>
                <span className="text-2xl">🎬</span>
              </div>
              <p className="text-3xl font-bold text-yellow-400 mb-4">
                {(comparison.ratingPatterns.overallMovieMatch * 100).toFixed(0)}%
              </p>
              <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden mb-4">
                <div
                  className="bg-yellow-500 h-full"
                  style={{ width: `${comparison.ratingPatterns.overallMovieMatch * 100}%` }}
                />
              </div>
              
              {/* Key metrics */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-2 border-t border-gray-700">
                  <span className="text-gray-400">Полное совпадение (diff = 0):</span>
                  <span className="text-white font-semibold">{comparison.ratingPatterns.perfectMatches}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-t border-gray-700">
                  <span className="text-gray-400">Близкое совпадение (diff ≤ 1):</span>
                  <span className="text-white font-semibold">{comparison.ratingPatterns.closeMatches}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-t border-gray-700">
                  <span className="text-gray-400">Средняя разница оценок:</span>
                  <span className="text-white font-semibold">{comparison.ratingPatterns.avgRatingDifference} балла</span>
                </div>
                <div className="flex justify-between items-center py-2 border-t border-gray-700">
                  <span className="text-gray-400">Фильмы с позитивной оценкой (8-10):</span>
                  <span className="text-white font-semibold">{comparison.ratingPatterns.positiveRatingsPercentage}%</span>
                </div>
                {comparison.ratingPatterns.bothRewatchedCount > 0 && (
                  <div className="flex justify-between items-center py-2 border-t border-gray-700">
                    <span className="text-gray-400">Фильмов вы оба пересмотрели:</span>
                    <span className="text-white font-semibold">{comparison.ratingPatterns.bothRewatchedCount}</span>
                  </div>
                )}
              </div>
              
              {/* Legend/Explanation */}
              <div className="mt-4 p-3 bg-gray-800 rounded border border-gray-700">
                <p className="text-xs text-gray-400 mb-2">💡 Как считается процент:</p>
                <p className="text-xs text-gray-500">
                  100% = все общие просмотренные фильмы<br/>
                  Считаем = Полное (diff=0) + Близкое (0&lt;diff≤1)<br/>
                  Отсеиваем: Умеренное (1&lt;diff≤2) и Большую разницу (diff&gt;2)
                </p>
              </div>
            </div>
          )}

         </div>

        {/* Statistics */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-white mb-4">Статистика</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-400 mb-1">Ваших просмотренных фильмов</p>
              <p className="text-3xl font-bold text-purple-400">{comparison.myWatchedCount}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Его просмотренных фильмов</p>
              <p className="text-3xl font-bold text-blue-400">{comparison.theirWatchedCount}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Общих просмотренных фильмов</p>
              <p className="text-3xl font-bold text-green-400">{comparison.commonWatchedCount}</p>
            </div>
          </div>
        </div>

        {/* Rating Patterns Analysis */}
        {comparison.ratingPatterns && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-6">📊 Анализ совпадения оценок</h2>
            
            {/* Pattern 1: Perfect/Close/Moderate Matches */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-300 uppercase mb-3">Паттерн 1: Совпадение оценок</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-800 rounded p-4 border border-green-800">
                  <div className="text-2xl font-bold text-green-400 mb-1">
                    {comparison.ratingPatterns.perfectMatches}
                  </div>
                  <div className="text-xs text-gray-400">Полное совпадение</div>
                  <div className="text-xs text-gray-500 mt-1">(Оценка одинаковая, diff = 0)</div>
                </div>
                <div className="bg-gray-800 rounded p-4 border border-yellow-800">
                  <div className="text-2xl font-bold text-yellow-400 mb-1">
                    {comparison.ratingPatterns.closeMatches}
                  </div>
                  <div className="text-xs text-gray-400">Близкое совпадение</div>
                  <div className="text-xs text-gray-500 mt-1">(Разница ±1 балл, 0 &lt; diff ≤ 1)</div>
                </div>
                <div className="bg-gray-800 rounded p-4 border border-orange-800">
                  <div className="text-2xl font-bold text-orange-400 mb-1">
                    {comparison.ratingPatterns.moderateMatches}
                  </div>
                  <div className="text-xs text-gray-400">Умеренное совпадение</div>
                  <div className="text-xs text-gray-500 mt-1">(Разница ±2 балла, 1 &lt; diff ≤ 2)</div>
                </div>
                <div className="bg-gray-800 rounded p-4 border border-red-800">
                  <div className="text-2xl font-bold text-red-400 mb-1">
                    {comparison.ratingPatterns.largeDifference}
                  </div>
                  <div className="text-xs text-gray-400">Большая разница</div>
                  <div className="text-xs text-gray-500 mt-1">(Существенно отличаются, diff &gt; 2)</div>
                </div>
              </div>
              <div className="mt-3 p-3 bg-gray-800 rounded border border-gray-700">
                <p className="text-xs text-gray-400">
                  💡 Итого фильмов: <span className="font-semibold text-white">{comparison.ratingPatterns.perfectMatches + comparison.ratingPatterns.closeMatches + comparison.ratingPatterns.moderateMatches + comparison.ratingPatterns.largeDifference}</span> (совпадение от diff=0 до diff&gt;2)
                </p>
              </div>
            </div>

            {/* Pattern 2: Category Alignment */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-300 uppercase mb-3">Паттерн 2: Категория интенсивности</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-800 rounded p-4 border border-purple-800">
                  <div className="text-2xl font-bold text-purple-400 mb-1">
                    {comparison.ratingPatterns.sameCategory}
                  </div>
                  <div className="text-xs text-gray-400">Одна категория</div>
                  <div className="text-xs text-gray-500 mt-1">
                    (Обе оценки в одной группе: 1-3, 4-5, 6-7, 8-9, 10)
                  </div>
                </div>
                <div className="bg-gray-800 rounded p-4 border border-red-800">
                  <div className="text-2xl font-bold text-red-400 mb-1">
                    {comparison.ratingPatterns.differentIntensity}
                  </div>
                  <div className="text-xs text-gray-400">Разные категории</div>
                  <div className="text-xs text-gray-500 mt-1">
                    (Оценки в разных группах интенсивности)
                  </div>
                </div>
              </div>
            </div>

            {/* Pattern 3: Intensity Match */}
            <div>
              <h3 className="text-sm font-semibold text-gray-300 uppercase mb-3">Паттерн 3: Интенсивность вкуса</h3>
              <div className="bg-gray-800 rounded p-4 border border-blue-800 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Ваша средняя оценка</div>
                    <div className="text-3xl font-bold text-blue-400">{comparison.ratingPatterns.avgRatingUser1}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-400">↔️</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-400 mb-1">Их средняя оценка</div>
                    <div className="text-3xl font-bold text-blue-400">{comparison.ratingPatterns.avgRatingUser2}</div>
                  </div>
                </div>
                <div className="p-3 bg-gray-900 rounded border border-gray-700 mb-3">
                  <p className="text-xs text-gray-500">
                    💡 <span className="text-gray-400">Средняя оценка считается только по общим просмотренным фильмам, чтобы показать как вы оцениваете одинаковые фильмы</span>
                  </p>
                </div>
                <div className="p-3 bg-gray-900 rounded border border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">Совпадение интенсивности:</span>
                    <span className="text-xl font-bold text-purple-400">
                      {(comparison.ratingPatterns.intensityMatch * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-pink-500 h-full"
                      style={{ width: `${comparison.ratingPatterns.intensityMatch * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {comparison.ratingPatterns.intensityMatch > 0.75
                      ? '🔥 Очень похожий вкус - обе стороны смотрят одинаково позитивно'
                      : comparison.ratingPatterns.intensityMatch > 0.5
                      ? '🟢 Похожий вкус - близкая интенсивность оценок'
                      : '🟡 Разный подход - одна сторона позитивнее другой'}
                  </p>
                </div>
              </div>
            </div>

            {/* Overall Pearson Correlation Info */}
            <div className="text-xs text-gray-500 pt-4 border-t border-gray-700">
              <p>
                📈 Корреляция Пирсона: <span className="text-gray-400 font-mono">{comparison.ratingPatterns.pearsonCorrelation.toFixed(2)}</span>
                {comparison.ratingPatterns.pearsonCorrelation > 0.5
                  ? ' (Сильная положительная корреляция - похожий вкус)'
                  : comparison.ratingPatterns.pearsonCorrelation > 0
                  ? ' (Слабая положительная корреляция - примерно похожий вкус)'
                  : ' (Отрицательная корреляция - противоположный вкус)'}
              </p>
            </div>
          </div>
        )}

        {/* Shared Movies */}

        {comparison.sharedMovies.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">
              Общие просмотренные фильмы ({comparison.sharedMovies.length})
            </h2>
            <div className="space-y-3">
              {(() => {
                // Sort by difference (ascending - first 0 difference, like Genre Profiles)
                const sortedByDifference = [...comparison.sharedMovies].sort(
                  (a, b) => Math.abs(a.difference) - Math.abs(b.difference)
                );
                return sortedByDifference.slice(0, 10).map((movie) => (
                  <div
                    key={movie.tmdbId}
                    className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700"
                  >
                    <div className="flex-1">
                      <p className="text-white font-medium">{movie.title}</p>
                      <p className="text-xs text-gray-500">
                        Разница в оценках: {Math.abs(movie.difference).toFixed(1)} балла
                      </p>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-sm text-gray-400">Вы: {movie.myRating}</p>
                        <p className="text-sm text-gray-400">Он: {movie.theirRating}</p>
                      </div>
                    </div>
                  </div>
                ));
              })()}

              {comparison.sharedMovies.length > 10 && (
                <p className="text-center text-gray-500 text-sm mt-4">
                  ... и еще {comparison.sharedMovies.length - 10} фильмов
                </p>
              )}
            </div>
          </div>
        )}

        {/* Genre Preferences Profile */}
        {comparison.genreProfiles && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-6">🎭 Профиль жанров</h2>
            
            {(() => {
              const current = comparison.genreProfiles.current || {};
              const compared = comparison.genreProfiles.compared || {};
              
              // Get all genres from both users
              const allGenres = new Set<string>([
                ...Object.keys(current),
                ...Object.keys(compared)
              ]);
              
              // Create array with diff calculations, then sort by minimum diff (best match first)
              const genresWithDiff = Array.from(allGenres)
                .map(genre => {
                  const currentScore = current[genre] || 0;
                  const comparedScore = compared[genre] || 0;
                  const currentRating = currentScore / 10;
                  const comparedRating = comparedScore / 10;
                  const diff = Math.abs(currentRating - comparedRating);
                  return { genre, diff, currentRating, comparedRating };
                })
                .sort((a, b) => a.diff - b.diff); // Sort by minimum diff first
              
              const topGenresToShow = genresWithDiff.slice(0, 8);

              return (
                <div className="space-y-3">
                  {topGenresToShow.map(({ genre, diff, currentRating, comparedRating }) => {
                    // Determine color based on difference
                    let diffColor = 'text-green-400';
                    let diffEmoji = '✅';
                    if (diff > 0.8) {
                      diffColor = 'text-red-400';
                      diffEmoji = '🔴';
                    } else if (diff > 0.3) {
                      diffColor = 'text-yellow-400';
                      diffEmoji = '🟡';
                    }

                    return (
                      <div
                        key={genre}
                        className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:bg-gray-750 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-white capitalize text-lg">{genre}</h3>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm">
                                Вы: <span className="text-blue-400 font-bold">{currentRating.toFixed(1)}</span>
                              </span>
                              <span className="text-sm">
                                Они: <span className="text-purple-400 font-bold">{comparedRating.toFixed(1)}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center">
                          <span className={`text-sm ${diffColor} font-semibold`}>
                            ← Разница: {diff.toFixed(1)} {diffEmoji}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
