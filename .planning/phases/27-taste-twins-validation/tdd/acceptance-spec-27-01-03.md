## Acceptance Spec: Filter similar-users by completed watch count (≥3) and match percentage (≥40%)

### User Story
As a user, I want the similar-users endpoint to return only legitimate similar users with sufficient history and high match, so that TwinTasters displays quality matches.

### Acceptance Criteria
1. Enrichment uses completed watch count (WATCHED+REWATCHED only) not total watchList.length
2. After enrichment, filter out users with completedCount < 3
3. Filter out users with overallMatch < 40% (DB stores 0-1 decimal, API converts to 0-100 percentage)
4. The API response similarUsers array contains only users meeting both criteria
5. The filtering applies to both DB-retrieved and on-demand computed results

### Current Implementation Issues
- Line 200 in route.ts: `watchCount: userInfoById.get(u.userId)?.watchList.length || 0` uses all statuses
- No filtering after enrichment (line 197-203)
- overallMatch is multiplied by 100 at line 199, but filtering should be applied to the percentage value

### Scenarios
```gherkin
Scenario: User with insufficient completed movies is filtered out
  Given similarUsers contains user "u1" with overallMatch 45%
  And u1 has 2 completed movies (status WATCHED or REWATCHED)
  When the enrichment and filtering is applied
  Then u1 is excluded from final response

Scenario: User with low match percentage is filtered out
  Given similarUsers contains user "u2" with overallMatch 35%
  And u2 has 10 completed movies
  When the enrichment and filtering is applied
  Then u2 is excluded from final response

Scenario: User meeting both criteria is included
  Given similarUsers contains user "u3" with overallMatch 45%
  And u3 has 5 completed movies
  When the enrichment and filtering is applied
  Then u3 is included in final response with correct watchCount

Scenario: User with exactly 3 completed movies passes threshold
  Given similarUsers contains user "u4" with overallMatch 40%
  And u4 has exactly 3 completed movies
  When the enrichment and filtering is applied
  Then u4 is included in final response

Scenario: User with exactly 40% match passes threshold
  Given similarUsers contains user "u5" with overallMatch 40.0%
  And u5 has 5 completed movies
  When the enrichment and filtering is applied
  Then u5 is included in final response

Scenario: User with completed count 0 is filtered out
  Given similarUsers contains user "u6" with overallMatch 50%
  And u6 has 0 completed movies
  When the enrichment and filtering is applied
  Then u6 is excluded from final response

Scenario: On-demand computed results are filtered
  Given the API is computing similarities on-demand (fromDatabase = false)
  And candidate user "u7" has 4 completed movies and 42% match
  When the enrichment and filtering is applied
  Then u7 is included in final response

Scenario: On-demand computed results with low match are filtered
  Given the API is computing similarities on-demand
  And candidate user "u8" has 6 completed movies and 38% match
  When the enrichment and filtering is applied
  Then u8 is excluded from final response

Scenario: Edge case - overallMatch 39.9% is filtered
  Given similarUsers contains user "u9" with overallMatch 39.9%
  And u9 has 10 completed movies
  When the enrichment and filtering is applied
  Then u9 is excluded from final response

Scenario: Edge case - overallMatch 40.0% passes exactly
  Given similarUsers contains user "u10" with overallMatch 40.0%
  And u10 has 3 completed movies
  When the enrichment and filtering is applied
  Then u10 is included in final response

Scenario: All results filtered out returns empty array
  Given similarUsers contains only users with < 3 completed movies OR < 40% match
  When the enrichment and filtering is applied
  Then the response similarUsers array is empty
```

### Edge Cases
- Empty similarUsers array before enrichment → return empty array
- All candidates fail filter → empty response
- Missing user in userInfoById map → watchCount 0 (fails filter)
- Missing user in completedCountMap → should default to 0 (fails filter)
- overallMatch near threshold (39.999% vs 40.0%) → strictly >= 40
- watchCount exactly 3 → passes
- watchCount 2.999 (edge case from data) → integer comparison only
- DB stores overallMatch as Decimal → Number conversion needed before percentage multiplication
- User has only NON-completed status items (WATCHING, DROPPED) → count 0 (fails filter)
- User has REWATCHED items only → counts toward completed total
- freshOnly parameter doesn't affect filtering logic

