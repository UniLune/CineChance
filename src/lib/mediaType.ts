import type { Media } from './tmdb';

/**
 * Configuration for media type display.
 * Used by MovieCard to show the correct badge (Фильм, Сериал, Аниме, Мульт).
 */
export interface MediaTypeConfig {
  /** Display label shown in the card badge (e.g., "Аниме", "Мульт") */
  label: string;
  /** Background color for the badge */
  backgroundColor: string;
  /** Whether this is Japanese animation */
  isAnime: boolean;
  /** Whether this is Western animation */
  isAnimated: boolean;
  /** Internal display type for logic */
  displayType: 'movie' | 'tv' | 'anime' | 'animated';
}

const ANIME_COLOR = '#9C40FE';
const ANIMATED_COLOR = '#F97316';
const MOVIE_COLOR = '#22c55e';
const TV_COLOR = '#3b82f6';

/**
 * Determines the display type for a media item.
 * Uses genre_ids (animation = 16) and original_language ('ja' = Japanese) to detect:
 * - Аниме: animation genre + Japanese language
 * - Мульт: animation genre + non-Japanese language  
 * - Сериал: TV media type without animation
 * - Фильм: movie media type without animation
 * 
 * @param movie - Media object from TMDB (must include genre_ids and original_language)
 * @returns MediaTypeConfig - Display configuration for the card badge
 */
export function getMediaTypeDisplay(movie: Media): MediaTypeConfig {
  const hasAnimationGenre = movie.genre_ids?.includes(16) ?? false;
  const isJapanese = movie.original_language === 'ja';

  console.log('[getMediaTypeDisplay] Analyzing movie:', {
    id: movie.id,
    title: movie.title || movie.name,
    genre_ids: movie.genre_ids,
    hasAnimationGenre,
    original_language: movie.original_language,
    isJapanese,
    media_type: movie.media_type,
  });

  if (hasAnimationGenre && isJapanese) {
    console.log('[getMediaTypeDisplay] Result: АНИМЕ');
    return { label: 'Аниме', backgroundColor: ANIME_COLOR, isAnime: true, isAnimated: false, displayType: 'anime' };
  }

  if (hasAnimationGenre && !isJapanese) {
    console.log('[getMediaTypeDisplay] Result: МУЛЬТ');
    return { label: 'Мульт', backgroundColor: ANIMATED_COLOR, isAnime: false, isAnimated: true, displayType: 'animated' };
  }

  if (movie.media_type === 'movie') {
    console.log('[getMediaTypeDisplay] Result: ФИЛЬМ');
    return { label: 'Фильм', backgroundColor: MOVIE_COLOR, isAnime: false, isAnimated: false, displayType: 'movie' };
  }

  console.log('[getMediaTypeDisplay] Result: СЕРИАЛ');
  return { label: 'Сериал', backgroundColor: TV_COLOR, isAnime: false, isAnimated: false, displayType: 'tv' };
}
