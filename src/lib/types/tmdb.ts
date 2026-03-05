// src/lib/types/tmdb.ts
// Comprehensive TMDB API type definitions

// ===================
// Base Types
// ===================

/**
 * Represents a genre in TMDB
 */
export interface TMDBGenre {
  id: number;
  name: string;
}

/**
 * Common fields for all TMDB media items (movies and TV shows)
 */
export interface TMDBMediaBase {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  overview: string;
  adult?: boolean;
  original_language?: string;
  genre_ids?: number[];
  genres?: TMDBGenre[];
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
  media_type: 'movie' | 'tv';
}

/**
 * Movie-specific fields
 */
export interface TMDBMovie extends TMDBMediaBase {
  media_type: 'movie';
  title: string;
  release_date: string;
  runtime?: number;
  budget?: number;
  revenue?: number;
  status?: string;
  tagline?: string;
  production_companies?: TMDBProductionCompany[];
  production_countries?: { iso_3166_1: string; name: string }[];
  spoken_languages?: { iso_639_1: string; name: string }[];
  homepage?: string;
  imdb_id?: string;
}

/**
 * TV Show-specific fields
 */
export interface TMDBTVShow extends TMDBMediaBase {
  media_type: 'tv';
  name: string;
  first_air_date: string;
  last_air_date?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  episode_run_time?: number[];
  created_by?: TMDBCreator[];
  networks?: TMDBNetwork[];
  production_companies?: TMDBProductionCompany[];
  origin_country?: string[];
  type?: string;
  seasons?: TMDBSeason[];
}

/**
 * Union type for any TMDB media item
 */
export type TMDBMedia = TMDBMovie | TMDBTVShow;

// ===================
// Collection Types
// ===================

/**
 * Part of a TMDB collection
 */
export interface TMDBCollectionPart {
  id: number;
  title: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  release_date?: string;
  overview: string;
}

/**
 * Full collection response
 */
export interface TMDBCollection {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: TMDBCollectionPart[];
}

// ===================
// Person/ Cast Types
// ===================

/**
 * Basic person information
 */
export interface TMDBPerson {
  id: number;
  name: string;
  known_for_department?: string;
  profile_path: string | null;
  birthday?: string;
  deathday?: string;
  place_of_birth?: string;
  popularity?: number;
  also_known_as?: string[];
  biography?: string;
  adult?: boolean;
  gender?: number;
  imdb_id?: string;
  homepage?: string;
}

/**
 * Cast member role in a movie/TV show
 */
export interface TMDBCast extends TMDBPerson {
  character: string;
  order: number;
  credit_id: string;
}

/**
 * Crew member role in a movie/TV show
 */
export interface TMDBCrew extends TMDBPerson {
  department: string;
  job: string;
  credit_id: string;
}

/**
 * Combined credits (cast + crew)
 */
export interface TMDBCombinedCredits {
  cast: TMDBCast[];
  crew: TMDBCrew[];
}

// ===================
// Search Types
// ===================

/**
 * Search response wrapper
 */
export interface TMDBSearchResponse<T extends TMDBMedia = TMDBMedia> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

// ===================
// Production Companies
// ===================

export interface TMDBProductionCompany {
  id: number;
  name: string;
  logo_path?: string | null;
  origin_country?: string;
}

// ===================
// Network
// ===================

export interface TMDBNetwork {
  id: number;
  name: string;
  logo_path?: string | null;
  origin_country?: string;
}

// ===================
// TV Season
// ===================

export interface TMDBSeason {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  season_number: number;
  episode_count: number;
  air_date?: string;
}

// ===================
// TV Episode
// ===================

export interface TMDBEpisode {
  id: number;
  name: string;
  overview: string;
  vote_average: number;
  vote_count: number;
  air_date: string;
  episode_number: number;
  season_number: number;
  still_path?: string | null;
}

// ===================
// Creator (for TV)
// ===================

export interface TMDBCreator {
  id: number;
  name: string;
  profile_path?: string | null;
  credit_id: string;
  gender?: number;
}

