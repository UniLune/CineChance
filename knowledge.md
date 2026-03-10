# knowledge.md
# Живая карта проекта — обновляется автоматически после каждого /gsd-research
# НЕ редактировать вручную без необходимости

## Архитектурные паттерны
- Server Components по умолчанию, 'use client' только для интерактивных компонентов
- Централизованное логирование через @/lib/logger
- Rate limiting на каждом API endpoint через middleware
- ISR кэширование TMDB (1 час)
- Upsert паттерн для Prisma операций с композитными ключами
- Background tasks через after() в API routes
- Prisma.Json type usage with explicit casting (`as unknown as T[]`) for arrays
- Map/Set iteration requires ES2015+ target (cannot downlevel to ES5 without downlevelIteration flag)
- **Modular recommendation pipeline** - Composable algorithms with fallback chain (8 patterns implementing IRecommendationAlgorithm)
- **TasteMap compute pipeline** - Scheduler computes SimilarityScore weekly; on-demand caching (24h TTL)
- **ML feedback loop** - Decision logging → outcome tracking → model correction (RecommendationDecision, PredictionOutcome, ModelCorrection)
- **Confidence scoring** - Formula: base 50 + algorithmCount*5 + adjustments (max 90), penalties for cold start (-30), heavy user sampling (-10)

## Критические файлы
- prisma/schema.prisma — 20+ моделей, композитные ключи
- src/lib/prisma.ts — singleton PrismaClient
- src/auth.ts — NextAuth конфигурация
- src/middleware/rateLimit.ts — rate limiting архитектура
- src/lib/taste-map/person-profile-v2.ts — Prisma.Json casting issues, requires strict type handling
- src/lib/taste-map/compute.ts — Map iteration (fixed by target es2017)
- src/lib/taste-map/similarity.ts — Set iteration + incomplete RatingMatchPatterns type
- src/lib/recommendation-algorithms/interface.ts — Algorithm interface; all 8 patterns depend on it
- src/lib/recommendation-algorithms.ts — Main orchestrator; merge logic and confidence scoring
- src/app/api/recommendations/[id]/action/route.ts — Outcome tracking; links RecommendationLog to PredictionOutcome
- vitest.config.ts — coverage config incompatible with Vitest 4 (moved under test namespace needed)
- src/lib/redis.ts — Redis cache wrapper (JSDoc added 2026-03-10)
- src/lib/tmdbCache.ts — TMDB in-memory cache (JSDoc added 2026-03-10)
- src/app/collection/[id]/CollectionClient.tsx — Race condition fix with AbortController (2026-02-25)
- src/app/api/recommendations/ml-stats/route.ts — Secured in Phase 16 (must keep auth check)

## Известные риски
- TypeScript: strict: false, noImplicitAny: false — потенциальные runtime errors (13 current errors, ~200 after enabling strict)
- ESLint: no-unused-vars: off, no-explicit-any: off — грязный код (194 any usages)
- next.config.ts: ignoreBuildErrors: true — скрывает реальные проблемы
- Тестовое покрытие: только 74 теста, нет интеграционных
- Смешение русского/английского в статусах ('Хочу посмотреть')
- Vitest 4: coverage config at root invalid — will cause type error after strict mode
- Prisma.Json type: Need careful casting with `as unknown as T[]` for arrays; risk of runtime shape mismatches
- Any elimination: major refactoring (~15 hours) but required for production quality
- **Race conditions в client-side fetch** — отсутствие AbortController в useEffect (2026-02-25) [FIXED in specific components; ensure pattern]
- **Null safety в API responses** — Similar users not found из-за неполной проверки схожести (2026-02-24) [FIXED]
- **Rate limit placement** — MUST place AFTER auth and cache check, not before (from .planning/debug/resolved/rate-limiting-architecture-failures.md)
- **Pagination secondary sort** — Must add `{ id: 'desc' }` secondary sort or pagination breaks (from pagination-system-failures.md)
- **Heavy user performance** — Users with 500+ items; mitigation: sampling (200 users) and weekly SimilarityScore recomputation
- **Cache staleness** — Redis TTLs (taste-map 24h, recommendations 15m) may serve outdated data; monitor freshness
- **Counter data races** — Concurrent updates to WatchList.acceptanceCount, Tag.recommendationCount may undercount; consider atomic operations
- **Redis/Upstash dependency** — Rate limiting and caching degrade gracefully if Redis unavailable; monitor env vars
- **TMDB API dependency** — Missing API key or rate limits cause failures; ISR cache and graceful degradation in place

