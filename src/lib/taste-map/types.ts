/**
 * TasteMap Type Definitions
 * 
 * User preference profiles built from watched movies.
 * Used for similarity calculation between users for recommendation patterns.
 */

// Rating distribution percentages (high: 8-10, medium: 5-7, low: 1-4)
export interface RatingDistribution {
  high: number;    // Percentage of ratings 8-10 (0-100)
  medium: number;  // Percentage of ratings 5-7 (0-100)
  low: number;     // Percentage of ratings 1-4 (0-100)
}

// Behavior profile from watch history
export interface BehaviorProfile {
  rewatchRate: number;     // % of watched that were rewatched (0-100)
  dropRate: number;        // % of want that were dropped (0-100)
  completionRate: number;   // % of started that were completed (0-100)
}

// Computed metrics from preference analysis
export interface ComputedMetrics {
  positiveIntensity: number;  // How much user rates highly (0-100)
  negativeIntensity: number;  // How much user rates poorly (0-100)
  consistency: number;        // Variance in ratings - high means consistent (0-100)
  diversity: number;          // Genre variety - high means diverse (0-100)
}

// Person preference profiles
export interface PersonProfiles {
  actors: Record<string, number>;      // { "Actor Name": preference score 0-100 }
  directors: Record<string, number>;   // { "Director Name": preference score 0-100 }
}

// Genre preference profile
export interface GenreProfile {
  [genre: string]: number;  // { "action": 85, "comedy": 70 } - 0-100 scale
}

// Content type preference profile
export interface TypeProfile {
  movie: number;   // Percentage of watched that are movies (0-100)
  tv: number;      // Percentage of watched that are TV shows (0-100)
}

// Complete taste map for a user
export interface TasteMap {
  userId: string;
  genreProfile: GenreProfile;
  /** Movie count per genre (e.g., { "Action": 15, "Drama": 12 }) */
  genreCounts: Record<string, number>;
  ratingDistribution: RatingDistribution;
  averageRating: number;    // 0-10 scale
  personProfiles: PersonProfiles;
  behaviorProfile: BehaviorProfile;
  computedMetrics: ComputedMetrics;
  updatedAt: Date;
}

// Extended watch list item with TMDB details for computation
export interface WatchListItemWithGenres {
  userId: string;
  tmdbId: number;
  mediaType: string;
  userRating: number | null;
  voteAverage: number;
  genres: { id: number; name: string }[];
}

// Watch list item with credits for person profile computation
export interface WatchListItemWithCredits {
  userId: string;
  tmdbId: number;
  mediaType: string;
  userRating: number | null;
  voteAverage: number;
  credits?: {
    cast: { id: number; name: string; character?: string }[];
    crew: { id: number; name: string; job?: string }[];
  };
}

// Watch list item with full details
export interface WatchListItemFull extends WatchListItemWithGenres {
  credits?: {
    cast: { id: number; name: string; character?: string }[];
    crew: { id: number; name: string; job?: string }[];
  };
}

// Person data for taste map (actors/directors)
export interface PersonData {
  tmdbPersonId: number;
  name: string;
  count: number;               // How many movies they appear in
  average_rating: number;      // Weighted average rating (from API)
}

// Actor data (alias of PersonData for clarity)
export interface ActorData extends PersonData {}

// Director data (alias of PersonData for clarity)
export interface DirectorData extends PersonData {}
