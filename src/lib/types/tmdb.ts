// src/lib/types/tmdb.ts
// Comprehensive TypeScript type definitions for TMDB API responses

// ============================================
// Core Media Types
// ============================================

/**
 * Base media item (movie or TV show)
 */
 export interface TMDbMediaBase {
   id: number;
   title?: string;
   name?: string;
   poster_path: string | null;
   backdrop_path?: string | null;
   vote_average: number;
   vote_count: number;
   popularity?: number;
   overview: string;
   adult?: boolean;
   original_language?: string;
   original_title?: string;
   original_name?: string;
   release_date?: string;
   first_air_date?: string;
   genre_ids?: number[];
   genres?: TMDbGenre[];
   production_countries?: TMDbProductionCountry[];
   status?: string;
   tagline?: string;
   runtime?: number;
   episode_run_time?: number[];
   number_of_seasons?: number;
   number_of_episodes?: number;
   type?: string;
   media_type?: 'movie' | 'tv' | 'person' | 'collection' | 'network';
   credits?: TMDbCredits;
   belongs_to_collection?: { id: number; name: string } | null;
 }

/**
 * Movie-specific fields
 */
export interface TMDbMovie extends TMDbMediaBase {
  media_type: 'movie';
  title: string;
  release_date: string;
  budget?: number;
  revenue?: number;
  homepage?: string;
  imdb_id?: string;
}

/**
 * TV Show-specific fields
 */
export interface TMDbTV extends TMDbMediaBase {
  media_type: 'tv';
  name: string;
  first_air_date: string;
  created_by?: TMDbCreator[];
  episode_run_time: number[];
  in_production: boolean;
  languages?: string[];
  last_air_date?: string;
  last_episode_to_air?: TMDbEpisode;
  next_episode_to_air?: TMDbEpisode;
  networks?: TMDbNetwork[];
  origin_country?: string[];
  seasons?: TMDbSeason[];
}


/**
 * Person-specific fields
 */
export interface TMDbPerson {
  id: number;
  name: string;
  also_known_as?: string[];
  biography?: string;
  birthday?: string;
  deathday?: string;
  gender?: number;
  homepage?: string;
  imdb_id?: string;
  known_for_department?: string;
  place_of_birth?: string;
  popularity?: number;
  profile_path: string | null;
  adult?: boolean;
}

/**
 * Collection
 */
export interface TMDbCollection {
  id: number;
  name: string;
  description?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: TMDbCollectionPart[];
}

export interface TMDbCollectionPart {
  id: number;
  title: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  release_date?: string;
  overview: string;
  genre_ids?: number[];
  original_language?: string;
}

/**
 * Network
 */
export interface TMDbNetwork {
  id: number;
  name: string;
  logo_path?: string | null;
  origin_country?: string;
}

// ============================================
// Supporting Types
// ============================================

export interface TMDbGenre {
  id: number;
  name: string;
}

export interface TMDbProductionCountry {
  iso_3166_1: string;
  name: string;
}

export interface TMDbCreator {
  id: number;
  name: string;
  profile_path?: string | null;
  credit_id?: string;
}

export interface TMDbEpisode {
  id: number;
  name: string;
  overview?: string;
  vote_average?: number;
  vote_count?: number;
  air_date?: string;
  episode_number?: number;
  season_number?: number;
  still_path?: string | null;
}

export interface TMDbSeason {
  id: number;
  name: string;
  overview?: string;
  poster_path?: string | null;
  season_number: number;
  episode_count: number;
  air_date?: string;
}

// ============================================
// Cast & Crew Types
// ============================================

export interface TMDbCast extends TMDbPerson {
  character: string;
  order: number;
  credit_id: string;
  release_date?: string;
  first_air_date?: string;
}

export interface TMDBCrew extends TMDbPerson {
  job: string;
  department: string;
  credit_id: string;
}

export interface TMDbCredits {
  cast: TMDbCast[];
  crew: TMDBCrew[];
}

// ============================================
// Person Combined Credits Types (from /person/{id}/combined_credits)
// ============================================

/**
 * Cast entry from person's combined credits (includes movie/TV details)
 */
export interface TMDbPersonCastCredit extends TMDbMediaBase {
  character: string;
  credit_id: string;
  order: number;
}

/**
 * Crew entry from person's combined credits (includes movie/TV details)
 */
export interface TMDbPersonCrewCredit extends TMDbMediaBase {
  job: string;
  department: string;
  credit_id: string;
}

/**
 * Combined credits response for a person
 */
export interface TMDbPersonCredits {
  cast: TMDbPersonCastCredit[];
  crew: TMDbPersonCrewCredit[];
}

// ============================================
// API Response Wrapper Types
// ============================================

