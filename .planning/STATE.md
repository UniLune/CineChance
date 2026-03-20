# State: CineChance v2.0

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-17)

**Core value:** Personal movie tracking with intelligent recommendations
**Current focus:** Phase 25 (Simplify TasteMap) - Remove chart visualizations

## Current Status

- **Phase:** 25 (Simplify TasteMap)
- **Current Plan:** 25-03 (remove chart visualizations)
- **Goal:** Simplify TasteMap page — remove persons, update weights, remove chart visualizations

## Progress

| Phase | Name | Status | Requirements |
|-------|------|--------|--------------|
| 1-8 | v1.0 Stabilization | ● Complete | 10 |
| 9 | ML Database Schema | ● Complete | 0 |
| 10 | Taste Map Infrastructure | ● Complete | 0 |
| 11 | Core Patterns | ● Complete | 0 |
| 12 | Advanced Patterns | ● Complete | 0 |
| 13 | Recommendation API | ● Complete | 3 |
| 14 | UI Integration | ● Complete | 0 |
| 15 | ML Feedback Loop | ● Complete | 1 |
| 16 | ML Stats Security | ● Complete | 0 |
| 17 | Outcome Tracking | ● Complete | 0 |
| 18 | Карта вкуса | ● Complete | 0 |
| 19 | Testing Foundation | ● Complete | 0 |
| 20 | Strict TypeScript | ● Complete | QUAL-01, QUAL-02, QUAL-03 |
| 23 | Profile Creators Page Fix | ● Complete | 0 |
| 24 | Taste Map DB Read Fix | ● Complete | DATA-01 |
| 25 | Simplify TasteMap | ⏳ Planned | - |
| 26 | Genre Profile Diversity Fix | ⏳ Planned | DIV-01 |
| 27 | Taste Twins Validation | ⏳ Planned | VALID-01, VALID-02, VALID-03 |

---

## v2.0 Recommendations Overview

**Requirements:** [ML-01, ML-02, ML-03, ML-04, ML-05]

| Phase | Name | Goal |
|-------|------|------|
| 9 | ML Database Schema | Add 4 new tables for ML feedback loop |
| 10 | Taste Map Infrastructure | TasteMap + Redis + Similarity calculation |
| 11 | Core Patterns | Implement Patterns 1-4 |
| 12 | Advanced Patterns | Implement Patterns 5-8 |
| 13 | Recommendation API | API + Cold Start + Heavy Users |
| 14 | UI Integration | Main page + Admin dashboard |
| 15 | ML Feedback Loop | Decision logging + outcome tracking |

## Accumulated Context

### Roadmap Evolution
- Phase 7 added: Admin user statistics
- Phase 8 added: Admin panel UI improvements
- Phase 15 added: ML outcome tracking and algorithm performance metrics
- Phase 18 added: Карта вкуса (Taste Map)
- Phase 19 added: Testing Foundation (increase test coverage to 80%+)

### Key Decisions (Phase 9)
- ModelTraining is global (no userId) - tracks model versions, not per-user data
- ModelCorrection has optional userId for global or user-specific corrections

### Key Decisions (Phase 11)
- IRecommendationAlgorithm interface with name, minUserHistory, execute() for modular algorithms
- Taste Match threshold: 0.7 (high quality), Want Overlap: 0.6 (broader coverage)
- Drop Patterns threshold: 0.65 (slightly lower for broader coverage)
- Type Twins threshold: 0.7 (Jaccard-like similarity on type vectors)
- Score weights: Taste Match (0.5/0.3/0.2), Want Overlap (0.4/0.4/0.2), Type Twins (0.5/0.3/0.2)
- Drop penalty: capped at 70%, baseScore * (1 - dropPenalty)
- Cold start thresholds: 10 (Taste Match), 5 (Want Overlap), 8 (Drop Patterns), 3 (Type Twins)
- Type twin sampling: 100 active users for performance
- Algorithms return results, API endpoint handles RecommendationLog entries
- Score normalization to 0-100 range via normalizeScores() helper

### Key Decisions (Phase 13)
- Redis caching: 15-minute TTL, cache key `recs:{userId}:patterns:v1`
- Timeout: 3 seconds per algorithm using AbortController
- Cold start threshold: 10 watched items
- X-Cache headers: HIT/MISS for cache status
- Heavy user threshold: 500 items with 200 sample size
- Confidence scoring formula: base 50 + algorithmCount*5 (max 90), adjustments for similar users (+10), variance (-20), cold start (-30), heavy user sampling (-10)
- algorithmsStatus tracks per-algorithm success/failure with error messages
- Heavy user sampling: sampleSize passed to algorithms for query optimization

### Key Decisions (Phase 15)
- Used existing RecommendationEvent model for outcome tracking
- Tracked three action types: added, rated, ignored
- Outcome tracking failures don't block user actions (graceful degradation)
- Separated tracking logic into reusable module for future phases
- Calculated acceptance rate as percentage of recommendations user acted on
- Added time-based statistics (7-day, 30-day, overall)

### Key Decisions (Phase 16)
- Added session authentication check to ml-stats endpoint
- Endpoint returns 401 Unauthorized for unauthenticated requests

### Key Decisions (Phase 18)
- Taste Map API uses 24h Redis caching
- Profile page links to /profile/taste-map
- Recharts used for visualizations (BarChart, PieChart)
- Computed metrics: positiveIntensity, negativeIntensity, consistency, diversity
- Behavior profile: rewatchRate, dropRate, completionRate
- Person profiles (actors/directors) use Redis caching

### Phase 20 Notes
- All configuration files already met strict standards before execution.
- Fixed collection route catch block: use `collectionId` instead of `id` for proper scoping.
- RatingMatchPatterns objects already include all required metrics.
- Person-profile JSON casting already safe using `as unknown as PersonData[]`.

- **20-01:** Completed (~15 min) - Enabled strict TypeScript, verified production-grade linting, fixed collection route scoping. Prepared for systematic any elimination.
- **20-02:** Completed (1 hour) - Eliminated all 180 `any` types across 50+ files. Achieved zero `any` count, clean TypeScript compilation, and passing ESLint. Created comprehensive TMDB type definitions and unified type patterns. Fixed complex ActorEntry reconstruction, duplicate AdditionalFilters types, and BatchData typing issues.
- **20-03:** Completed (3 min) - Final verification: TypeScript compiles with zero errors (npx tsc --noEmit passes), ESLint passes with zero warnings, production build succeeds (68 pages), all 167 tests pass, manual smoke testing confirms pages and APIs work correctly.

### Phase 24 Notes
- **Problem**: TasteMapClient fetched actors/directors from `/api/user/person-profile` (could recompute if stale), while actors/creators pages write to `PersonProfile` table but display different data from legacy APIs.
- **Solution**: Server-side read from `PersonProfile` directly in `page.tsx`, pass as props to client. No client-side fetching, no TMDB calls.
- **Result**: Data consistency achieved across all profile pages. Actors/directors on taste-map now exactly match stored DB values.
- **Performance**: Reduced 2 API calls per page load, eliminated client-side loading states.

- **24-01:** Completed (45 min) - Modified `page.tsx` to read PersonProfile via Prisma, updated `TasteMapClient` to accept props, removed useEffect hooks, added unit and integration tests, verified lint and test suite.
