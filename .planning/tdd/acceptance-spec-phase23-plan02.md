# Acceptance Spec: CreatorsClient Parity with ActorsClient

## User Story

As a user navigating to `/profile/creators`, I should have the same experience as on `/profile/actors`:
- Consistent logging for debugging
- Consistent rating display (CineChance logo, not star icon)
- Proper TypeScript type safety on API responses

## Scenarios

### Scenario 1: Logger import and debug statements present

**Given** CreatorsClient.tsx is loaded
**When** The component fetches creator data
**Then** The component should have `logger` imported from `@/lib/logger`
**And** Should log debug messages: 'Creators API response', 'Creators data received', and per-creator progress

### Scenario 2: API response has proper type assertion

**Given** The fetch call to `/api/user/achiev_creators`
**When** The response JSON is parsed
**Then** It should have type assertion: `as { creators: CreatorAchievement[] }`
**And** This matches the pattern used in ActorsClient

### Scenario 3: Rating display uses CineChance logo

**Given** A creator has an `average_rating`
**When** The rating is displayed in the card
**Then** It should show the CineChance logo (`/images/logo_mini_lgt.png`)
**And** Use the same layout as ActorsClient (with Image component, rounded container)
**And** NOT show the star SVG icon

### Scenario 4: Color scheme preserved

**Given** The creators page is displayed
**When** Looking at the visual design
**Then** creators should use BLUE accent colors (amber for actors) - intentional differentiation