export interface TMDbSearchResult<T extends TMDbMediaBase = TMDbMediaBase> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TMDbMovieResponse {
  adult: boolean;
  backdrop_path: string | null;
  belongs_to_collection?: TMDbCollection | null;
  budget: number;
  genres: TMDbGenre[];
  homepage: string;
  id: number;
  imdb_id: string;
  original_language: string;
  original_title: string;
  overview: string;
  popularity: number;
  poster_path: string | null;
  production_companies?: TMDbProductionCompany[];
  production_countries: TMDbProductionCountry[];
  release_date: string;
  revenue: number;
  runtime: number | null;
  spoken_languages: TMDbSpokenLanguage[];
  status: string;
  tagline: string;
  title: string;
  video: boolean;
  vote_average: number;
  vote_count: number;
  credits?: TMDbCredits;
}

export interface TMDbTVResponse {
  adult: boolean;
  backdrop_path: string | null;
  created_by: TMDbCreator[];
  episode_run_time: number[];
  genres: TMDbGenre[];
  homepage: string;
  id: number;
  in_production: boolean;
  languages: string[];
  last_air_date: string;
  last_episode_to_air: TMDbEpisode | null;
  next_episode_to_air: TMDbEpisode | null;
  name: string;
  networks: TMDbNetwork[];
  number_of_episodes: number;
  number_of_seasons: number;
  origin_country: string[];
  original_language: string;
  original_name: string;
  overview: string;
  popularity: number;
  poster_path: string | null;
  production_companies?: TMDbProductionCompany[];
  production_countries: TMDbProductionCountry[];
  seasons: TMDbSeason[];
  spoken_languages: TMDbSpokenLanguage[];
  status: string;
  tagline: string;
  type: string;
  vote_average: number;
  vote_count: number;
  credits?: TMDbCredits;
}

/**
 * TMDB error response (when API key invalid, etc)
 */
export interface TMDbErrorResponse {
  status_code: number;
  status_message: string;
}

/**
 * Union type for search responses (success or error)
 */
export type TMDbSearchResponse<T extends TMDbMediaBase> = TMDbSearchResult<T> | TMDbErrorResponse;

/**
 * Type guard: check if response is a successful search result
 */
export function isSuccessfulSearchResult<T extends TMDbMediaBase>(
  data: TMDbSearchResponse<T>
): data is TMDbSearchResult<T> {
  return 'results' in data && Array.isArray(data.results);
}

/**
 * Type guard: check if response is a TMDB error
 */
export function isTMDBErrorResponse(
  data: TMDbSearchResponse<any>
): data is TMDbErrorResponse {
  return 'status_code' in data && 'status_message' in data;
}

export interface TMDbProductionCompany {
  id: number;
  name: string;
  logo_path?: string | null;
  origin_country: string;
}

export interface TMDbSpokenLanguage {
  english_name: string;
  iso_639_1: string;
  name: string;
}

// ============================================
// Utility Types
// ============================================

/**
 * Union type for any TMDB media item
 */
export type TMDbMedia = TMDbMovie | TMDbTV;



// ============================================
// Type Guards
// ============================================

/**
 * Type guard for TMDB search result items
 */
export function isTMDbMediaBase(obj: unknown): obj is TMDbMediaBase {
  if (obj === null || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === 'number' &&
    typeof o.title === 'string' &&
    typeof o.overview === 'string' &&
    ('poster_path' in o || 'backdrop_path' in o)
  );
}


/**
 * Type guard for TMDB person
 */
export function isTMDbPerson(obj: unknown): obj is TMDbPerson {
  if (obj === null || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === 'number' &&
    typeof o.name === 'string'
  );
}

export function isTMDbCast(obj: unknown): obj is TMDbCast {
  if (!isTMDbPerson(obj)) return false;
  const o = obj as unknown as Record<string, unknown>;
  return (
    'character' in o &&
    typeof o.character === 'string'
  );
}

export function isTMDBCrew(obj: unknown): obj is TMDBCrew {
  if (!isTMDbPerson(obj)) return false;
  const o = obj as unknown as Record<string, unknown>;
  return (
    'job' in o &&
    typeof o.job === 'string'
  );
}

// ============================================
// Type Guards for Specific Types
// ============================================
// Type Guards
// ============================================

/**
 * Type guard for TMDbMovie
 */
export function isTMDbMovie(obj: unknown): obj is TMDbMovie {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return o.media_type === 'movie';
}

export function isTMDbTV(obj: unknown): obj is TMDbTV {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return o.media_type === 'tv';
}


/**
 * Safely extract release date
 */
export function getReleaseDate(media: TMDbMediaBase): string | undefined {
  return media.release_date || media.first_air_date;
}

/**
 * Extract primary genre names
 */
export function getGenreNames(media: TMDbMediaBase): string[] {
  if (media.genres && Array.isArray(media.genres)) {
    return media.genres.map(g => g.name);
  }
  return [];
}

/**
 * Check if media has valid poster
 */
export function hasValidPoster(media: TMDbMediaBase): boolean {
  return !!media.poster_path && media.poster_path.length > 0;
}

/**
 * Extract TMDB ID safely from various response formats
 */
export function extractTMDBId(data: unknown): number | null {
  if (data && typeof data === 'object' && 'id' in data) {
    const id = (data as any).id;
    if (typeof id === 'number') return id;
  }
  return null;
}
export type MovieDetails = TMDbMovie | TMDbTV;
