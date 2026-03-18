import { vi, describe, it, expect } from 'vitest';

// Mock database and side-effect dependencies BEFORE importing similarity
vi.mock('@/lib/prisma', () => ({
  prisma: {},
}));

vi.mock('@/lib/redis', () => ({
  getRedis: () => null,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/movieStatusConstants', () => ({
  MOVIE_STATUS_IDS: {
    WATCHED: 1,
    REWATCHED: 2,
    DROPPED: 3,
    WANT: 4,
  },
}));

vi.mock('@/taste-map/redis', () => ({
  getTasteMap: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/taste-map/compute', () => ({
  computeTasteMap: vi.fn(() => Promise.resolve(null)),
}));

// Now import the functions we need to test
import { computeOverallMatch } from '@/lib/taste-map/similarity';
import { generateTasteMapSnapshot } from '@/lib/taste-map/similarity-storage';

describe('Acceptance: Update Similarity Weights (60% genres + 40% movies)', () => {

  describe('computeOverallMatch formula', () => {
    it('should compute: ratingCorrelation * 0.4 + tasteSimilarity * 0.6', () => {
      const mockResult = {
        tasteSimilarity: 0.8,
        ratingCorrelation: 0.9,
        personOverlap: 0.5, // Should be ignored
      };

      const result = computeOverallMatch(mockResult);

      // Expected: ((0.9 + 1) / 2) * 0.4 + (0.8 * 0.6) = 0.38 + 0.48 = 0.86
      expect(result).toBe(0.86);
    });

    it('should ignore personOverlap even if provided', () => {
      const withoutPerson = {
        tasteSimilarity: 0.5,
        ratingCorrelation: 0.5,
      };

      const withPerson = {
        tasteSimilarity: 0.5,
        ratingCorrelation: 0.5,
        personOverlap: 1.0,
      };

       // Both should yield same result (0.6) regardless of personOverlap presence
       expect(computeOverallMatch(withoutPerson)).toBeCloseTo(0.6, 5);
       expect(computeOverallMatch(withPerson)).toBeCloseTo(0.6, 5);
    });

    it('should work when personOverlap is omitted from object', () => {
      const minimalResult = {
        tasteSimilarity: 0.3,
        ratingCorrelation: 0.7,
      };

       // Should not throw and correctly compute
       const result = computeOverallMatch(minimalResult);
       // Using normalized fallback: movieScore = (0.7 + 1) / 2 = 0.85
       // Expected: 0.85 * 0.4 + 0.3 * 0.6 = 0.34 + 0.18 = 0.52
       expect(result).toBe(0.52);
    });
  });

  describe('Edge cases', () => {
    it('should handle both zero values', () => {
      const zeroResult = {
        tasteSimilarity: 0,
        ratingCorrelation: 0,
      };

      // With normalized fallback: movieScore = (0 + 1) / 2 = 0.5
      // Expected: 0.5 * 0.4 + 0 * 0.6 = 0.2
      expect(computeOverallMatch(zeroResult)).toBe(0.2);
    });

    it('should handle zero tasteSimilarity only', () => {
      const result = {
        tasteSimilarity: 0,
        ratingCorrelation: 1,
      };

      expect(computeOverallMatch(result)).toBe(0.4);
    });

    it('should handle zero ratingCorrelation only', () => {
      const result = {
        tasteSimilarity: 1,
        ratingCorrelation: 0,
      };

      // ratingCorrelation = 0 → normalized = 0.5
      // Expected: 0.5 * 0.4 + 1 * 0.6 = 0.2 + 0.6 = 0.8
      expect(computeOverallMatch(result)).toBe(0.8);
    });

    it('should handle negative ratingCorrelation (can be -1 to 1)', () => {
      const result = {
        tasteSimilarity: 1,
        ratingCorrelation: -1,
      };

      // ratingCorrelation = -1 → normalized = 0
      // Expected: 0 * 0.4 + 1 * 0.6 = 0.6
      expect(computeOverallMatch(result)).toBe(0.6);
    });

    it('should cap ratingCorrelation above 1? (test boundary)', () => {
      const result = {
        tasteSimilarity: 0,
        ratingCorrelation: 1.5,
      };

      // ratingCorrelation = 1.5 → normalized = (1.5 + 1) / 2 = 1.25
      // Expected: 1.25 * 0.4 = 0.5 (tasteSimilarity 0)
      expect(computeOverallMatch(result)).toBe(0.5);
    });

    it('should handle undefined inputs gracefully', () => {
      // Cast to any to bypass type checking for this edge case test
      const result = {
        tasteSimilarity: undefined,
        ratingCorrelation: undefined,
      } as any;

      // Should not throw, result will be NaN which might be handled upstream
      // This test documents current behavior
      const computed = computeOverallMatch(result);
      expect(computed).toBeNaN();
    });
  });

  describe('Backward compatibility', () => {
    it('should ignore personOverlap from old code (if still passed)', () => {
      // Simulating old format where personOverlap was included with weight 0.2
      const oldStyleResult = {
        tasteSimilarity: 0.5,
        ratingCorrelation: 0.5,
        personOverlap: 0.3,
      };

       // New formula with normalized ratingCorrelation:
       // movieScore = (0.5 + 1) / 2 = 0.75
       // expected: 0.75 * 0.4 + 0.5 * 0.6 = 0.3 + 0.3 = 0.6
       const expected = 0.6;
       expect(computeOverallMatch(oldStyleResult)).toBeCloseTo(expected, 5);
    });

    it('should produce different scores than old formula', () => {
      const sameInputs = {
        tasteSimilarity: 0.7,
        ratingCorrelation: 0.6,
        personOverlap: 0.4,
      };

      // Old formula (if weights were 0.3, 0.5, 0.2):
      // oldScore = (0.6 * 0.5) + (0.7 * 0.3) + (0.4 * 0.2) = 0.3 + 0.21 + 0.08 = 0.59
      // New formula with normalized ratingCorrelation:
      // movieScore = (0.6 + 1) / 2 = 0.8
      // expected: 0.8 * 0.4 + 0.7 * 0.6 = 0.32 + 0.42 = 0.74
      const newScore = computeOverallMatch(sameInputs);
      expect(newScore).not.toBe(0.59);
      expect(newScore).toBe(0.74);
    });
  });

  describe('Integration with ratingPatterns', () => {
    it('should use overallMovieMatch from ratingPatterns as movieScore', () => {
      const resultWithPatterns = {
        tasteSimilarity: 0.6,
        ratingCorrelation: 0.3,
        ratingPatterns: {
          overallMovieMatch: 0.85,
          perfectMatches: 10,
          closeMatches: 5,
          moderateMatches: 2,
          largeDifference: 1,
          sameCategory: 12,
          differentIntensity: 3,
          avgRatingUser1: 7.5,
          avgRatingUser2: 8.0,
          intensityMatch: 0.8,
          pearsonCorrelation: 0.3,
          totalSharedMovies: 17,
          avgRatingDifference: 0.5,
          positiveRatingsPercentage: 70,
          bothRewatchedCount: 3,
        },
      };

      // movieScore should be ratingPatterns.overallMovieMatch (0.85)
      // Expected: 0.85 * 0.4 + 0.6 * 0.6 = 0.34 + 0.36 = 0.70
      expect(computeOverallMatch(resultWithPatterns)).toBe(0.70);
    });

     it('should use normalized ratingCorrelation when no ratingPatterns', () => {
       const resultWithoutPatterns = {
         tasteSimilarity: 0.4,
         ratingCorrelation: 0.8,
       };

       // Using normalized ratingCorrelation: movieScore = (0.8 + 1) / 2 = 0.9
       // Expected: 0.9 * 0.4 + 0.4 * 0.6 = 0.36 + 0.24 = 0.6
       expect(computeOverallMatch(resultWithoutPatterns)).toBeCloseTo(0.6, 5);
     });

    it('should handle negative ratingCorrelation with patterns', () => {
      const result = {
        tasteSimilarity: 0.5,
        ratingCorrelation: -0.5,
        ratingPatterns: {
          overallMovieMatch: 0.3,
          perfectMatches: 2,
          closeMatches: 1,
          moderateMatches: 3,
          largeDifference: 4,
          sameCategory: 3,
          differentIntensity: 4,
          avgRatingUser1: 4.0,
          avgRatingUser2: 6.0,
          intensityMatch: 0.5,
          pearsonCorrelation: -0.5,
          totalSharedMovies: 7,
          avgRatingDifference: 2.0,
          positiveRatingsPercentage: 20,
          bothRewatchedCount: 0,
        },
      };

      // Should use overallMovieMatch (0.3) not normalized ratingCorrelation
      // Expected: 0.3 * 0.4 + 0.5 * 0.6 = 0.12 + 0.30 = 0.42
      expect(computeOverallMatch(result)).toBe(0.42);
    });
  });

  describe('Full range values', () => {
    it('should correctly compute perfect match (1.0)', () => {
      const perfect = {
        tasteSimilarity: 1.0,
        ratingCorrelation: 1.0,
      };

      // 1.0 * 0.4 + 1.0 * 0.6 = 1.0
      expect(computeOverallMatch(perfect)).toBe(1.0);
    });

     it('should correctly compute worst case alignment', () => {
       const worst = {
         tasteSimilarity: 0,
         ratingCorrelation: -1,
       };

       // ratingCorrelation = -1 → normalized = 0
       // Expected: 0 * 0.4 + 0 * 0.6 = 0
       expect(computeOverallMatch(worst)).toBe(0);
     });
  });
});


describe('Snapshot generation (Plan 25-01)', () => {
  it('should generate snapshot without personProfiles', () => {
    const tasteMap = {
      genreProfile: { Action: 10, Drama: 5 },
      personProfiles: {
        actors: { 'Actor A': 8.5 },
        directors: { 'Director B': 9.0 }
      }
    } as any;
    const snapshot = generateTasteMapSnapshot(tasteMap);
    expect(snapshot).toEqual({ genreProfile: tasteMap.genreProfile });
    expect(snapshot).not.toHaveProperty('personProfiles');
  });
});

export {};
