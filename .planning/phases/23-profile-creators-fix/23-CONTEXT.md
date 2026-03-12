# Phase 23: Profile Creators Page Fix - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix /profile/creators page to match /profile/actors behavior. Both pages should have identical logic - the same data fetching, sorting, type safety, and UI patterns. This is a bug-fix/reconciliation phase, not adding new features.

</domain>

<decisions>
## Implementation Decisions

### API Sorting Logic
- Use `creator_score` for sorting (matching actors which use `actor_score`)
- Apply tie-breakers: score first, then average_rating, then progress_percent, then name
- Apply sorting to BOTH singleLoad and paginated modes (not just singleLoad)

### Client Component Parity
- Add `logger` import and debug logging statements to CreatorsClient.tsx (matching ActorsClient.tsx)
- Use CineChance logo for average rating display (matching actors pattern)
- Keep different color scheme intentionally (amber for actors, blue for creators - visual differentiation)

### Type Safety
- Add type assertion to CreatorsClient API response: `as { creators: CreatorAchievement[] }`
- Fix `any` types in achiev_creators API route (filteredCrewDetails array)

### Filtering Verification
- Verify anime/cartoon filtering in creators API matches actors API behavior
- Both should filter: anime (genre 16 + Japanese) and cartoons (genre 16 + non-Japanese)

</decisions>

<specifics>
## Specific Ideas

- Current creators sorting differs from actors - actors sort by calculated `actor_score`, creators sort by `average_rating` then `progress_percent`
- CreatorsClient missing logger imports that exist in ActorsClient
- CreatorsClient uses star icon for rating, actors use CineChance logo
- CreatorsClient API response lacks type assertion

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

*Phase: 23-profile-creators-page-fix*
*Context gathered: 2026-03-12*
