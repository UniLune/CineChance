# Research: Similarity Algorithm — Staleness & Cold-Start Fixes (Phase 28)

> Phase 28 goal: Fix similarity algorithm staleness and cold-start issues.  
> Requirements: [SIM-01, SIM-02, SIM-03]

**Проблемы, которые решает:**
- A. Новые пользователи не попадают в кеш → медленный cold-start
- B. Изменение оценок не инвалидирует кеш → stale similarity scores
- C. SimilarityScore в БД без TTL → данные устаревают навсегда

**Решение:** 
- Добавить `expiresAt` в SimilarityScore (TTL 7 дней)
- Инвалидация при изменении WatchList (Redis + DB delete)
- Staleness-first чтение с lazy recompute для протухших пар
- Redis cache hit для similar-users API
- Понизить порог активации планировщика (30 → 3)

---

## Точки интеграции

### Файлы для модификации

| # | Файл | Изменения |
|---|------|-----------|
| 1 | `src/lib/taste-map/similarity-storage.ts` | Добавить `SIMILARITY_TTL_HOURS = 168`, установку `expiresAt` в `computeAndStoreSimilarityScore()`, новую функцию `deleteSimilarityScoresByUser()` |
| 2 | `src/app/api/user/similar-users/route.ts` | Полностью переписать логику: cache-first (Redis), staleness-first (DB), lazy per-pair recompute, удалить `freshOnly`, добавить `storeSimilarUsers()` после вычислений |
| 3 | `src/lib/tasks/computeSimilarityScores.ts` | Снизить `minWatchCount` с 30 до 3, увеличить `candidates` limit с 20 до 100 |
| 4 | `src/app/api/watchlist/route.ts` | Добавить вызовы `invalidateTasteMap()` + `deleteSimilarityScoresByUser()` после успешных mutation (POST, DELETE) |
| 5 | `src/app/actions/watchListActions.ts` | Добавить те же вызовы инвалидации после successful upsert/delete |
| 6 | `src/app/api/my-movies/route.ts` | Добавить те же вызовы инвалидации в блоке `updateWatchStatus` (после создания/обновления записи) |

### Зависимости между задачами

- **Задача 1** (storage) → требуется для **2,4,5,6**
- **Задача 2** (similar-users API) → требует **1**
- **Задачи 4-6** (invalidation) → требуют **1**
- **Задача 3** (scheduler) → независимая, но желательно после **1**

Рекомендуемый порядок: 1 → 2 → 3 → 4-6 (параллельно).

---

## Существующие типы для переиспользования

- `SimilarityResult` (src/lib/taste-map/similarity.ts)
- `MIN_MATCH_THRESHOLD = 0.4` (similarity.ts)
- `MIN_COMPLETED_WATCH_COUNT = 3` (similar-users/route.ts)
- `COMPLETED_STATUS_IDS` (src/lib/movieStatusConstants)
- `invalidateTasteMap()` уже существует в `src/lib/taste-map/redis.ts` и реэкспортируется в `index.ts`
- `getSimilarUsers`, `storeSimilarUsers` — уже существуют, но `storeSimilarUsers` вызывается только внутри `findSimilarUsers` (не используется). Будем вызывать напрямую.

---

## Новые функции для создания

В `src/lib/taste-map/similarity-storage.ts`:

1. **`deleteSimilarityScoresByUser(userId: string): Promise<number>`**
   - Удаляет все записи `SimilarityScore`, где userIdA или userIdB = userId
   - Возвращает количество удалённых записей

2. **(Опционально) `getSimilarityScoresWithFreshness(userId, limit): Promise<Array<{score, isFresh}>>`**
   - Загружает записи из БД, помечает как fresh/stale по `expiresAt`
   - Можно реализовать инлайн в API, если нужна только там

---

## Архитектурный паттерн продукта

### Cache hierarchy

```
Layer 1: Redis (taste map)         — 24h TTL, cache-aside (withCache)
Layer 2: Redis (similar users)     — 24h TTL, stored via storeSimilarUsers()
Layer 3: PostgreSQL (SimilarityScore) — persistent, now with expiresAt (soft TTL 7d)
```

### Current patterns

- **Cache-aside** for taste maps: `getTasteMap(userId, computeFn)` uses `withCache` (redis.ts)
- **Write-through** for similarity: `computeAndStoreSimilarityScore()` writes to DB (no Redis)
- **On-demand fallback** in similar-users API if DB empty
- **Background taste map recompute** after WatchList changes (`recomputeTasteMap` via `after()`)

### Proposed changes pattern

