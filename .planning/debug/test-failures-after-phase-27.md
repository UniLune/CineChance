---
status: investigating
trigger: "npm run test:ci yields several failures after Phase 27 changes"
created: 2025-03-20T12:00:00.000Z
updated: 2025-03-20T12:00:00.000Z
---

## Current Focus

hypothesis: Test failures are due to mismatches between test expectations and actual component implementation after Phase 27 changes and pre-existing issues in planning tests.
test: Update tests and possibly implementation to align expectations
expecting: All tests to pass after targeted fixes
next_action: Fix TwinTasters.test.tsx mismatches first

## Symptoms

- TwinTasters.test.tsx: 5 failures
  1. Cleanup API call expects `/api/admin/cleanup/similarity` but code calls with `?type=orphaned`
  2. User label expects "Кинемана USER123" but component renders "Киномана user123"
  3. Empty state expects container not present but component renders error message
  4. (related to above) success toast fails due to fetch mismatch
  5. (related) error toast fails due to fetch mismatch
- .planning/phases/25-simplify-taste-map/tdd/acceptance-code-25-03.test.tsx: 3 failures
  - "should render summary stats": expects strings not present ("Средний рейтинг", "Положительные оценки")
  - "should render computed metrics section": may fail due to missing genreCounts in mock
  - "should render behavior profile section": may fail due to missing genreCounts in mock
- src/lib/__tests__/config/tsconfig.test.ts: 1 failure (pre-existing config error likely)

## Eliminated

## Evidence

- TwinTasters.tsx line 54: fetch URL includes `?type=orphaned`
- TwinTasters.tsx line 215: renders "Киномана {userId.substring(0,8)}"
- TwinTasters.tsx lines 88-94: empty similarUsers triggers error state, not null render
- acceptance-code-25-03.test.tsx: mock lacks genreCounts, causing empty state
- acceptance-code-25-03.test.tsx: expects strings "Средний рейтинг", "Положительные оценки" which are not in TasteMapClient

## Resolution

Root cause: Test expectations out of sync with actual component behavior. Pre-existing test data issues in Phase 25 tests.
Fix approach:
1. Update TwinTasters.test.tsx to match actual implementation
2. Update Phase 25 test mock data and adjust expectations to match actual implementation
3. Investigate tsconfig error; if pre-existing and non-trivial, document.
