/**
 * TasteMap Library Index
 * 
 * Re-exports main functions for easier importing.
 */

export * from './types';
export { getTasteMap, storeTasteMap, getGenreProfile, getPersonProfile, getTypeProfile, invalidateTasteMap, TTL_24H } from './redis';
export { computeTasteMap, computeGenreProfile, computePersonProfile, computeTypeProfile, computeRatingDistribution, computeAverageRating, computeBehaviorProfile, computeMetrics, getCachedGenreProfile, getCachedPersonProfile } from './compute';
export * from './similarity';
