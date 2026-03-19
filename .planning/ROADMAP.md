# Roadmap: CineChance

**Created:** 2026-02-17
**Mode:** YOLO (Auto-approve)

## Milestones

- ✅ **v1.0 Stabilization** — Phases 1-8 (shipped 2026-02-21)
- ✅ **v2.0 Recommendations** — Phases 9-15 (last phase!)
  - User-to-user recommendations based on Taste Map
  - 8 pattern matching algorithms
  - ML feedback loop (Phase 15 pending)

---

## Phase 1: Tests & Logging — SHIPPED

**Status:** ✅ Complete (2026-02-17)

**Plans:** 1 plan
- [x] 01-01-PLAN.md — Add tests and logging infrastructure

---

## Phase 2: Error Handling — SHIPPED

**Status:** ✅ Complete (2026-02-17)

**Plans:** 2 plans
- [x] 02-01-PLAN.md — Add error boundaries
- [x] 02-02-PLAN.md — Add custom error pages

---

## Phase 3: Lint Cleanup — COMPLETED

**Status:** ✅ Complete (2026-02-20)

**Plans:** 5 plans

- [x] 03-01-PLAN.md — Исправить 629 ошибок lint (частично: console.log → logger)
- [x] 03-02-PLAN.md — Gap closure: исправить оставшиеся 439 errors
- [x] 03-03-PLAN.md — Gap closure: исправить оставшиеся 408 errors
- [x] 03-04-PLAN.md — Gap closure: удалить eslint-disable, исправить типы (239→182 errors)
- [x] 03-05-PLAN.md — Gap closure: финальное исправление 182 errors (unused-vars)

---

## Phase 4: Animation Filter — COMPLETED

**Status:** ✅ Complete (2026-02-19)

**Requirements:** [ANIM-01]

**Plans:** 1 plan
- [x] 04-01-PLAN.md — Add "Мульт" filter button to Recommendations page

---

## Phase 5: Recommendation Filters Enhancement — COMPLETED

**Status:** ✅ Complete (2026-02-19)

**Requirements:** [FILTER-01, FILTER-02]

**Plans:** 1 plan
- [x] 05-01-PLAN.md — Rename Мульт→Мульты, add content type filters to Settings

---

## Phase 6: Stats Page Enhancement — COMPLETED

**Status:** ✅ Complete (2026-02-20)

**Requirements:** None

**Plans:** 1 plan
- [x] 06-01-PLAN.md — 4 плашки с типами контента (Фильмы, Сериалы, Аниме, Мульты)

---

## After Stabilization

When all phases are complete and confident — can plan:
- Performance optimization
- New functionality

### Phase 7: Admin user statistics

**Goal:** Admin functionality for user statistics management
**Depends on:** Phase 6
**Plans:** 3 plans

Plans:
- [ ] 07-01-PLAN.md — Пагинация списка пользователей
- [ ] 07-02-PLAN.md — Фильтрация и сортировка по колонкам
- [ ] 07-03-PLAN.md — Страница статистики пользователя (как profile/stats)

### Phase 8: Admin panel UI improvements

**Goal:** Redesign admin panel UI - sidebar, user table, stats
**Depends on:** Phase 7
**Plans:** 1 plan

Plans:
- [ ] 08-01-PLAN.md — UI improvements for admin panel

---

## v2.0: User-to-User Recommendations

**Goal:** Рекомендации фильмов пользователям на основе Карты вкусов (Taste Map)

### Phase 9: ML Database Schema — COMPLETE

**Goal:** Добавить таблицы для ML feedback loop в Prisma schema
**Depends on:** Phase 8
**Status:** ✅ Complete (2026-02-22)
**Plans:** 1 plan

Plans:
- [x] 09-01-PLAN.md — Add ML tables: RecommendationDecision, PredictionOutcome, ModelCorrection, ModelTraining

---

### Phase 10: Taste Map Infrastructure

**Goal:** Создать инфраструктуру для вычисления и хранения Taste Map
**Depends on:** Phase 9
**Plans:** 3/3 plans complete