## Зависимости и интеграции
- Frontend: Next.js 16 → React 19 → Tailwind CSS 4
- Backend: PostgreSQL (Neon) → Prisma 7.2 → NextAuth 4.24
- ML: 7 алгоритмов рекомендаций в src/lib/recommendation-algorithms/
- Кэширование: Upstash Redis + TMDB ISR
- Auth flow: User → Session → WatchList → RatingHistory → RecommendationLog
- **Algorithm pipeline**: 8 patterns (Taste Match, Want Overlap, Drop Patterns, Type Twins, Genre Twins, Genre Recommendations, Person Twins, Person Recommendations) → merge → confidence score
- **TasteMap integration**: Used by algorithms for similarity computation (SimilarityScore DB table, Redis cache)
- **Outcome tracking**: RecommendationDecision → PredictionOutcome; feeds ModelCorrection and acceptance rate metrics

## Решения и почему
- [2026-03-05] GSD + TDD интеграция — для качественного test-driven development
- Vitest выбран как test runner — нативный ESM, быстрый watch-режим
- ES2017 target:required for Map/Set iteration without downlevelIteration; also modern JS features
- Prisma.Json casting: use `as unknown as T[]` pattern for arrays; Prisma doesn't infer array types from Json
- ActorData/DirectorData: reuse PersonData from person-profile-v2.ts or create type aliases
- RatingMatchPatterns: extend with all required properties (largeDifference, avgRatingDifference, etc.)
- Collection route: capture route param in outer scope to use in catch block
- **AbortController в useEffect:** предотвращает race conditions и memory leak при переходе между страницами (2026-02-25)
- **isMounted флаг:** дополнительная защита от state updates после unmount
- **overallMatch вместо tasteSimilarity:** использует все три метрики (жанры 50%, рейтинги 30%, актеры 20%) для поиска близнецов вкуса (2026-02-24)
- **Modular algorithms:** All recommendation patterns implement IRecommendationAlgorithm for consistent execution, testing, and easy addition of new patterns
- **Confidence scoring:** Dynamic based on algorithm count, similar users found, variance, cold start status; allows UI to show recommendations with quality indication
- **Heavy user sampling:** Performance optimization for users with 500+ watched items; reduces similarity search from full pool to 200 sampled users
- **Redis cache TTLs:** 24h for taste-map (expensive compute), 15min for recommendations (freshness), 24h for similar users (cached pairwise scores)
- **Outcome tracking non-blocking:** PredictionOutcome creation failures don't block user actions (graceful degradation)
- **Algorithm timeout:** 3-second timeout prevents slow algorithms from blocking entire recommendation response
- **Weekly SimilarityScore recomputation:** Balances freshness vs performance; on-demand fallback for immediate needs

## Типы и интерфейсы
- Movie, TVShow, Person — TMDB типы (implicit any currently, to be defined)
- WatchList, RatingHistory, RecommendationLog — DB модели
- AlgorithmExperiment — A/B тесты алгоритмов
- PredictionOutcome — ML feedback loop
- PersonData (person-profile-v2.ts): { tmdbPersonId: number; name: string; count: number; avgWeightedRating: number }
- ActorData, DirectorData: alias or extend PersonData (needed for TasteMapClient)
- RatingMatchPatterns (similarity.ts): { perfectMatches, closeMatches, moderateMatches, sameCategory, differentIntensity, avgRatingUser1, avgRatingUser2, intensityMatch, pearsonCorrelation, totalSharedMovies, largeDifference, avgRatingDifference, positiveRatingsPercentage, bothRewatchedCount, overallMovieMatch }
- TMDbMovie, TMDbPerson: to be defined for external API typing
- RecommendationContext, RecommendationSession, RecommendationItem: from recommendation-algorithms/types.ts
- **FiltersSnapshot** - Copy of filter state when recommendation shown (for later analysis)
- **CandidatePoolMetrics** - Stage-by-stage filtering counts (initial, after type filter, after cooldown, after additional filters)
- **TemporalContext** - Time-of-day, day-of-week, session timing for ML features
- **MLFeatures** - Model input features (similarity, novelty, diversity, predicted acceptance)
- **UserRecommendationStats** - Aggregated acceptance rates, time-to-action, streaks
- **ConfidenceScore** - 0-100 with factors (algorithmCount, similarUsersFound, variance, coldStart, heavyUser)

## История фаз
- v3.0: Интеграция GSD + TDD с модельной стратификацией
- v3.1: Добавлена живая карта проекта knowledge.md
- v3.3: Переход на структуру .planning/, обновлены агенты и протокол
- **Phase 21 Research**: Codebase analysis completed; identified 8 modular algorithms, TasteMap pipeline, ML feedback loop, rate limiting architecture, critical files, and risks. Created RESEARCH.md with full integration guide.
- **Phase 21 (Serial Numbers)**: Added plan for serial numbers on movie cards. Integration points: MovieCard.tsx (add index prop), FilmGridWithFilters.tsx (pass index). No API changes needed.
