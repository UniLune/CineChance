# Acceptance Spec: similar-users API — Cache-First & Staleness-Aware

## Goal
Rewrite `GET /api/user/similar-users` to use:
1. Redis cache (fast path)
2. DB with per-pair freshness check (`expiresAt`) + lazy recompute for stale pairs
3. Full on-demand fallback if no DB records

## Scenarios

### Scenario 1: Redis cache hit
**Given** a user has cached similar users in Redis (`similar-users:v2:{userId}`)
**When** GET `/api/user/similar-users` is called
**Then**:
- Return results from Redis immediately
- Do NOT query the database (except for enrichment)
- Log: "Returning similar users from Redis cache"
- Response includes `fromDatabase: false`

### Scenario 2: Fresh DB scores
**Given** Redis cache miss
**And** the database has SimilarityScore records with `expiresAt > now`
**When** GET `/api/user/similar-users` is called
**Then**:
- Use fresh scores from database
- Store results to Redis via `storeSimilarUsers()`
- Return `fromDatabase: true`

### Scenario 3: Stale DB scores (lazy recompute)
**Given** Redis cache miss
**And** the database has at least one SimilarityScore with `expiresAt <= now`
**When** GET `/api/user/similar-users` is called
**Then**:
- For each stale pair:
  - Compute similarity on-demand (`computeSimilarity`)
  - Store updated score via `computeAndStoreSimilarityScore(userId, otherUserId, 'on-demand')`
  - Use the refreshed score
- Fresh scores are used as-is
- Combine fresh + refreshed, sort by `overallMatch` descending
- Store final results to Redis
- Return `fromDatabase: true`
- Log: "Found X existing scores, checking freshness" and "Recomputing stale similarity pair"

### Scenario 4: No DB scores (on-demand fallback)
**Given** Redis cache miss
**And** the database has no SimilarityScore records for the user
**When** GET `/api/user/similar-users` is called
**Then**:
- Execute full on-demand fallback (existing logic)
  - Get candidates via `getCandidateUsersForSimilarity(userId)`
  - For each candidate: `computeSimilarity()` → if `isSimilar()` → `computeAndStoreSimilarityScore()`
- Store results to Redis via `storeSimilarUsers()`
- Return `fromDatabase: false`

### Scenario 5: Partial fresh + stale
**Given** Redis cache miss
**And** database has both fresh and stale scores
**When** GET `/api/user/similar-users` is called
**Then**:
- Use fresh scores directly
- Recompute only stale pairs
- Return combined enriched results
- Response includes both fresh and refreshed scores

### Scenario 6: Stale pair no longer similar
**Given** a stale SimilarityScore exists (e.g., overallMatch = 0.45)
**When** on-demand recompute returns `overallMatch < 0.4`
**Then**:
- Do NOT store new SimilarityScore (old one remains, will expire naturally)
- Old score is included in response (even if below threshold) or filtered out?  
  **Decision:** Keep old score if recompute fails or becomes not similar? Better: filter by threshold after enrichment anyway. Old stale score may be below threshold; we filter after enrichment, so it will be excluded.

### Scenario 7: `freshOnly` query parameter (deprecated)
**Given** the endpoint receives `?freshOnly=true`
**When** processing
**Then**:
- The parameter is ignored (no special handling)
- Staleness is handled automatically via `expiresAt`

## Non-Functional Requirements

- **Performance:** Redis cache hit should be < 10ms
- **Consistency:** After rating change, `invalidateTasteMap()` + `deleteSimilarityScoresByUser()` ensure next request recomputes
- **TTL:** `expiresAt` = `computedAt + 7 days` (168 hours)
- **Logging:** Include `userId`, `count`, `refreshed`, `stale` in debug logs
- **Error handling:** If lazy recompute fails for a pair, log error and keep old score (or drop? keep for now)

## Edge Cases

- User has no watch history (<3 completed) → return empty list (unchanged)
- All candidates filtered out by threshold → empty list
- Redis unavailable → fall back to DB path (no crash)
- Prisma errors → return 500 with proper logging

## Acceptance Criteria

- [ ] Redis cache hit path implemented and tested
- [ ] Freshness check (`expiresAt > now`) implemented
- [ ] Lazy recompute for stale pairs (sequential, with error handling)
- [ ] On-demand fallback unchanged but now stores to Redis
- [ ] `freshOnly` parameter removed or deprecated
- [ ] All existing tests for similar-users continue to pass
- [ ] New tests cover cache hit, fresh, stale, fallback scenarios
