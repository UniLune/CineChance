'use client';

import type { TasteMap } from '@/lib/taste-map/types';
import TwinTasters from './TwinTasters';

/** TMDB movie genre names in alphabetical order */
const TMDB_GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Family', 'Fantasy', 'History',
  'Horror', 'Music', 'Mystery', 'Romance', 'Science Fiction',
  'TV Movie', 'Thriller', 'War', 'Western'
] as const;

/** Props for TasteMapClient component */
interface TasteMapClientProps {
  /** Taste map data from server (null when loading or no data) */
  tasteMap: TasteMap | null;
  /** Current user ID for TwinTasters component */
  userId: string;
  /** Whether the user is an admin (for showing admin controls) */
  isAdmin?: boolean;
}

/**
 * Client component for rendering user's taste map profile.
 *
 * Displays:
 * - Summary stats (average rating, positive/negative intensity, consistency, diversity)
 * - Computed metrics details with descriptions
 * - Behavior profile (rewatch rate, drop rate, completion rate)
 * - TwinTasters (similar users) component
 *
 * Charts (genre bar chart, rating pie chart) were removed in Phase 25-03
 * to simplify the UI. Only text-based metrics remain.
 *
 * @param props - Component props
 * @returns Taste map profile UI or empty state
 */
/**
 * Client component for rendering user's taste map profile.
 *
 * Displays:
 * - Summary stats (average rating, positive/negative intensity, consistency, diversity)
 * - Computed metrics details with descriptions
 * - Behavior profile (rewatch rate, drop rate, completion rate)
 * - TwinTasters (similar users) component with isAdmin prop passed for admin controls
 *
 * Charts (genre bar chart, rating pie chart) were removed in Phase 25-03
 * to simplify the UI. Only text-based metrics remain.
 *
 * @param props - Component props
 * @returns Taste map profile UI or empty state
 */
export default function TasteMapClient({ tasteMap, userId, isAdmin = false }: TasteMapClientProps) {
  // Empty state - show empty when genreCounts is empty or all zeros
  const genreCountsEmpty = !tasteMap?.genreCounts || Object.keys(tasteMap.genreCounts).length === 0;
  const allCountsZero = tasteMap?.genreCounts && Object.values(tasteMap.genreCounts).every(c => c === 0);
  if (!tasteMap || genreCountsEmpty || allCountsZero) {
    return (
      <div className="bg-gray-900 rounded-lg p-8 text-center">
        <div className="text-6xl mb-4">🎬</div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Карта вкуса пуста
        </h2>
        <p className="text-gray-400 mb-4">
          Добавьте фильмы и сериалы в свой список, чтобы увидеть анализ ваших предпочтений.
        </p>
        <a
          href="/my-movies"
          className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
        >
          Добавить фильмы
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Computed Metrics Details */}
      <div className="bg-gray-900 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Метрики профиля</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-green-500">
              {tasteMap.computedMetrics.positiveIntensity}%
            </div>
            <div className="text-sm text-gray-400 mt-1">Положительный настрой</div>
            <div className="text-xs text-gray-500 mt-2">
              Процент высоких оценок (8-10)
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-red-500">
              {tasteMap.computedMetrics.negativeIntensity}%
            </div>
            <div className="text-sm text-gray-400 mt-1">Критический настрой</div>
            <div className="text-xs text-gray-500 mt-2">
              Процент низких оценок (1-4)
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-yellow-500">
              {tasteMap.computedMetrics.consistency}%
            </div>
            <div className="text-sm text-gray-400 mt-1">Консистентность</div>
            <div className="text-xs text-gray-500 mt-2">
              Стабильность оценок
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-purple-500">
              {tasteMap.computedMetrics.diversity}%
            </div>
            <div className="text-sm text-gray-400 mt-1">Разнообразие</div>
            <div className="text-xs text-gray-500 mt-2">
              Количество предпочитаемых жанров
            </div>
          </div>
        </div>
      </div>

      {/* Behavior Profile */}
      <div className="bg-gray-900 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Поведенческий профиль</h2>
        <div className="text-sm text-gray-400 mb-4">
          Анализ ваших привычек просмотра: как часто вы пересматриваете понравившиеся фильмы, какой процент добавленного контента вы бросаете, и насколько успешно вы завершаете начатый контент.
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-800 rounded-lg p-4 text-center hover:bg-gray-700 transition-colors">
            <div className="text-2xl font-bold text-purple-400">
              {tasteMap.behaviorProfile.rewatchRate}%
            </div>
            <div className="text-xs font-semibold text-gray-300 mb-2">Пересмотры</div>
            <div className="text-xs text-gray-500">
              Доля фильмов, пересмотренных более одного раза
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 text-center hover:bg-gray-700 transition-colors">
            <div className="text-2xl font-bold text-red-400">
              {tasteMap.behaviorProfile.dropRate}%
            </div>
            <div className="text-xs font-semibold text-gray-300 mb-2">Брошено</div>
            <div className="text-xs text-gray-500">
              Процент брошенного контента из того, что вы захотели смотреть
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 text-center hover:bg-gray-700 transition-colors">
            <div className="text-2xl font-bold text-green-400">
              {tasteMap.behaviorProfile.completionRate}%
            </div>
            <div className="text-xs font-semibold text-gray-300 mb-2">Завершение</div>
            <div className="text-xs text-gray-500">
              Процент просмотренного контента из всех добавленных
            </div>
          </div>
        </div>
      </div>

      {/* Ваши жанры */}
      <div className="bg-gray-900 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Ваши жанры</h2>
        <div className="space-y-3">
          {TMDB_GENRES.map(genre => {
            const count = tasteMap.genreCounts[genre] ?? 0;
            const avg = tasteMap.genreProfile[genre] || 0;
            const maxCount = Math.max(...Object.values(tasteMap.genreCounts), 1);
            const barWidth = (count / maxCount) * 100;
            const hasRating = avg > 0;
            // Always show count for all genres
            const countDisplay = `(${count})`;
            const avgDisplay = hasRating ? avg.toFixed(1) : '—';
            return (
              <div key={genre} className="flex items-center text-sm">
                <div className="w-40 md:w-48 text-gray-300 truncate">{genre} {countDisplay} {avgDisplay}</div>
                <div className="flex-1 mx-2 bg-gray-700 rounded-full h-2.5 overflow-hidden">
                  <div className="bg-purple-500 h-full rounded-full" style={{ width: `${barWidth}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Twin Tasters / Similar Users */}
      <TwinTasters userId={userId} isAdmin={isAdmin} />
    </div>
  );
}
