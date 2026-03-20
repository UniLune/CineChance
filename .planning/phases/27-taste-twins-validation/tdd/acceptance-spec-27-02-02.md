# Acceptance Spec: POST /api/admin/cleanup/similarity

**User Story**
> As an admin, I want to trigger cleanup of orphaned SimilarityScore records via an API endpoint, so that I can run cleanup manually when needed.

**Acceptance Criteria**
1. Endpoint: POST `/api/admin/cleanup/similarity` (query param: `type='orphaned'` - only orphaned supported initially)
2. Requires admin authentication (session.user.id === ADMIN_USER_ID from env)
3. Calls `cleanupOrphanedScores()` from similarity-storage
4. Returns JSON: `{ success: true, deleted: number, orphans: string[], message: string }`
5. Rate limiting applied (endpoint: `/api/admin/cleanup/similarity`)
6. On error, returns 500 with error message

**Scenario: Admin triggers orphan cleanup**
Given:
- Admin user is authenticated (session.user.id === ADMIN_USER_ID)
- SimilarityScore contains orphaned records referencing non-existent users
- Database has legitimate users: user1, user2
- SimilarityScore has pairs: (user1, deleted_user1), (deleted_user1, deleted_user2), (user2, user1)

When admin sends POST request to `/api/admin/cleanup/similarity`

Then:
- Response status: 200
- Response JSON: `{ success: true, deleted: 3, orphans: ['deleted_user1','deleted_user2'], message: 'Cleaned up 3 orphaned similarity scores' }`
- All records containing deleted_user1 or deleted_user2 are removed from database

**Scenario: Non-admin attempts cleanup**
Given:
- Non-admin user is authenticated (session.user.id !== ADMIN_USER_ID)

When non-admin sends POST request to `/api/admin/cleanup/similarity`

Then:
- Response status: 401
- Response JSON: `{ error: 'Unauthorized' }`
- No cleanup operation is performed

**Scenario: Error during cleanup**
Given:
- Admin user is authenticated
- `cleanupOrphanedScores()` throws an error (e.g., database connection failure)

When admin sends POST request to `/api/admin/cleanup/similarity`

Then:
- Response status: 500
- Response JSON: `{ error: 'Cleanup failed', message: '<error details>' }`
- Error is logged with logger.error

**Edge Cases**
- No orphaned records exist → `{ success: true, deleted: 0, orphans: [], message: 'No orphaned records found' }`
- Empty SimilarityScore table → `{ success: true, deleted: 0, orphans: [], message: 'No similarity scores to clean' }`
- Rate limit exceeded → 429 response before authentication check
- Redis unavailable for rate limiting → rate limiting disabled, request proceeds

**Implementation Notes**
- Follow existing admin endpoint pattern from `/api/admin/compute-similarities/route.ts`
- Admin USER_ID: `const ADMIN_USER_ID = process.env.ADMIN_USER_ID || 'cmkbc7sn2000104k3xd3zyf2a';`
- Rate limit call: `const { success } = await rateLimit(request, '/api/admin/cleanup/similarity');`
- Import: `import { cleanupOrphanedScores } from '@/lib/taste-map/similarity-storage';`
- Return format: consolidate result into message string for user feedback
- Logging: log cleanup start/completion with context 'AdminCleanupSimilarity'
- Error handling: catch and return 500, log full error details