- **Write-invalidate**: Any WatchList mutation → `invalidateTasteMap()` + `deleteSimilarityScoresByUser()`
- **Soft TTL**: `expiresAt` column in SimilarityScore (7 days from computedAt)
- **Staleness-aware read** in similar-users:
  1. Try Redis (fast)
  2. If miss → query DB, split scores into fresh/stale by `expiresAt`
  3. Lazy recompute stale pairs (on-demand), update DB
  4. Cache final result in Redis
- **Lazy recompute**: Only pairs that are stale get recomputed, not all pairs

### Consistency model

- **Eventual consistency** with write-invalidate.
- After rating change: similarity scores deleted, taste map invalidated.
- Next request recomputes needed pairs on-demand.
- **At most one request latency** for recomputation.

---

## Риски

| Риск | Влияние | Митигация |
|------|---------|-----------|
| Heavy delete on active users | `deleteMany` с большим количеством записей может занять время и блокировать таблицу | Используем batch-удаление? Нет, `deleteMany` с простым `OR` условием. Влечет за собой Index по (userIdA, userIdB) – должен быть быстрым. Для активного пользователя ~100-500 пар, это мгновенно. |
| Cache stampede after invalidation | Множество параллельных запросов вызовут множественные on-demand вычисления | Первый запрос заполнит Redis; остальные получат из кеша. Не критично. |
| Stale pairs linger if recompute fails | Ошибка при lazy recompute → оставляем старую запись? | Логируем ошибку, оставляем старую запись (она всё равно старее TTL, но будет использоваться до следующей попытки). Можно в будущем добавить retry. |
| Scheduler `minWatchCount=3` слишком много пользователей | Scheduler может попытаться обработать thousands user pairs и устареть | Ограничим limit/offset, и планировщик и так запускается вручную или ежедневно. Для production нужно внедрить по-настоящему еженедельный cron. |

---

## Рекомендуемая структура файлов

Изменения в существующих файлах, новая структура не требуется.

### Modified files layout

```
src/
├── lib/
│   └── taste-map/
│       ├── similarity-storage.ts    (+ SIMILARITY_TTL_HOURS, expiresAt, deleteSimilarityScoresByUser)
│       └── similarity.ts             (storeSimilarUsers already exists, use it)
├── app/
│   ├── api/
│   │   ├── user/
│   │   │   └── similar-users/
│   │   │       └── route.ts          (rewrite: cache-first, per-pair freshness)
│   │   ├── watchlist/
│   │   │   └── route.ts              (+ invalidation in POST & DELETE)
│   │   └── my-movies/
│   │       └── route.ts              (+ invalidation in updateWatchStatus)
│   └── actions/
│       └── watchListActions.ts       (+ invalidation in toggleMediaStatus)
└── lib/
    └── tasks/
        └── computeSimilarityScores.ts (minWatchCount: 30→3, candidates: 20→100)
```

---

## Что НЕ трогать

- **Поля `tasteMapASnapshot`/`tasteMapBSnapshot`** — пока оставим для reproducibility, даже если не используются.
- **`getSimilarityScoreFromDB()`** — используется внутри `computeAndStoreSimilarityScore` для избежания дублей вычислений.
- **Рекомендательные алгоритмы** (`src/lib/recommendation-algorithms/`) — они используют `getSimilarUsers` и после наших изменений Redis будет актуальным.
- **Админ-эндпоинты** (`/api/admin/...`) — кроме необходимости проверить, что `compute-similarities` использует новые настройки scheduler (да, использует).
- **Тесты** — потребуют адаптации, но это отдельная фаза (можно в Phase 29).

---

## Детали реализации (коду)

### 1. `similarity-storage.ts` — дополнения

```typescript
const SIMILARITY_TTL_HOURS = 168; // 7 days

export async function computeAndStoreSimilarityScore(...) {
  // ...
  const expiresAt = new Date(Date.now() + SIMILARITY_TTL_HOURS * 60 * 60 * 1000);

  const stored = await prisma.similarityScore.upsert({
    where: { userIdA_userIdB: { userIdA: orderedA, userIdB: orderedB } },
    update: {
      // ...
      expiresAt, // add
    },
    create: {
      // ...
      expiresAt, // add
    },
  });
  // ...
}

export async function deleteSimilarityScoresByUser(userId: string): Promise<number> {
  const result = await prisma.similarityScore.deleteMany({
    where: {
      OR: [{ userIdA: userId }, { userIdB: userId }],
    },
  });
  return result.count;
}
```

### 2. `similar-users/route.ts` — новая логика (высокоуровнево)

