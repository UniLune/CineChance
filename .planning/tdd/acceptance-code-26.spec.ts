// Acceptance Code: Phase 26 - Diversity Metrics
// Tests for computeMetrics diversity calculation

import { describe, it, expect } from 'vitest';
import { computeMetrics } from '@/lib/taste-map/compute';
import type { GenreProfile, RatingDistribution } from '@/lib/taste-map/types';

describe('computeMetrics - diversity calculation', () => {
  const baseRatingDist: RatingDistribution = { high: 0, medium: 0, low: 0 };

  it('4 genres → 21% diversity', () => {
    const genreProfile: GenreProfile = {
      Action: 50,
      Drama: 50,
      Comedy: 50,
      Thriller: 50,
    };
    const result = computeMetrics(genreProfile, baseRatingDist);
    expect(result.diversity).toBe(21);
  });

  it('19 genres → 100% diversity', () => {
    const genreProfile: GenreProfile = {
      Action: 50,
      Adventure: 50,
      Animation: 50,
      Comedy: 50,
      Crime: 50,
      Documentary: 50,
      Drama: 50,
      Family: 50,
      Fantasy: 50,
      History: 50,
      Horror: 50,
      Music: 50,
      Mystery: 50,
      Romance: 50,
      'Science Fiction': 50,
      'TV Movie': 50,
      Thriller: 50,
      War: 50,
      Western: 50,
    };
    const result = computeMetrics(genreProfile, baseRatingDist);
    expect(result.diversity).toBe(100);
  });

  it('0 genres → 0% diversity', () => {
    const genreProfile: GenreProfile = {};
    const result = computeMetrics(genreProfile, baseRatingDist);
    expect(result.diversity).toBe(0);
  });

  it('No rating threshold filtering: all keys counted regardless of value', () => {
    // Only Action has value >20, others <=20 (if threshold exists)
    const genreProfile: GenreProfile = {
      Action: 25,
      Drama: 15,
      Comedy: 10,
      Thriller: 5,
    };
    const result = computeMetrics(genreProfile, baseRatingDist);
    // Should count all 4 keys, giving expected diversity of 21%
    expect(result.diversity).toBe(21);
  });

  it('Edge: 1 genre → 5% diversity', () => {
    const genreProfile: GenreProfile = { Action: 50 };
    const result = computeMetrics(genreProfile, baseRatingDist);
    expect(result.diversity).toBe(5);
  });

  it('Edge: 10 genres → 53% diversity', () => {
    const genreProfile: GenreProfile = {
      Action: 50,
      Adventure: 50,
      Animation: 50,
      Comedy: 50,
      Crime: 50,
      Documentary: 50,
      Drama: 50,
      Family: 50,
      Fantasy: 50,
      History: 50,
    };
    const result = computeMetrics(genreProfile, baseRatingDist);
    expect(result.diversity).toBe(53);
  });

  it('Edge: 5 genres → 26% diversity', () => {
    const genreProfile: GenreProfile = {
      Action: 50,
      Adventure: 50,
      Animation: 50,
      Comedy: 50,
      Crime: 50,
    };
    const result = computeMetrics(genreProfile, baseRatingDist);
    expect(result.diversity).toBe(26);
  });
});
