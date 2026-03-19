/**
 * Unit Tests: Taste-Map Compute Module
 * Phase: 19-03 Task 1
 * Target: src/lib/taste-map/compute.ts
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    watchList: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/tmdb', () => ({
  fetchMediaDetails: vi.fn(),
}));

vi.mock('@/lib/movieStatusConstants', () => ({
  MOVIE_STATUS_IDS: {
    WATCHED: 1,
    REWATCHED: 2,
    WANT_TO_WATCH: 3,
    DROPPED: 4,
  },
}));

vi.mock('@/lib/taste-map/redis', () => ({
  storeTasteMap: vi.fn(),
  storeGenreProfile: vi.fn(),
  storePersonProfile: vi.fn(),
  storeTypeProfile: vi.fn(),
  getGenreProfile: vi.fn(),
  getPersonProfile: vi.fn(),
}));

import {
  computeGenreProfile,
  computePersonProfile,
  computeTypeProfile,
  computeRatingDistribution,
  computeAverageRating,
  computeMetrics,
  computeGenreCounts,
} from '@/lib/taste-map/compute';
import type { WatchListItemFull } from '@/lib/taste-map/types';

// Helper to create WatchListItemFull mock
function createMovie(
  overrides: Partial<WatchListItemFull> = {}
): WatchListItemFull {
  return {
    userId: 'user123',
    tmdbId: 1,
    mediaType: 'movie',
    userRating: null,
    voteAverage: 7.0,
    genres: [],
    credits: undefined,
    ...overrides,
  };
}

describe('computeGenreProfile', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('handles empty array', () => {
    expect(computeGenreProfile([])).toEqual({});
  });

  it('calculates weights for single movie', () => {
    const movies = [createMovie({ userRating: 8, genres: [{ id: 1, name: 'Action' }] })];
    expect(computeGenreProfile(movies)).toEqual({ Action: 80 });
  });

  it('uses userRating if present, otherwise voteAverage', () => {
    const movies = [
      createMovie({ userRating: 9, genres: [{ id: 28, name: 'Action' }] }),
      createMovie({ userRating: null, voteAverage: 6, genres: [{ id: 18, name: 'Drama' }] }),
    ];
    const result = computeGenreProfile(movies);
    expect(result.Action).toBe(90);
    expect(result.Drama).toBe(60);
  });

  it('handles multiple movies in same genre (averages)', () => {
    const movies = [
      createMovie({ userRating: 10, genres: [{ id: 28, name: 'Action' }] }),
      createMovie({ userRating: 6, genres: [{ id: 28, name: 'Action' }] }),
    ];
    expect(computeGenreProfile(movies).Action).toBe(80);
  });

  it('handles movie with multiple genres', () => {
    const movies = [createMovie({
      userRating: 8,
      genres: [{ id: 28, name: 'Action' }, { id: 12, name: 'Adventure' }],
    })];
    const result = computeGenreProfile(movies);
    expect(result.Action).toBe(80);
    expect(result.Adventure).toBe(80);
  });

  it('handles all same rating', () => {
    const movies = [
      createMovie({ userRating: 5, genres: [{ id: 28, name: 'Action' }] }),
      createMovie({ userRating: 5, genres: [{ id: 28, name: 'Action' }] }),
      createMovie({ userRating: 5, genres: [{ id: 18, name: 'Drama' }] }),
    ];
    const result = computeGenreProfile(movies);
    expect(result.Action).toBe(50);
    expect(result.Drama).toBe(50);
  });

  it('handles movie with no genres', () => {
    const movies = [createMovie({ userRating: 8, genres: [] })];
    expect(computeGenreProfile(movies)).toEqual({});
  });
});

describe('computeGenreCounts', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('handles empty array', () => {
    expect(computeGenreCounts([])).toEqual({});
  });

  it('counts single movie with one genre', () => {
    const movies = [createMovie({ genres: [{ id: 28, name: 'Action' }] })];
    expect(computeGenreCounts(movies)).toEqual({ Action: 1 });
  });

  it('counts single movie with multiple genres', () => {
    const movies = [createMovie({
      genres: [{ id: 28, name: 'Action' }, { id: 12, name: 'Adventure' }],
    })];
    const result = computeGenreCounts(movies);
    expect(result.Action).toBe(1);
    expect(result.Adventure).toBe(1);
  });

  it('sums counts for multiple movies with overlapping genres', () => {
    const movies = [
      createMovie({ genres: [{ id: 28, name: 'Action' }] }),
      createMovie({ genres: [{ id: 28, name: 'Action' }, { id: 18, name: 'Drama' }] }),
    ];
    const result = computeGenreCounts(movies);
    expect(result.Action).toBe(2);
    expect(result.Drama).toBe(1);
  });

  it('handles movies with no genres gracefully', () => {
    const movies = [
      createMovie({ genres: [] }),
      createMovie({ genres: [{ id: 28, name: 'Action' }] }),
    ];
    expect(computeGenreCounts(movies)).toEqual({ Action: 1 });
  });

  it('counts each movie once per genre', () => {
    const movies = [
      createMovie({ genres: [{ id: 28, name: 'Action' }, { id: 28, name: 'Action' }] }),
    ];
    // A movie with duplicate genre entries should count once
    expect(computeGenreCounts(movies)).toEqual({ Action: 1 });
  });
});

describe('computePersonProfile', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('handles empty array', () => {
    expect(computePersonProfile([])).toEqual({ actors: {}, directors: {} });
  });

  it('aggregates actors and directors from movies with credits', () => {
    const movies = [
      createMovie({
        credits: {
          cast: [{ id: 1, name: 'Actor A' }, { id: 2, name: 'Actor B' }],
          crew: [{ id: 10, job: 'Director', name: 'Director X' }],
        },
        userRating: 8,
      }),
      createMovie({
        credits: { cast: [{ id: 1, name: 'Actor A' }], crew: [] },
        userRating: 6,
      }),
    ];
    const result = computePersonProfile(movies);
    expect(result.actors['Actor A']).toBe(70);
    expect(result.actors['Actor B']).toBe(80);
    expect(result.directors['Director X']).toBe(80);
  });

  it('skips movies without credits', () => {
    const movies = [createMovie({ userRating: 8, genres: [] })];
    expect(computePersonProfile(movies)).toEqual({ actors: {}, directors: {} });
  });

  it('handles movie with empty cast but has crew', () => {
    const movies = [createMovie({
      credits: { cast: [], crew: [{ id: 10, job: 'Director', name: 'Director X' }] },
      userRating: 8,
    })];
    const result = computePersonProfile(movies);
    expect(result.actors).toEqual({});
    expect(result.directors['Director X']).toBe(80);
  });

  it('handles movie with empty crew', () => {
    const movies = [createMovie({
      credits: { cast: [{ id: 1, name: 'Actor A' }], crew: [] },
      userRating: 8,
    })];
    const result = computePersonProfile(movies);
    expect(result.actors['Actor A']).toBe(80);
    expect(result.directors).toEqual({});
  });
});

describe('computeTypeProfile', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('handles empty array', () => {
    expect(computeTypeProfile([])).toEqual({ movie: 0, tv: 0 });
  });

  it('counts only movies', () => {
    const movies = [createMovie({ mediaType: 'movie' }), createMovie({ mediaType: 'movie' })];
    expect(computeTypeProfile(movies)).toEqual({ movie: 100, tv: 0 });
  });

  it('counts only tv', () => {
    const movies = [createMovie({ mediaType: 'tv' }), createMovie({ mediaType: 'tv' })];
    expect(computeTypeProfile(movies)).toEqual({ movie: 0, tv: 100 });
  });

  it('computes percentages for mixed content', () => {
    const movies = [createMovie({ mediaType: 'movie' }), createMovie({ mediaType: 'movie' }), createMovie({ mediaType: 'tv' })];
    const result = computeTypeProfile(movies);
    expect(result.movie).toBe(67);
    expect(result.tv).toBe(33);
  });
});

describe('computeRatingDistribution', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('handles empty array', () => {
    expect(computeRatingDistribution([])).toEqual({ high: 0, medium: 0, low: 0 });
  });

  it('classifies high ratings (8-10)', () => {
    const movies = [createMovie({ userRating: 8 }), createMovie({ userRating: 10 })];
    const result = computeRatingDistribution(movies);
    expect(result.high).toBe(100);
    expect(result.medium).toBe(0);
    expect(result.low).toBe(0);
  });

  it('classifies medium ratings (5-7.9)', () => {
    const movies = [createMovie({ userRating: 5 }), createMovie({ userRating: 7 })];
    expect(computeRatingDistribution(movies).medium).toBe(100);
  });

  it('classifies low ratings (1-4.9)', () => {
    const movies = [createMovie({ userRating: 1 }), createMovie({ userRating: 4 })];
    expect(computeRatingDistribution(movies).low).toBe(100);
  });

  it('mixes high, medium, low', () => {
    const movies = [createMovie({ userRating: 9 }), createMovie({ userRating: 6 }), createMovie({ userRating: 2 })];
    const result = computeRatingDistribution(movies);
    expect(result.high).toBe(33);
    expect(result.medium).toBe(33);
    expect(result.low).toBe(33);
  });

  it('uses voteAverage if userRating is null', () => {
    const movies = [createMovie({ userRating: null, voteAverage: 9 }), createMovie({ userRating: null, voteAverage: 4 })];
    const result = computeRatingDistribution(movies);
    expect(result.high).toBe(50);
    expect(result.low).toBe(50);
  });
});

describe('computeAverageRating', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 0 for empty array', () => {
    expect(computeAverageRating([])).toBe(0);
  });

  it('computes average from user ratings only', () => {
    const movies = [createMovie({ userRating: 8 }), createMovie({ userRating: 6 }), createMovie({ userRating: 10 })];
    expect(computeAverageRating(movies)).toBeCloseTo(8, 1);
  });

  it('falls back to voteAverage when no user ratings', () => {
    const movies = [createMovie({ userRating: null, voteAverage: 7.5 }), createMovie({ userRating: null, voteAverage: 8.5 })];
    expect(computeAverageRating(movies)).toBeCloseTo(8, 1);
  });

  it('ignores null userRating and uses voteAverage only', () => {
    const movies = [createMovie({ userRating: null, voteAverage: 7 }), createMovie({ userRating: 5, voteAverage: 9 })];
    expect(computeAverageRating(movies)).toBe(5);
  });
});

describe('computeMetrics', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('computes metrics from empty inputs', () => {
    const result = computeMetrics({}, { high: 0, medium: 0, low: 0 });
    expect(result).toEqual({ positiveIntensity: 0, negativeIntensity: 0, consistency: 0, diversity: 0 });
  });

  it('uses ratingDistribution for intensity and consistency', () => {
    const genreProfile = { Action: 50, Drama: 30 };
    const ratingDistribution = { high: 60, medium: 30, low: 10 };
    const result = computeMetrics(genreProfile, ratingDistribution);
    expect(result.positiveIntensity).toBe(60);
    expect(result.negativeIntensity).toBe(10);
    expect(result.consistency).toBe(30);
  });

  it('computes diversity as percentage of unique genres', () => {
    const genreProfile = { Action: 50, Drama: 10, Comedy: 30, Thriller: 5 };
    const result = computeMetrics(genreProfile, { high: 0, medium: 100, low: 0 });
    expect(result.diversity).toBe(21);
  });

  it('caps diversity at 100 when all 19 genres present', () => {
    const genreProfile = {
      Action: 50, Adventure: 50, Animation: 50, Comedy: 50, Crime: 50,
      Documentary: 50, Drama: 50, Family: 50, Fantasy: 50, History: 50,
      Horror: 50, Music: 50, Mystery: 50, Romance: 50, 'Science Fiction': 50,
      'TV Movie': 50, Thriller: 50, War: 50, Western: 50,
    };
    const result = computeMetrics(genreProfile, { high: 0, medium: 100, low: 0 });
    expect(result.diversity).toBe(100);
  });
});

// Async functions
import {
  computeBehaviorProfile,
  computeTasteMap,
} from '@/lib/taste-map/compute';

describe('Async Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('computeBehaviorProfile', () => {
    it('returns default for empty watch list', async () => {
      const { prisma } = await import('@/lib/prisma');
      (prisma as any).watchList.findMany.mockResolvedValue([]);
      const result = await computeBehaviorProfile('user123');
      expect(result).toEqual({ rewatchRate: 0, dropRate: 0, completionRate: 0 });
    });

    it('computes rewatch rate correctly', async () => {
      const { prisma } = await import('@/lib/prisma');
      (prisma as any).watchList.findMany.mockResolvedValue([
        { statusId: 3, watchCount: 0 }, // WANT_TO_WATCH
        { statusId: 1, watchCount: 1 }, // WATCHED once
        { statusId: 2, watchCount: 2 }, // REWATCHED (statusId 2)
        { statusId: 4, watchCount: 1 }, // DROPPED
      ]);
      const result = await computeBehaviorProfile('user123');
      // totalWatched = watched (1) + rewatched (1) = 2
      // rewatchTotal = only REWATCHED counts as rewatch regardless of watchCount => 1
      // rewatchRate = 1/2 * 100 = 50
      expect(result.rewatchRate).toBe(50);
      // dropRate = dropped(1) / (want(1) + dropped(1)) * 100 = 50
      expect(result.dropRate).toBe(50);
      // completionRate = (watched+rewatched)/(want+watched+rewatched) *100 = (1+1)/(1+1+1)*100 = 66.66 -> 67
      expect(result.completionRate).toBe(67);
    });

    it('handles only wanted items', async () => {
      const { prisma } = await import('@/lib/prisma');
      (prisma as any).watchList.findMany.mockResolvedValue([{ statusId: 3, watchCount: 0 }]);
      const result = await computeBehaviorProfile('user123');
      // totalWithStatus = wantCount (1), watched+rewatched=0 => completionRate = 0
      expect(result).toEqual({ rewatchRate: 0, dropRate: 0, completionRate: 0 });
    });
  });

  describe('computeTasteMap', () => {
    it('returns empty taste map for user with no watched items', async () => {
      const { prisma } = await import('@/lib/prisma');
      (prisma as any).watchList.findMany.mockResolvedValue([]);
      const result = await computeTasteMap('user123');
      expect(result.userId).toBe('user123');
      expect(result.genreProfile).toEqual({});
      expect(result.genreCounts).toEqual({});
      expect(result.ratingDistribution).toEqual({ high: 0, medium: 0, low: 0 });
      expect(result.averageRating).toBe(0);
    });

    it('computes full taste map with sample data', async () => {
      const { prisma } = await import('@/lib/prisma');
      const { fetchMediaDetails } = await import('@/lib/tmdb');

      (prisma as any).watchList.findMany.mockResolvedValue([
        { tmdbId: 1, mediaType: 'movie', userRating: 9, voteAverage: 8.5 },
        { tmdbId: 2, mediaType: 'tv', userRating: 7, voteAverage: 7.2 },
      ]);

      (fetchMediaDetails as any).mockImplementation(async (id: number) => {
        if (id === 1) return { genres: [{ id: 28, name: 'Action' }] };
        if (id === 2) return { genres: [{ id: 18, name: 'Drama' }] };
        return null;
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ cast: [{ id: 1, name: 'Actor A' }], crew: [{ id: 10, job: 'Director', name: 'Director X' }] }),
      });

      const result = await computeTasteMap('user123');

      expect(result.genreProfile['Action']).toBe(90);
      expect(result.genreProfile['Drama']).toBe(70);
      expect(result.genreCounts['Action']).toBe(1);
      expect(result.genreCounts['Drama']).toBe(1);
      // Actor A appears in both movies: (9+7)/2 = 8 -> 80
      expect(result.personProfiles.actors['Actor A']).toBe(80);
      // Director X appears in both movies due to mock returning same crew for both, average (9+7)/2=8 -> 80
      expect(result.personProfiles.directors['Director X']).toBe(80);
      expect(result.ratingDistribution.high).toBe(50);
      expect(result.ratingDistribution.medium).toBe(50);
    });
  });
});
