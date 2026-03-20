## Acceptance Spec: Efficient fetch of completed watch counts for multiple users

### User Story
As the similar-users API, I need to efficiently fetch completed watch counts for multiple users, so that I can filter candidates without N+1 queries.

### Acceptance Criteria
1. Function returns `Map<userId, number>` with counts of WATCHED+REWATCHED items
2. Uses `Prisma.groupBy` for single query (avoid N+1)
3. Returns 0 for users with no completed items (implicit via `Map.get` default)
4. Handles empty userIds array (returns empty Map)
5. Filters by `statusId` in `COMPLETED_STATUS_IDS`

### Scenarios
```gherkin
Scenario: Get counts for multiple users with varying watch counts
  Given users with IDs ["u1", "u2", "u3"]
  And u1 has 5 items with status WATCHED or REWATCHED
  And u2 has 2 items with status WATCHED or REWATCHED
  And u3 has 0 items with status WATCHED or REWATCHED
  When getUserCompletedWatchCount is called with userIds ["u1", "u2", "u3"]
  Then returns Map where:
    | userId | count |
    | u1     | 5     |
    | u2     | 2     |
    | u3     | 0     |

Scenario: Empty userIds array
  Given no users specified
  When getUserCompletedWatchCount is called with empty array
  Then returns empty Map

Scenario: Non-existent userId in list
  Given user IDs ["existing", "nonexistent"]
  And only "existing" has watch records
  When getUserCompletedWatchCount is called
  Then returns Map where:
    | userId     | count |
    | existing   | >0    |
    | nonexistent | 0    |

Scenario: Users with only non-completed status items
  Given user with items having status DROPPED or WATCHING
  When getUserCompletedWatchCount is called for that user
  Then returns count 0 for that user

Scenario: Large user set performance
  Given 1000 user IDs
  When getUserCompletedWatchCount is called
  Then executes exactly 1 database query (verified by query count)
```

### Edge Cases
- `userIds = []` → returns `new Map()`
- User exists but has only WATCHING/DROPPED items → count 0
- Mix of users with and without completed items → all present in Map
- User has REWATCHED items (should count separately from WATCHED)
- Database returns no groups for filtered users → manual 0 assignment

### Non-functional Requirements
- **Single query**: Must use `prisma.watchList.groupBy()` with `by: ['userId']` and `_count`
- **Filter first**: Apply `where: { userId: { in }, statusId: { in: COMPLETED_STATUS_IDS } }` to groupBy
- **Post-process**: After receiving grouped results, iterate over input `userIds` and set missing entries to 0
- **Type signature**: `export async function getUserCompletedWatchCount(userIds: string[]): Promise<Map<string, number>>`
- **No console.log**: Use `logger` for debug logging if needed

### Implementation Notes
- Use `prisma.watchList.groupBy({ by: ['userId'], where: { userId: { in: userIds }, statusId: { in: COMPLETED_STATUS_IDS } }, _count: { _all: true } })`
- Convert array of `{ userId, _count: { _all } }` to `Map<string, number>`
- Ensure all input `userIds` appear in the Map (set missing to 0)
- Guard: if `userIds.length === 0` return `new Map()` immediately (short circuit)

### Test Approach
- Unit tests with mocked Prisma client
- Assert `prisma.watchList.groupBy` called with correct parameters
- Verify Map contains all input user IDs
- Verify counts match expected values
- Verify empty array returns empty Map without DB call
