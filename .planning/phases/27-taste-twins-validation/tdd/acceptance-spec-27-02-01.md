# Acceptance Spec: cleanupOrphanedScores

**User Story**
> As an admin, I want to remove SimilarityScore records that reference non-existent users, so that the database stays clean and queries don't return invalid data.

**Acceptance Criteria**
1. Function returns `Promise<{deleted: number, orphans: string[]}>`
2. Finds all distinct user IDs from SimilarityScore (both userIdA and userIdB)
3. Computes set of orphaned IDs (those not in User table)
4. Deletes all SimilarityScore records where userIdA OR userIdB is in orphaned set
5. Returns count of deleted records and list of orphan user IDs
6. Handles empty similarity table gracefully (deleted=0, orphans=[])

**Scenario: Basic Orphan Cleanup**
Given:
- SimilarityScore has pairs: (user1, user2), (user1, user3), (user4, user5)
- Users table contains: user1, user2, user5 (user3 and user4 were deleted)

When `cleanupOrphanedScores()` is called

Then:
- Orphans = ['user3', 'user4']
- Deleted = 2 (records (user1,user3) and (user4,user5))
- Returns `{ deleted: 2, orphans: ['user3','user4'] }`

**Edge Cases**
- Empty similarity table → `{ deleted: 0, orphans: [] }`
- No orphans → `{ deleted: 0, orphans: [] }`
- User appears in multiple pairs → all pairs containing that user are deleted
- Large dataset → efficient batch processing (batch size 1000 for user existence checks)

**Implementation Notes**
- Use Prisma $queryRaw for efficient DISTINCT union query
- Batch user existence checks to avoid query size limits
- Use deleteMany with OR condition on both userIdA and userIdB
- Log cleanup summary with logger.info
- Follow existing patterns in similarity-storage.ts (logger usage, error propagation)