# Research: Genre Profile Frequency - Fix Diversity Metric

## Executive Summary

**Goal**: Fix the "Diversity" metric in TasteMap "Profile Metrics" block to correctly show the percentage of unique genres from total TMDB genres.

**Current State**: 
- Diversity metric uses threshold filter `v > 20` to count "preferred" genres
- This is incorrect - it filters by rating value, not by presence

**Proposed Change**:
- Diversity = (unique genre count / 19 TMDB genres) * 100%
- No changes to `computeGenreProfile()` - only update `computeMetrics()`

## TMDB Genre Count

TMDB has **19 official movie genres**:
- Action, Adventure, Animation, Comedy, Crime, Documentary, Drama, 
- Family, Fantasy, History, Horror, Music, Mystery, Romance, 
- Science Fiction, TV Movie, Thriller, War, Western

(16 additional anime genres exist but are separate category)

## Current Logic vs Required Logic

### Current (INCORRECT)
```typescript
// computeMetrics() - line 274-276 in compute.ts
const genreCount = Object.values(genreProfile).filter(v => v > 20).length;
const diversity = Math.min(100, genreCount * 5);
```
- Filters genres by rating > 20
- Multiplies count by 5 (cap at 100)
- Incorrect: uses rating threshold, not unique count

### New (CORRECT)
```typescript
// computeMetrics() - updated logic
const genreCount = Object.keys(genreProfile).length;
const diversity = Math.round((genreCount / 19) * 100);
```
- Counts all unique genres
- Calculates percentage from 19 TMDB genres
- Caps at 100%

## Impact Analysis

### Files to Modify
1. `src/lib/taste-map/compute.ts` - update `computeMetrics()` function (2-3 lines)

### Files NOT to Modify (no impact)
- `computeGenreProfile()` - unchanged, still returns average ratings
- `similarity.ts` - uses genreProfile for similarity, unchanged
- `genre-recommendations.ts` - uses genreProfile for recommendations, unchanged
- `want-overlap.ts` - uses genreProfile, unchanged
- `comparison page` - displays genreProfile as ratings, unchanged
- `TasteMapClient.tsx` - displays computedMetrics.diversity, no changes needed
- All tests - minimal updates needed for diversity calculation

### Why Other Systems Are Unaffected
- `genreProfile` still stores average ratings per genre (0-100 scale)
- Only the **diversity calculation** uses genre count, not ratings
- Other systems use `genreProfile` values directly (ratings), not diversity

## Test Updates Required

### `src/lib/__tests__/taste-map/compute.test.ts`
```typescript
// Current test (lines 282-286):
it('computes diversity based on genres with weight > 20', () => {
  const genreProfile = { Action: 50, Drama: 10, Comedy: 30, Thriller: 5 };
  const result = computeMetrics(genreProfile, { high: 0, medium: 100, low: 0 });
  expect(result.diversity).toBe(10); // 2 genres > 20, 2 * 5 = 10
});

// New test:
it('computes diversity as percentage of unique genres', () => {
  const genreProfile = { Action: 50, Drama: 10, Comedy: 30, Thriller: 5 };
  const result = computeMetrics(genreProfile, { high: 0, medium: 100, low: 0 });
  expect(result.diversity).toBe(21); // 4 unique genres / 19 * 100 = 21
});
```

## Verification Checklist

- [ ] `computeMetrics()` correctly counts unique genres
- [ ] Diversity = (uniqueCount / 19) * 100
- [ ] Diversity displays correctly in TasteMapClient UI
- [ ] All existing tests pass after update
- [ ] No impact on similarity calculations
- [ ] No impact on recommendation algorithms