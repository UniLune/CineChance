import { describe, it, expect } from 'vitest';
import { isSimilar } from '../similarity';

describe('isSimilar threshold (40%)', () => {
  it('returns false for match < 40%', () => {
    // Mock SimilarityResult with overallMatch 0.35
    const result = { overallMatch: 0.35, tasteSimilarity: 0.5, ratingCorrelation: 0.5, personOverlap: 0.5 };
    expect(isSimilar(result)).toBe(false);
  });

  it('returns true for match exactly 40%', () => {
    const result = { overallMatch: 0.4, tasteSimilarity: 0.5, ratingCorrelation: 0.5, personOverlap: 0.5 };
    expect(isSimilar(result)).toBe(true);
  });

  it('returns true for match > 40%', () => {
    const result = { overallMatch: 0.75, tasteSimilarity: 0.5, ratingCorrelation: 0.5, personOverlap: 0.5 };
    expect(isSimilar(result)).toBe(true);
  });

  // Edge cases
  it('returns false for overallMatch = 0', () => {
    const result = { overallMatch: 0, tasteSimilarity: 0, ratingCorrelation: 0, personOverlap: 0 };
    expect(isSimilar(result)).toBe(false);
  });

  it('returns true for overallMatch = 1.0', () => {
    const result = { overallMatch: 1.0, tasteSimilarity: 1.0, ratingCorrelation: 1.0, personOverlap: 1.0 };
    expect(isSimilar(result)).toBe(true);
  });

  it('returns false for negative overallMatch', () => {
    const result = { overallMatch: -0.1, tasteSimilarity: 0, ratingCorrelation: 0, personOverlap: 0 };
    expect(isSimilar(result)).toBe(false);
  });
});