```typescript
// imports + getSimilarUsers, storeSimilarUsers

// 1. Redis cache check
const cached = await getSimilarUsers(userId);
if (cached.length > 0) {
  // Enrich: fetch userInfo, completedCounts, filter ≥40% & ≥3
  // Return with source: 'cache'
}

// 2. DB query with freshness
const scores = await prisma.similarityScore.findMany({ where: { OR: [...] }, orderBy: { overallMatch: 'desc' }, take: limit });

if (scores.length === 0) {
  // Full on-demand fallback (existing code, but at end: await storeSimilarUsers(...))
} else {
  // Split fresh/stale
  const fresh = [];
  const stalePairs = [];
  for (const score of scores) {
    const isFresh = !score.expiresAt || score.expiresAt > new Date();
    if (isFresh) fresh.push(score);
    else stalePairs.push({ score, otherUserId: ... });
  }
  // Lazy recompute stalePairs sequentially
  for (const {score, otherUserId} of stalePairs) {
    const result = await computeSimilarity(userId, otherUserId, false);
    if (isSimilar(result)) {
      await computeAndStoreSimilarityScore(userId, otherUserId, 'on-demand');
      const refreshed = await prisma.similarityScore.findUnique({ where: { userIdA_userIdB: ... } });
      if (refreshed) fresh.push(refreshed);
    } else {
      // not similar anymore – optionally delete? computeAndStore upsert will handle if not similar? Actually it only stores if similar, so old may remain. We could delete manually if desired.
    }
  }
  // Sort, slice, enrich, store to Redis, return
}

// 3. Remove freshOnly param and logic entirely
```

### 3. `computeSimilarityScores.ts`

```typescript
const activeUsers = await getActiveUsersForSimilarityCompute(3, 30, 1000); // was 30
// ...
const candidates = await getCandidateUsersForSimilarity(userA, 100); // was 20
```

### 4. Invalidation places

В каждом месте после успешной mutation (update/upsert/create/delete) добавить:

```typescript
import { invalidateTasteMap } from '@/lib/taste-map/redis';
import { deleteSimilarityScoresByUser } from '@/lib/taste-map/similarity-storage';

// after DB op:
await invalidateTasteMap(userId);
await deleteSimilarityScoresByUser(userId);
```

---

## Проверка полноты

- [x] Добавлено `expiresAt` в схему (миграция уже сделана)
- [x] Определены все места изменения WatchList (watchlist API, watchListActions, my-movies)
- [x] Определены все вызовы `storeSimilarUsers` (только внутри `findSimilarUsers`, который не используется) → будем вызывать напрямую
- [x] Проверен Redis key pattern: `user:{userId}:taste-map` и `similar-users:v2:{userId}`
- [x] Планировщик не запускается автоматически, но admin endpoint есть
- [x] `freshOnly` параметр будет удалён

---

## Открытые вопросы

1. **Удаление не-similar пар при recompute?** Если stale пара после пересчета уже не проходит порог 40%, старая запись должна удалиться? В `computeAndStoreSimilarityScore` есть условие `if (isSimilar(result))` перед сохранением? Да, в `similar-users/route.ts` (line 134) проверяют `if (isSimilar(result))` перед вызовом `computeAndStoreSimilarityScore`. А в `scheduler` — нет, sempre сохраняют? В `computeSimilarityScores.ts` line 102: `await computeAndStoreSimilarityScore(userA, userB, 'scheduler');` без проверки. Нужно ли добавить проверку? Requirements Phase 27: "Только пользователи с ≥40% match показываются". Значит, scheduler тоже должен сохранять только similar? Но это уже существующее поведение — если pair перестал быть similar, он останется в БД со старым значением. С нашей логикой stale пар мы будем recompute и если не similar – не сохраняем (старая запись останется). Хорошо бы удалить старую запись, если пара перестала быть similar. Это можно сделать в lazy recompute: если `!isSimilar(result)` → `await prisma.similarityScore.delete(...)`. Уточнить с product owner. Пока сделаем просто не сохранять, а старую оставить – она всё равно stale и будет удалена через TTL (7 дней). Или мы можем удалять сиротские записи через cleanup. Оставить как есть – TTL почистит.

2. **Параллельный recompute stale пар?** Может быть несколько старых пар. Выполняем последовательно, чтобы не перегружать. Можно параллельно с лимитом, но пока последовательно.

3. **Нужно ли обновлять `invalidateTasteMap` у существующих импортеров?** Да, в `watchlist/route.ts` уже импортирован `invalidateUserCache`, но не `invalidateTasteMap`. Добавим импорт.

---

## Готово к планированию.

Следующий шаг: создать план задач (TDD style: spec → code → verify).
