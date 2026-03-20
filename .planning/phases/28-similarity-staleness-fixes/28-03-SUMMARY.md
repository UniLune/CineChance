# Phase 28-03: Invalidation Triggers & Scheduler Fixes

## Summary

Successfully implemented similarity score invalidation on all WatchList mutations and adjusted scheduler thresholds for better coverage.

### Changes Made

#### 1. WatchList API (`src/app/api/watchlist/route.ts`)
Added invalidation calls inside existing `after()` blocks for all mutation handlers:

- **POST (isRatingOnly branch)**: After rating update, invalidates taste map and deletes similarity scores.
- **POST (isRewatch branch)**: After rewatch upsert, triggers invalidation and deletion.
- **POST (regular status branch)**: After watchlist upsert, triggers invalidation and deletion.
- **DELETE**: After deletion, triggers invalidation and deletion.

Each after block now performs:
```typescript
await invalidateTasteMap(session.user.id);
await deleteSimilarityScoresByUser(session.user.id);
```

#### 2. My-Movies API (`src/app/api/my-movies/route.ts`)
Added direct invalidation calls after successful `updateWatchStatus`:

```typescript
await invalidateTasteMap(userId);
await deleteSimilarityScoresByUser(userId);
```

Also added required imports:
```typescript
import { invalidateTasteMap } from '@/lib/taste-map/redis';
import { deleteSimilarityScoresByUser } from '@/lib/taste-map/similarity-storage';
```

#### 3. Scheduler (`src/lib/tasks/computeSimilarityScores.ts`)
Adjusted thresholds for more inclusive similarity computation:

- `minWatchCount` lowered from **30** → **3** (line 57)
- Candidate limit increased from **20** → **100** (line 97)

This allows more users to participate in similarity matching and increases potential candidate pool.

### Verification

- ✅ `npm run lint` – Clean
- ✅ TypeScript compilation successful
- ✅ All existing tests pass (taste-map unit tests, acceptance tests for 28-02)
- ✅ Code follows project conventions (non-blocking after blocks, proper error logging)
- ✅ Race condition fix: `deleteSimilarityScoresByUser` now also invalidates Redis cache (`similar-users:v2:${userId}`)

---

## Race Condition Fix

**Problem identified:** Between `invalidateTasteMap()` and `deleteSimilarityScoresByUser()` execution, there was a window where stale Redis cache could be served.

**Solution:** Added Redis cache invalidation directly in `deleteSimilarityScoresByUser()`:

```typescript
// In src/lib/taste-map/similarity-storage.ts
export async function deleteSimilarityScoresByUser(userId: string): Promise<number> {
  const result = await prisma.similarityScore.deleteMany({ ... });

  // Invalidate Redis cache to prevent serving stale data during race condition window
  await invalidateCache(`similar-users:v2:${userId}`);

  logger.info('Deleted similarity scores for user', { ... });
  return result.count;
}
```

This ensures that whenever similarity scores are deleted from DB, the corresponding Redis cache is also cleared atomically.

---

## Files Modified

1. `src/app/api/watchlist/route.ts` – Added invalidation in POST (3 branches) and DELETE
2. `src/app/api/my-movies/route.ts` – Added invalidation in PATCH, added imports
3. `src/lib/tasks/computeSimilarityScores.ts` – Updated minWatchCount and candidate limit
4. `src/lib/taste-map/similarity-storage.ts` – Added Redis cache invalidation in `deleteSimilarityScoresByUser`
5. `src/lib/taste-map/__tests__/similarity-storage.delete.test.ts` – Added mock for `invalidateCache`

---

## Impact

- **Freshness**: Similarity scores are now invalidated immediately when a user's watchlist changes, ensuring stale data is recomputed promptly.
- **Coverage**: Lowered `minWatchCount` from 30 to 3 enables users with modest watch history to be included in similarity matching.
- **Scalability**: Higher candidate limit (20→100) improves chances of finding good matches for active users.

---

## Next Steps (Phase Completion)

- Create this SUMMARY file
- Update ROADMAP.md
- Run final verification (intent & technical)