### Non-functional Requirements
1. **Single query for counts**: Must call `getUserCompletedWatchCount(userIds)` once for all userIds
2. **No N+1**: Don't call getUserCompletedWatchCount in a loop
3. **Correct scale**: overallMatch in DB is 0-1 decimal; API converts to percentage via `(overallMatch * 100).toFixed(1)`. Filtering must be applied to the percentage value (>= 40), not the raw decimal.
4. **Filter after enrichment**: Apply filtering after combining score + watchCount +memberSince into enriched objects
5. **Performance**: O(n) filtering where n = similarUsers.length (typically ≤ 50)
6. **Type safety**: overallMatch percentage should be number (from Number(...)), watchCount from Map lookup

### Implementation Notes
**Current enrichment (line 197-203):**
```typescript
const enrichedResults = similarUsers.map(u => ({
  userId: u.userId,
  overallMatch: Number((u.overallMatch * 100).toFixed(1)),
  watchCount: userInfoById.get(u.userId)?.watchList.length || 0,  // ← BAD: all statuses
  memberSince: userInfoById.get(u.userId)?.createdAt,
  source: fromDatabase ? 'database' : 'computed',
}));
```

**Required changes:**
1. Import `getUserCompletedWatchCount` from `@/lib/taste-map/similarity-storage`
2. After `const userInfoById = new Map(...)` (line 195), call:
   ```typescript
   const userIds = similarUsers.map(u => u.userId);
   const completedCountMap = await getUserCompletedWatchCount(userIds);
   ```
3. Replace watchCount line:
   ```typescript
   watchCount: completedCountMap.get(u.userId) ?? 0,
   ```
4. After enrichment, filter BEFORE return:
   ```typescript
   const filteredResults = enrichedResults.filter(u => 
     u.watchCount >= 3 && u.overallMatch >= 40
   );
   ```
5. Update response to use `filteredResults` instead of `enrichedResults`
6. Update message to reflect filtered count: `Found ${filteredResults.length} similar user(s)`

**Order of operations:**
- Fetch userInfo (line 185-193) - needed for memberSince only
- Get completedCountMap (new step)
- Build enrichedResults (map)
- Apply filter (new step)  
- Return response

**Note**: The DB query at line 69-80 already orders by score and limits to `limit` param. Filtering happens AFTER that, so final count may be less than limit.

### Test Approach
1. **Unit tests for route.ts**:
   - Mock `getUserCompletedWatchCount` to return various scenarios
   - Mock Prisma user queries
   - Mock similarityScore DB queries
   - Verify filtering logic on enrichedResults
   - Test edge cases (threshold values, empty map, missing users)

2. **Integration tests**:
   - Seed DB with users having different watch counts and similarity scores
   - Call API and assert only qualified users returned
   - Test both database and on-demand code paths

3. **Existing tests**:
   - `getUserCompletedWatchCount.test.ts` already covers helper function
   - Route tests may need updates to reflect new filter

### Verification Steps
1. Run `npm run test:ci` to ensure all tests pass after implementation
2. Run `npm run lint` to verify code style compliance
3. Manual curl test:
   ```bash
   curl "http://localhost:3000/api/user/similar-users?limit=10" | jq '.similarUsers[] | {userId, overallMatch, watchCount}'
   ```
   Verify all items have `watchCount >= 3` and `overallMatch >= 40`

4. Use debug endpoint to inspect raw vs filtered:
   ```bash
   curl "http://localhost:3000/api/user/similar-users/debug?limit=10&details=true" | jq
   ```

### Files to Modify
- `src/app/api/user/similar-users/route.ts` (main implementation)

### Acceptance Checklist
- [ ] Import getUserCompletedWatchCount
- [ ] Replace watchList.length with completedCountMap lookup
- [ ] Add filter after enrichment
- [ ] Filter uses `>= 3` for watchCount and `>= 40` for overallMatch percentage
- [ ] Update response message to reflect filtered count
- [ ] Unit tests cover: below thresholds, exactly at thresholds, above thresholds
- [ ] Integration tests verify end-to-end filtering
- [ ] No console.log calls (use logger if needed)
- [ ] ESLint passes with no errors
- [ ] All tests pass

### References
- Previous acceptance spec: `acceptance-spec-27-01-02.md` (getUserCompletedWatchCount helper)
- Main route: `src/app/api/user/similar-users/route.ts:197-203`
- Helper: `src/lib/taste-map/similarity-storage.ts:287-306`
- Completed status constants: `src/lib/movieStatusConstants.ts` (WATCHED, REWATCHED)
