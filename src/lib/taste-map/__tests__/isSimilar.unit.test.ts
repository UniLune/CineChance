import { describe, it, expect } from 'vitest';
import { isSimilar } from '../similarity';
import type { SimilarityResult } from '../similarity';

describe('isSimilar (unit)', () => {
  const baseResult: SimilarityResult = {
    tasteSimilarity: 0.5,
    ratingCorrelation: 0.5,
    personOverlap: 0.5,
    overallMatch: 0.5,
  };

  it('accepts overallMatch >= 0.4', () => {
    expect(isSimilar({ ...baseResult, overallMatch: 0.4 })).toBe(true);
    expect(isSimilar({ ...baseResult, overallMatch: 0.5 })).toBe(true);
    expect(isSimilar({ ...baseResult, overallMatch: 1.0 })).toBe(true);
  });

  it('rejects overallMatch < 0.4', () => {
    expect(isSimilar({ ...baseResult, overallMatch: 0.39 })).toBe(false);
    expect(isSimilar({ ...baseResult, overallMatch: 0.0 })).toBe(false);
  });

  it('handles negative overallMatch', () => {
    expect(isSimilar({ ...baseResult, overallMatch: -0.1 })).toBe(false);
  });

  it('handles undefined overallMatch gracefully', () => {
    const resultWithoutOverallMatch = {
      tasteSimilarity: 0.5,
      ratingCorrelation: 0.5,
      personOverlap: 0.5,
    } as SimilarityResult;
    expect(isSimilar(resultWithoutOverallMatch)).toBe(false);
  });

  it('handles result with all properties missing', () => {
    expect(isSimilar({} as SimilarityResult)).toBe(false);
  });

  it('handles boundary at exact threshold 0.4 (inclusive)', () => {
    // 0.4 exactly should be true (using >=)
    expect(isSimilar({ ...baseResult, overallMatch: 0.4 })).toBe(true);
  });

  it('handles borderline near zero', () => {
    expect(isSimilar({ ...baseResult, overallMatch: 0.0001 })).toBe(false);
  });
});