// ===================
// Error Response
// ===================

export interface TMDBErrorResponse {
  status_message: string;
  status_code: number;
}

// ===================
// Type Guards
// ===================

/**
 * Type guard for TMDBMediaBase
 */
export function isTMDBMediaBase(obj: unknown): obj is TMDBMediaBase {
  if (typeof obj !== 'object' || obj === null) return false;
  const data = obj as Record<string, unknown>;
  return (
    typeof data.id === 'number' &&
    (typeof data.title === 'string' || typeof data.name === 'string') &&
    (typeof data.poster_path === 'string' || data.poster_path === null) &&
    typeof data.vote_average === 'number' &&
    typeof data.vote_count === 'number' &&
    typeof data.overview === 'string'
  );
}

/**
 * Type guard for TMDBMovie
 */
export function isTMDBMovie(obj: unknown): obj is TMDBMovie {
  if (!isTMDBMediaBase(obj)) return false;
  const data = obj as TMDBMediaBase;
  return data.media_type === 'movie' && typeof data.title === 'string';
}

/**
 * Type guard for TMDBTVShow
 */
export function isTMDBTVShow(obj: unknown): obj is TMDBTVShow {
  if (!isTMDBMediaBase(obj)) return false;
  const data = obj as TMDBMediaBase;
  return data.media_type === 'tv' && typeof data.name === 'string';
}

/**
 * Type guard for TMDBGenre
 */
export function isTMDBGenre(obj: unknown): obj is TMDBGenre {
  if (typeof obj !== 'object' || obj === null) return false;
  const data = obj as Record<string, unknown>;
  return typeof data.id === 'number' && typeof data.name === 'string';
}

/**
 * Type guard for TMDBCollectionPart
 */
export function isTMDBCollectionPart(obj: unknown): obj is TMDBCollectionPart {
  if (typeof obj !== 'object' || obj === null) return false;
  const data = obj as Record<string, unknown>;
  return (
    typeof data.id === 'number' &&
    typeof data.title === 'string' &&
    (typeof data.poster_path === 'string' || data.poster_path === null) &&
    typeof data.vote_average === 'number' &&
    typeof data.vote_count === 'number' &&
    typeof data.overview === 'string'
  );
}

/**
 * Type guard for TMDBPerson
 */
export function isTMDBPerson(obj: unknown): obj is TMDBPerson {
  if (typeof obj !== 'object' || obj === null) return false;
  const data = obj as unknown as Record<string, unknown>;
  return (
    typeof data.id === 'number' &&
    typeof data.name === 'string' &&
    (typeof data.profile_path === 'string' || data.profile_path === null)
  );
}

/**
 * Type guard for TMDBCast
 */
export function isTMDBCast(obj: unknown): obj is TMDBCast {
  if (!isTMDBPerson(obj)) return false;
  // TMDBCast extends TMDBPerson, so all person fields are present
  // Need to check additional cast-specific fields
  const cast = obj as unknown as Record<string, unknown>;
  return typeof cast.character === 'string' && typeof cast.order === 'number';
}

/**
 * Type guard for TMDBCrew
 */
export function isTMDBCrew(obj: unknown): obj is TMDBCrew {
  if (!isTMDBPerson(obj)) return false;
  const crew = obj as unknown as Record<string, unknown>;
  return typeof crew.department === 'string' && typeof crew.job === 'string';
}

/**
 * Type guard for TMDBSearchResponse
 */
export function isTMDBSearchResponse<T extends TMDBMedia>(
  obj: unknown,
  validator?: (item: unknown) => item is T
): obj is TMDBSearchResponse<T> {
  if (typeof obj !== 'object' || obj === null) return false;
  const data = obj as Record<string, unknown>;
  return (
    typeof data.page === 'number' &&
    Array.isArray(data.results) &&
    typeof data.total_pages === 'number' &&
    typeof data.total_results === 'number' &&
    (validator ? data.results.every(validator) : true)
  );
}