Plans:
- [x] 10-01-PLAN.md — TasteMap структура данных и Redis хранение
- [x] 10-02-PLAN.md — Similarity calculation (поиск похожих пользователей)

---

### Phase 11: Core Recommendation Patterns

**Goal:** Реализовать базовые паттерны рекомендаций (1-4)
**Depends on:** Phase 10
**Plans:** 2/2 plans complete

Plans:
- [x] 11-01-PLAN.md — Patterns 1-2: Taste Match, Want-to-watch Overlap
- [x] 11-02-PLAN.md — Patterns 3-4: Drop Patterns, Type Twins

---

### Phase 12: Advanced Recommendation Patterns

**Goal:** Реализовать продвинутые паттерны рекомендаций (5-8)
**Depends on:** Phase 11
**Plans:** 2/2 plans complete

Plans:
- [x] 12-01-PLAN.md — Patterns 5-6: Genre Twins, Genre Recommendations
- [x] 12-02-PLAN.md — Patterns 7-8: Person Twins, Person Recommendations

---

### Phase 13: Recommendation API

**Goal:** Создать API для получения рекомендаций с обработкой Edge Cases
**Depends on:** Phase 12
**Status:** ✅ Complete (2026-02-23)
**Plans:** 3/3 plans complete

Plans:
- [x] 13-01-PLAN.md — Redis caching, timeout protection, cold start metadata
- [x] 13-02-PLAN.md — Heavy Users handling, Graceful Degradation, Confidence Scoring
- [x] 13-03-PLAN.md — Heavy user sampling implementation (gap closure)

---

### Phase 14: UI Integration

**Goal:** Интегрировать рекомендации в UI
**Depends on:** Phase 13
**Status:** ✅ Complete (2026-02-23)
**Plans:** 2/2 plans complete

Plans:
- [x] 14-01-PLAN.md — Main page: Top-12 recommendations horizontal scroll
- [x] 14-02-PLAN.md — Admin ML Dashboard: discrepancy monitoring, model corrections

---

### Phase 15: ML Feedback Loop

**Goal:** Замкнуть цикл: логирование решений → отслеживание исходов → коррекция модели
**Depends on:** Phase 14
**Plans:** 2/2 plans complete

Plans:
- [x] 15-01-PLAN.md — Decision logging, outcome tracking, auto-corrections
- [x] 15-02-PLAN.md — Gap closure: fix trackOutcome import and ML stats format

---

### Phase 16: ML Stats API Security — GAP CLOSURE

**Goal:** Add authentication to unprotected ML stats API
**Depends on:** Phase 15
**Gap Closure:** Closes critical security issue from audit

Plans:
- [x] 16-01-PLAN.md — Add session check to /api/recommendations/ml-stats

---

### Phase 17: Outcome Tracking Completeness — GAP CLOSURE

**Goal:** Enable outcome tracking from main page recommendations
**Depends on:** Phase 16
**Gap Closure:** Closes integration and flow gaps from audit

Plans:
- [ ] 17-01-PLAN.md — Capture recommendationLogId in RecommendationsGrid, pass to watchlist API

### Phase 18: Карта вкуса (Taste Map)

**Goal:** Создать карту вкуса пользователя с визуализацией предпочтений
**Depends on:** Phase 17
**Status:** ✅ Planned
**Plans:** 2/2 plans complete

Plans:
- [ ] 18-01-PLAN.md — API endpoint + Profile card
- [ ] 18-02-PLAN.md — Taste Map page with visualizations

### Phase 19: Testing Foundation: Increase test coverage to 80%+

**Goal:** Increase test coverage from ~10% to 80%+ for critical modules
**Depends on:** Phase 18
**Status:** ✅ Planned
**Plans:** 3/3 plans

Plans:
- [x] 19-01-PLAN.md — Configure testing infrastructure with coverage thresholds
- [x] 19-02-PLAN.md — Test recommendation algorithms (85%+ coverage)
- [x] 19-03-PLAN.md — Test taste-map compute and logger utilities

