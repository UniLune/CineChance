# State: CineChance v2.0

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-17)

**Core value:** Personal movie tracking with intelligent recommendations
**Current focus:** Phase 19: Testing Foundation

## Current Status

- **Phase:** 19 (Testing Foundation)
- **Current Plan:** 02 (completed)
- **Goal:** Increase test coverage to 80%+

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
| 19 | Testing Foundation | ○ In Progress | 0 |

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















- **15-01:** Completed (25 min) - Outcome tracking module with trackOutcome(), calculateAcceptanceRate(), getAlgorithmPerformance(), outcome tracking integration in my-movies API, ML stats endpoint with outcome metrics
- **16-01:** Completed (2 min) - Added authentication check to ml-stats endpoint, returns 401 for unauthenticated requests
- **17-01:** Completed (5 min) - Outcome tracking for home page recommendations via logId passing through localStorage
- **14-02:** Completed (5 min) - ML Dashboard component integrated into admin monitoring page with algorithm performance, user segments, and prediction discrepancy metrics
- **14-01:** Completed (5 min) - RecommendationsGrid component integrated into main page with horizontal scroll, cold start messaging, and confidence scoring
- **18-01:** Completed (6 min) - Taste Map API endpoint with 24h Redis caching and profile page card linking to /profile/taste-map
- **18-02:** Completed (~30 min) - Taste Map page with Recharts visualizations (genre bar chart, rating pie chart, actors/directors chips, computed metrics)
- **19-01:** Completed (25 min) - Testing infrastructure with Vitest coverage thresholds
- **19-02:** Completed (~10 min) - Added edge case tests for recommendation algorithms, achieved 85%+ coverage on all 4 algorithms

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

## 
