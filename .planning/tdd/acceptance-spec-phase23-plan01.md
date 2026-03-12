# Acceptance Spec: API Sorting and Type Safety

## User Story

As a user navigating to `/profile/creators`, I expect the page to behave identically to `/profile/actors`:
- Creators are sorted by a computed score (not just rating)
- Sort order is consistent across all pagination modes
- No type errors in the API

## Scenarios

### Scenario 1: Single-load mode sorts by creator_score

**Given** I'm on `/profile/creators` page (singleLoad=true)
**When** The API returns creators data
**Then** The creators should be sorted by `creator_score` in descending order
**And** The top creator should have the highest `creator_score`

### Scenario 2: Paginated mode sorts by creator_score

**Given** I request creators with pagination (singleLoad=false)
**When** The API returns a page of creators
**Then** The creators in that page should be sorted by `creator_score` in descending order
**And** The overall ordering should be consistent with singleLoad mode

### Scenario 3: Tie-breakers for creator_score

**Given** Multiple creators have the same `creator_score`
**When** The API sorts the results
**Then** Creators with equal scores should be ordered by `average_rating` (descending, nulls last)
**And** If ratings are equal, by `progress_percent` (descending)
**And** If both are equal, by `name` (alphabetical, Russian locale)

### Scenario 4: Type safety - no any types

**Given** The achiev_creators API route
**When** TypeScript compilation runs
**Then** The file should have zero type errors
**And** No `any` types should be used in the file
**And** All API responses should have proper type assertions

### Scenario 5: Filtering consistency

**Given** The API processes a user's movie history
**When** It fetches crew credits from TMDB
**Then** Anime (genre 16 + Japanese) should be filtered out
**And** Cartoons (genre 16 + non-Japanese) should be filtered out
**And** This filtering should match the actors API behavior exactly
