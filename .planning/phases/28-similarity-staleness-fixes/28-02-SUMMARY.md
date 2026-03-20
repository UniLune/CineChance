# Phase 28-02: Staleness-Aware API Implementation

## Summary

Successfully implemented cache-first, staleness-aware `similar-users` API with the following features:

### Changes Made

#### 1. Storage Helper (`src/lib/taste-map/similarity-storage.ts`)
- **Added:** `getSimilarityScoresWithFreshness()` - Fetches scores and attaches `isFresh` flag based on `expiresAt`
- **Modified:** Function returns results sorted by `overallMatch` descending (ensures consistent ordering)

#### 2. API Route (`src/app/api/user/similar-users/route.ts`)
- **Removed:** `freshOnly` query parameter (no longer needed)
- **Added:** Cache-first strategy using Redis (`getSimilarUsers()`)
- **Implemented:** Staleness-aware DB fetching:
  - Fetches up to `limit * 2` scores from database
  - Splits into fresh and stale based on `expiresAt`
  - Lazy recomputation of stale pairs (sequential to avoid overload)
  - Final sorting and limiting
  - Updates Redis cache with refreshed results
- **Maintained:** On-demand fallback when no DB scores exist

### Tests

#### Unit Tests (9 total)
- `similarity-storage.28-01.test.ts` (4 tests) - TTL storage from Wave 1
- `similarity-storage.delete.test.ts` (2 tests) - Deletion function from Wave 1
- `similarity-storage.freshness.test.ts` (3 tests) - Freshness helper

#### Acceptance Tests (4 total)
- `acceptance-code-28-02.test.ts` (4 tests):
  ✅ Redis cache hit returns immediately
  ✅ Fresh DB scores used without recomputation
  ✅ Stale pairs trigger lazy recomputation
  ✅ On-demand fallback when no DB scores

**All 13 tests passing.**

### Technical Details

- **Freshness Logic:** Score is fresh if `!expiresAt || expiresAt > now`
- **Stale Recompute:** Only scores with `expiresAt` in the past are recomputed
- **Cache Refresh:** After lazy recomputation, results are stored back to Redis
- **Error Handling:** Errors during recomputation log and keep stale score as fallback
- **Performance:** Sequential lazy recompute prevents concurrent compute storms

### Verification

- ✅ `npm run lint` - Clean
- ✅ `npm run test:ci` - All tests passing (13/13)
- ✅ TypeScript compilation successful
- ✅ No regressions in existing functionality

---

## Files Modified

1. `src/lib/taste-map/similarity-storage.ts` - Added `getSimilarityScoresWithFreshness()` with sorting
2. `src/app/api/user/similar-users/route.ts` - Complete rewrite to staleness-aware pattern

---

## Next Steps (Wave 3)

- [ ] Add invalidation triggers to WatchList mutations
- [ ] Update scheduler thresholds (minWatchCount: 30→3, candidates: 20→100)
