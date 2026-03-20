---
phase: 28
plan: "01"
subsystem: taste-map
status: complete
completed: 2026-03-20
---

# Phase 28-01 Summary: Storage Layer — expiresAt & Delete Helper

## Changes Made

- Added `SIMILARITY_TTL_HOURS = 168` constant (7 days)
- Updated `computeAndStoreSimilarityScore()`:
  - Calculates `expiresAt` = now + 168 hours
  - Sets `expiresAt` in both `create` and `update` blocks of upsert
- Added `deleteSimilarityScoresByUser(userId)` helper:
  - Deletes all `SimilarityScore` entries where `userIdA` OR `userIdB` = userId
  - Logs deletion count
  - Returns number of deleted records

## Files Modified

- `src/lib/taste-map/similarity-storage.ts`

## Tests Created

- `src/lib/taste-map/__tests__/similarity-storage.28-01.test.ts` (4 tests)
- `src/lib/taste-map/__tests__/similarity-storage.delete.test.ts` (2 tests)

**Test Results:** ✅ 6/6 passing

## Verification

- ✅ Lint: clean
- ✅ TypeScript: compiles without errors
- ✅ Tests: all unit tests for this plan pass
- ✅ Functionality: `expiresAt` set correctly, delete helper works

## Notes

- Prisma migration already applied (expiresAt column exists)
- Prisma client regenerated (`npx prisma generate`)
- Ready for Wave 2 (similar-users API rewrite)