---

### Phase 20: Strict TypeScript Mode & Production Linting

**Goal:** Enable strict TypeScript mode and production-grade ESLint/Next.js configuration to achieve zero type errors and successful production builds.
**Depends on:** Phase 19
**Status:** ⏳ Pending planning
**Plans:** 0/3 plans

Plans:
- [ ] 20-01-PLAN.md — Configuration updates and quick fixes
- [ ] 20-02-PLAN.md — Systematic any and unused variable elimination
- [ ] 20-03-PLAN.md — Final verification and smoke testing

---

### Phase 21: Order Numbers for Count Verification

**Goal:** Add order numbers (1, 2, 3...) to each movie card in "Мои фильмы" (My Movies) page, visible in all tabs. Purpose: Allow users to verify total count of loaded results.

**Requirements:** [SERIAL-01]

**Status:** ✅ Planned

**Plans:** 1/1 plans

Plans:
- [x] 21-01-PLAN.md — Add index prop to MovieCard and pass it from FilmGridWithFilters

---

### Phase 22: My Movies UI Fixes

**Goal:** Add scroll-to-top button to My Movies page (consistent with Search page pattern) and hide serial order numbers on movie cards while preserving ability to restore them later (non-destructive hiding via `showIndex` prop).

**Requirements:** [UI-01]

**Status:** ⏳ Planned

**Plans:** 0/2 plans

Plans:
- [ ] 22-01-PLAN.md — Add scroll-to-top button and hide order numbers on My Movies page
- [ ] 22-02-PLAN.md — [Optional] Test verification and edge cases

---

### Phase 23: Profile Creators Page Fix

**Goal:** Fix /profile/creators page to match /profile/actors behavior. The logic should be identical between both pages.

**Status:** ✅ Planned

**Plans:** 2/2 plans

Plans:
- [x] 23-01-PLAN.md — Fix API sorting (use creator_score) and TypeScript any types
- [x] 23-02-PLAN.md — Fix Client Component parity (logger, type assertion, CineChance logo)

---

### Phase 24: Taste Map DB Read Fix — COMPLETE

**Goal:** Ensure taste-map reads actors/directors from PersonProfile DB table (not from TMDB)
**Depends on:** Phase 23
**Status:** ✅ Complete (2026-03-18)
**Plans:** 1/1 plan

Plans:
- [x] 24-01-PLAN.md — Server-side PersonProfile read with DB consistency

---

### Phase 25: Simplify TasteMap — PLANNED

**Goal:** Simplify TasteMap page — remove persons, update similarity weights, remove chart visualizations
**Depends on:** Phase 24

**User Decisions:**
- Remove persons from UI and calculations (keep DB schema intact)
- Update weights: 40% movies + 60% genres (was 50/30/20)
- Remove genre bar chart and rating pie chart from taste-map page (keep summary stats, metrics, behavior profile)

Plans:
- [x] 25-01-PLAN.md — Update similarity weights and storage
- [x] 25-02-PLAN.md — Remove person UI from taste map pages
- [ ] 25-03-PLAN.md — Remove chart visualizations (genres bar chart, rating pie chart)

---

### Phase 26: Genre Profile Diversity Fix — PLANNED

**Goal:** Correct the "Diversity" metric in TasteMap profile metrics to show percentage of unique TMDB genres (out of 19) that the user has watched, instead of incorrectly filtering by rating threshold.
**Depends on:** Phase 25

**Requirements:** [DIV-01]

Plans:
- [ ] 26-01-PLAN.md — Fix diversity calculation in computeMetrics and update tests

---

### Phase 27: Genre Stats Display — PLANNED

**Goal:** Add "Ваши жанры" block to TasteMap page showing horizontal bars for each TMDB genre with movie count and average rating.
**Depends on:** Phase 26

**Requirements:** [UI-02]

Plans:
- [ ] 27-01-PLAN.md — Add genreCounts computation and UI display

---

_For current project status, see .planning/PROJECT.md_
