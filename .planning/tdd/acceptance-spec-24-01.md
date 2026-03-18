# Acceptance Spec: Phase 24 - Taste Map DB Read Fix

## User Story
As a user, I want to see my favorite actors and directors on the Taste Map page that exactly match the data shown on the Actors and Creators profile pages, ensuring consistency across the application.

## Scenarios

### Scenario 1: Display actors from PersonProfile
**Given** I am logged in and have a `PersonProfile` record with actors in the database
**When** I visit `/profile/taste-map`
**Then** I see my top 10 favorite actors displayed
**And** The actor names and scores come directly from the `PersonProfile` table
**And** No network requests are made to `/api/user/person-profile` or `/api/user/achiev_actors`

### Scenario 2: Display directors from PersonProfile
**Given** I am logged in and have a `PersonProfile` record with directors in the database
**When** I visit `/profile/taste-map`
**Then** I see my top 10 favorite directors displayed
**And** The director names and scores come directly from the `PersonProfile` table
**And** No network requests are made to `/api/user/person-profile` or `/api/user/achiev_creators`

### Scenario 3: Empty state when no PersonProfile data
**Given** I am logged in but have never visited `/profile/actors` or `/profile/creators`
**And** There is no `PersonProfile` record for my account
**When** I visit `/profile/taste-map`
**Then** The actors section shows "Нет данных об актерах"
**And** The directors section shows "Нет данных о режиссерах"
**And** Other taste map charts (genres, ratings) still display normally if available

### Scenario 4: Data consistency between pages
**Given** I have watched movies with actors and directors
**And** I have visited `/profile/actors` (which triggers `computeUserPersonProfile`)
**When** I visit `/profile/actors` and note the top actor name and score
**And** I visit `/profile/taste-map` and check the first actor in the list
**Then** The actor name matches exactly
**And** The actor score matches exactly (same `avgWeightedRating` value)

### Scenario 5: Performance improvement
**Given** The old implementation made 2 client-side API calls to load actors/directors
**When** I visit `/profile/taste-map` with the new implementation
**Then** The page loads with fewer network requests (0 additional API calls for persons)
**And** The First Contentful Paint time is reduced or unchanged

## Non-Functional Requirements

1. **Type Safety**: No `any` types introduced; TypeScript strict mode passes
2. **Error Handling**: Graceful handling of missing `PersonProfile` records
3. **Backward Compatibility**: No breaking changes to existing taste-map functionality (charts, metrics)
4. **No TMDB Calls**: The page must NOT make any calls to TMDB API (only Prisma DB queries)
5. **Server-Side Rendering**: Data is fetched server-side and passed as props (no client-side suspense needed)

## Acceptance Test Checklist

- [ ] Actors display: top 10 from `PersonProfile` (actor) with correct names and scores
- [ ] Directors display: top 10 from `PersonProfile` (director) with correct names and scores
- [ ] No fetch calls to `/api/user/person-profile` in browser network tab
- [ ] No fetch calls to `/api/user/achiev_actors` or `/api/user/achiev_creators`
- [ ] Console has no errors or warnings related to taste-map persons
- [ ] TypeScript compilation successful (`npx tsc --noEmit`)
- [ ] ESLint passes (`npm run lint`)
- [ ] All existing tests pass (`npm run test:ci`)
- [ ] Page renders correctly on mobile and desktop viewports
- [ ] Empty states work correctly when `PersonProfile` is missing

## Out of Scope

- Changing how `PersonProfile` is generated (that's handled by `/profile/actors` and `/profile/creators`)
- Modifying the computation algorithm in `computeUserPersonProfile()`
- Adding caching or performance optimizations beyond removing client fetches
- Changing the UI design of the actor/director blocks (just change data source)
