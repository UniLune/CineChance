# Acceptance Spec: 25-02 Remove Person Profile UI

## User Story
As a user, I should no longer see actor/director person profiles in the TasteMap pages and API responses, as these have been removed from similarity calculations.

## Scenarios

### Scenario 1: TasteMap page loads without person profiles
**Given** I am on `/profile/taste-map`
**When** the page loads
**Then**:
- No network requests for person profile data should be made
- The page should display genre profile, rating distribution, metrics, behavior profile, and TwinTasters
- No sections for "Top Actors" or "Top Directors" should be visible

### Scenario 2: TwinTasters tooltip explains new weights
**Given** I am on the TasteMap page
**When** I view the TwinTasters component tooltip/explanation
**Then** I should see:
- 🎬 Совпадение по фильмам (40%)
- 🎭 Жанры (60%)
- No mention of actors/directors (👥 Персоны) or 20% weight

### Scenario 3: Comparison page without person comparison
**Given** I am on `/profile/taste-map/compare/[otherUserId]`
**When** the comparison page loads
**Then**:
- No section comparing actors/directors should be rendered
- The page should show genre comparison, rating patterns, and overall match
- The personOverlap metric may still exist (for compatibility) but should not have a dedicated UI section

### Scenario 4: Comparison API omits personComparison
**Given** I call `GET /api/user/taste-map-comparison/[userId]`
**When** the response is returned
**Then** the JSON should NOT contain a `personComparison` field
**And** it should contain: `genreComparison`, `ratingPatterns`, `metrics` (with `personOverlap` optional)

### Scenario 5: Backend does not compute person profiles for taste map
**Given** I request the taste map page
**When** the server component prepares data
**Then** it should not call `computeUserPersonProfile` or fetch `PersonProfile` data
**And** it should only pass `genreProfile`, `ratingDistribution`, etc. to `TasteMapClient`
