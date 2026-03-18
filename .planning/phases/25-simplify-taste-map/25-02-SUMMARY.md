# Plan 25-02 Summary: Remove Person Profile UI from TasteMap

## Goal
Remove actor/director person profiles from TasteMap UI and API responses. Keep DB schema unchanged. Update TwinTasters tooltip to show new weights: 60% genres + 40% movies.

## Changes Made

### 1. `src/app/profile/taste-map/page.tsx`
- Removed `PersonProfile` import and `getPersonProfile` call
- Removed `actors`, `directors`, `topActors`, `topDirectors` from Server Component data fetching
- Removed corresponding props from `TasteMapClient` usage

### 2. `src/app/profile/taste-map/TasteMapClient.tsx`
- Removed `topActors` and `topDirectors` props from interface
- Removed "Любимые актеры" (Favorite Actors) section
- Removed "Любимые режиссеры" (Favorite Directors) section
- Component now only renders genre profile, rating distribution, metrics, and behavior profile

### 3. `src/app/profile/taste-map/TwinTasters.tsx`
- Updated tooltip text to reflect new weights: **60% жанры + 40% фильмы**
- Previously: 50% movies, 30% genres, 20% persons
- Now: 60% genres, 40% movies

### 4. `src/app/api/user/taste-map-comparison/[userId]/route.ts`
- Removed `comparePersonProfiles` import and call
- Removed `personComparison` from the returned JSON
- `personOverlap` still exists in `metrics` for backward compatibility (internal calculation)

### 5. `src/app/profile/taste-map/compare/[userId]/page.tsx`
- Removed `personComparison` section from UI (was removed in plan 25-01)
- Fixed JSX syntax errors from malformed edits
- Fixed `personOverlap` property reference in `ComparisonMetrics` interface
- Section already displayed `metrics.overallMatch` directly (backend computes correct weights)

## Tests
- Acceptance tests: 5/5 pass (`.planning/phases/25-simplify-taste-map/tdd/acceptance-code-25-02.test.ts`)
- Full suite: 278/281 pass (3 pre-existing failures in unrelated TS config tests)
- Lint: Passes
- TypeScript: No errors in modified files (pre-existing errors in test files)

## Breaking Changes
- TasteMap API no longer returns `personComparison` field
- `TasteMapClient` no longer accepts `topActors`/`topDirectors` props
- Person profile data still computed internally (for overall match calculation) but not exposed via UI/API

## Verified
- API returns `metrics`, `genreProfiles`, `ratingPatterns`, `sharedMovies` — no `personComparison`
- UI renders without actor/director sections
- TwinTasters tooltip shows "60% жанры + 40% фильмы"
- Comparison page renders correctly without person comparison section
