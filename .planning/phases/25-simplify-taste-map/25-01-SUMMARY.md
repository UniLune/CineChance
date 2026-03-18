# 25-01 Summary

## Goal
Update taste map similarity calculation to simplify weights:
- Remove person/director overlap from similarity
- Change weights to 60% genres + 40% movies (previously 50% movies + 30% genres + 20% persons)

## Changes Made

### Files Modified
- `src/lib/taste-map/similarity.ts`
- `src/lib/taste-map/similarity-storage.ts`

### Key Updates
1. **similarity.ts**
   - WEIGHTS changed from `{ genres: 0.3, movies: 0.5, persons: 0.2 }` to `{ tasteSimilarity: 0.6, ratingCorrelation: 0.4 }`
   - `computeOverallMatch`: removed `personOverlap` from calculation; now only uses `tasteSimilarity` and `ratingCorrelation`
   - Normalization of `ratingCorrelation` from [-1,1] to [0,1] preserved via `(ratingCorrelation + 1) / 2`
   - Removed unused constants (`isReversed`, `DROPPED_STATUS_ID`, `SIMILARITY_THRESHOLD`) to satisfy lint

2. **similarity-storage.ts**
   - `generateTasteMapSnapshot`: removed `personProfiles` field from snapshot data structure
   - All code generation for person profiles removed

## Testing
- Acceptance tests created and passing (17 tests)
- All existing tests updated to reflect new weights
- Floating-point comparisons use `.toBeCloseTo()` to handle precision

## Database
- Schema unchanged: `PersonProfile` and `MoviePersonCache` tables remain intact
- Data migration not required for weight change; new calculations apply on next snapshot generation

## Notes
- Person profile UI removal is deferred to Plan 25-02
- Weight change may affect existing taste map comparisons; users will see updated similarity scores gradually as snapshots refresh
