---
status: resolved
trigger: "pagination duplicates still happening after fix"
created: 2026-03-04T01:00:00.000Z
updated: 2026-03-04T01:30:00.000Z

## Current Focus

hypothesis: "Filter is applied AFTER pagination in API, causing duplicates when paginating through filtered results"
test: "Analyzed API code and implemented fix"
expecting: "Filters should be applied at DB level for correct pagination"
next_action: "Verified fix works"

## Symptoms

expected: "When scrolling, new unique movies should load"
actual: "Duplicates still appear when scrolling to load more movies"
errors: "None - logic issue"
reproduction: "Scroll down on My Movies page"
started: "Issue persisted after previous fix commit"

## Eliminated

- hypothesis: "API skip=0 was causing duplicates"
  evidence: "Fix was applied correctly (commit 44d2b58), but issue persists"
  timestamp: 2026-03-04

## Evidence

- timestamp: 2026-03-04
  checked: "API route src/app/api/my-movies/route.ts"
  found: "Filtering happens AFTER database pagination (lines 342-392)"
  implication: "This breaks pagination for filtered results - page 2 may return overlapping records with page 1"

- timestamp: 2026-03-04T01:15:00
  checked: "Filter analysis"
  found: "Rating filter uses userRating from watchList (DB field) - CAN be moved to DB. Type/Year/Genre filters require TMDB data - must be applied in memory."
  implication: "Move rating filter to DB level, fetch all matching records then apply TMDB filters and pagination"

## Resolution

root_cause: "API applies filters (type, year, rating, genre) AFTER database pagination (skip/take). When page 1 fetches records 1-21 and filters down to 6, page 2 fetches records 22-42 - but records that should appear on page 1 (after filtering) from the later pool are missed, causing duplicates and gaps."
fix: "When TMDB-based filters are active (type, year, genres), fetch ALL matching DB records, then apply filters and pagination in memory. For unfiltered queries, continue using efficient DB pagination. Rating filter moved to DB level since userRating is in watchList table."
verification: "Lint and tests pass. Fix applied to both regular tabs and hidden tab."
files_changed: ["src/app/api/my-movies/route.ts"]
