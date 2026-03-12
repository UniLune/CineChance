# Unit Spec: Creator Score Calculation and API Sorting

## Target File: `src/app/api/user/achiev_creators/route.ts`

### Function: `_calculateCreatorScore`

**Type Signature:**
```typescript
function _calculateCreatorScore(creator: {
  average_rating: number | null;
  watched_movies: number;
  rewatched_movies: number;
  dropped_movies: number;
  total_movies: number;
  progress_percent: number;
}): number
```

**Expected Behavior:**
Calculate a composite score for a creator based on:
- Quality bonus: `average_rating + (rewatched_movies * 0.2) - (dropped_movies * 0.3)`, capped at 0-10
- Progress bonus: `log(total_movies + 1) * (progress_percent / 100)`
- Volume bonus: `log(total_movies + 1) / log(200)`
- Watched count bonus: `log(watched_movies + 1) / log(50)`
- Final score: `(qualityBonus * 0.35) + (progressBonus * 0.25) + (volumeBonus * 0.15) + (watchedCountBonus * 0.15)`

**Edge Cases:**
- If `average_rating` is null, treat as 0 for quality bonus calculation
- If `total_movies` is 0, progress and volume bonuses = 0
- If `watched_movies` is 0, watched count bonus = 0
- All bonuses should be clamped to reasonable ranges (0-10 for quality, non-negative for others)

### Function: Sorting Logic (singleLoad mode)

**Location:** Inside `fetchCreators()`, after `allCreatorsWithFullData` is populated

**Expected Behavior:**
1. Calculate `creator_score` for each creator BEFORE sorting (using `_calculateCreatorScore`)
2. Sort by `creator_score` descending
3. Tie-breakers (in order):
   - `average_rating` descending (nulls last)
   - `progress_percent` descending
   - `name` ascending (Russian locale: `localeCompare('ru')`)

**Implementation Pattern:**
```typescript
const creatorsWithScores = allCreatorsWithFullData.map(creator => ({
  ...creator,
  creator_score: _calculateCreatorScore(creator),
}));

creatorsWithScores.sort((a, b) => {
  // Primary: score
  if (b.creator_score !== a.creator_score) {
    return b.creator_score - a.creator_score;
  }
  // Tie-breaker 1: average_rating
  if (a.average_rating !== null && b.average_rating !== null) {
    if (b.average_rating !== a.average_rating) {
      return b.average_rating - a.average_rating;
    }
  } else if (a.average_rating === null && b.average_rating !== null) {
    return 1; // nulls last
  } else if (a.average_rating !== null && b.average_rating === null) {
    return -1;
  }
  // Tie-breaker 2: progress_percent
  if (b.progress_percent !== a.progress_percent) {
    return b.progress_percent - a.progress_percent;
  }
  // Tie-breaker 3: name
  return a.name.localeCompare(b.name, 'ru');
});
```

### Function: Sorting Logic (paginated mode)

**Location:** Inside `fetchCreators()`, after `baseCreatorsData` is populated

**Expected Behavior:**
Same as singleLoad mode but applied to `baseCreatorsData` (which doesn't have `creator_score` yet).

**Important:** Must calculate `creator_score` before sorting, even though we only return paginated slice.

**Implementation:** Apply same sorting logic to `baseCreatorsData` after adding `creator_score` field.

### Type Safety: Fix `any` types

**Line 463:** `filteredCrewDetails`
- **Current:** `any[]`
- **Required:** Define `interface FilteredCrewDetail` with proper structure:
  - `movie`: object with `id`, `title`, `release_date?`, `first_air_date?`, `job`, `department`, `media_type?`
  - `mediaType`: `'movie' | 'tv'`
  - `isAnime`: `boolean`
  - `isCartoon`: `boolean`
  - `fetchSuccess`: `boolean`

**Line 648:** `creator: any` in map
- **Current:** `any`
- **Required:** Define `interface CreatorData` with all expected properties including `creator_score`

### Type Assertions

**On API response (in CreatorsClient):**
- Add `as { creators: CreatorAchievement[] }` after `response.json()`

## Non-Functional Requirements

- No `any` types should remain in the file after implementation
- TypeScript compilation should pass with zero errors
- Sorting should be stable and deterministic

## Reference Implementation

See `src/app/api/user/achiev_actors/route.ts` lines 513-543 for the correct pattern (actor_score calculation and sorting).
