# RESEARCH: Taste Map DB Read Fix

## Problem Statement
На странице `/profile/taste-map` блоки "Любимые актеры" и "Любимые режиссеры" отображают данные, которые не соответствуют данным на страницах `/profile/actors` и `/profile/creators`.

## Root Cause Analysis

### Current Architecture

| Page | Server-side | Client-side Data Source |
|------|-------------|------------------------|
| `/profile/actors` | `computeUserPersonProfile()` → saves to `PersonProfile` table | `/api/user/achiev_actors` (computes from `WatchList`, NOT from `PersonProfile`) |
| `/profile/creators` | `computeUserPersonProfile()` → saves to `PersonProfile` table | `/api/user/achiev_creators` (computes from `WatchList`, NOT from `PersonProfile`) |
| `/profile/taste-map` | NONE (only `getTasteMap()`) | `/api/user/person-profile?personType=actor|director` (reads from `PersonProfile` table) |

### The Mismatch

1. **actors/creators pages**: Write to `PersonProfile`, but display data from legacy APIs (`achiev_actors`, `achiev_creators`) which compute ratings on-the-fly from `WatchList` + `MoviePersonCache`.
2. **taste-map page**: Reads from `PersonProfile` table via `/api/user/person-profile`.
3. **Result**: Data sources are completely different → different algorithms, different caching → different results.

### Verification

- `src/app/actors/page.tsx` line 19-22: calls `computeUserPersonProfile()` server-side
- `src/app/actors/ActorsClient.tsx` line 89: fetches `/api/user/achiev_actors`
- `src/app/taste-map/page.tsx` line 18: only calls `getTasteMap()`
- `src/app/taste-map/TasteMapClient.tsx` line 45: fetches `/api/user/person-profile`

## Solution Approach

**Goal**: Ensure taste-map reads EXACTLY the same data that actors/creators pages write to the database.

**Constraints**:
- Do NOT generate/compute data on taste-map page (generation happens on actors/creators)
- Do NOT call TMDB API from taste-map
- Read directly from `PersonProfile` table in PostgreSQL

**Implementation Strategy**:

1. **Server-side**: In `page.tsx`, read `PersonProfile` directly from DB using Prisma
2. **Client-side**: Pass pre-loaded data as props (no client-side fetching)
3. **No computation**: Only read what's already stored

### Proposed Changes

#### File: `src/app/profile/taste-map/page.tsx`

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { redirect } from 'next/navigation';
import { getTasteMap, computeTasteMap } from '@/lib/taste-map';
import { prisma } from '@/lib/prisma';
import type { PersonData } from '@/lib/taste-map/person-profile-v2';
import TasteMapClient from './TasteMapClient';

export default async function TasteMapPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/');

  // 1. Get taste map (unchanged)
  const tasteMap = await getTasteMap(session.user.id, () => computeTasteMap(session.user.id));

  // 2. Read PersonProfile from DB directly (no compute, no TMDB)
  const [actorProfile, directorProfile] = await Promise.all([
    prisma.personProfile.findUnique({
      where: { userId_personType: { userId: session.user.id, personType: 'actor' } },
    }),
    prisma.personProfile.findUnique({
      where: { userId_personType: { userId: session.user.id, personType: 'director' } },
    }),
  ]);

  // 3. Transform to client format: Array<[name, score]>
  const topActors: Array<[string, number]> = (actorProfile?.topPersons as PersonData[] || [])
    .slice(0, 10)
    .map(p => [p.name, p.avgWeightedRating]);

  const topDirectors: Array<[string, number]> = (directorProfile?.topPersons as PersonData[] || [])
    .slice(0, 10)
    .map(p => [p.name, p.avgWeightedRating]);

  // 4. Pass to client component
  return (
    <TasteMapClient
      tasteMap={tasteMap}
      userId={session.user.id}
      topActors={topActors}
      topDirectors={topDirectors}
    />
  );
}
```

#### File: `src/app/profile/taste-map/TasteMapClient.tsx`

```typescript
interface TasteMapClientProps {
  tasteMap: TasteMap | null;
  userId: string;
  topActors: Array<[string, number]>;      // New: from props
  topDirectors: Array<[string, number]>;   // New: from props
}

// Remove useEffect hooks that fetch data
// Use props directly:
// - topActors state initialized from props
// - topDirectors state initialized from props
// - Remove loadingActors/loadingDirectors states
```

### Benefits

- ✅ Guarantees reading from `PersonProfile` (DB)
- ✅ No race conditions, no client-side fetch delays
- ✅ Data exactly matches what `computeUserPersonProfile()` stored
- ✅ Better performance (no extra API calls)
- ✅ Clear separation: actors/creators = generate, taste-map = display

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| PersonProfile empty (user never visited actors/creators) | Taste-map shows empty actor/director lists | Expected behavior. Show "Нет данных" message. |
| Large topPersons array in JSON field | Performance | Slice to top 10 only. Prisma fetches full JSON but that's fine (< 10KB). |
| Type casting errors | Runtime errors | Use safe cast with fallback: `as PersonData[] || []` |

## Testing Strategy

### Acceptance Criteria

1. After visiting `/profile/actors`, top actors appear on `/profile/taste-map`
2. After visiting `/profile/creators`, top directors appear on `/profile/taste-map`
3. Data (names, scores) matches exactly between pages
4. No client-side API calls to `/api/user/person-profile` or `/api/user/achiev_*` from taste-map
5. Page loads faster (no additional network requests)

### Test Cases

1. **Unit**: Verify `page.tsx` reads from `prisma.personProfile` correctly
2. **Integration**: Mock DB with PersonProfile data, verify props passed to client
3. **E2E**: 
   - Add movie to watchlist with actors/directors
   - Visit actors page → triggers compute
   - Visit taste-map → shows same data
   - Compare values match

### Regression Checks

- Taste-map charts still work (genre, rating distribution)
- Empty state shows when no PersonProfile data
- No breaking changes to other taste-map functionality

## Files to Modify

1. `src/app/profile/taste-map/page.tsx`
2. `src/app/profile/taste-map/TasteMapClient.tsx`

## Implementation Order

1. Update `page.tsx` to fetch PersonProfile and pass as props
2. Update `TasteMapClient` to accept props and remove client fetch
3. Verify TypeScript compilation
4. Run existing tests to ensure no regressions
5. Manual smoke test

## Success Metrics

- Actor/director blocks show data from `PersonProfile`
- Data matches `GET /api/admin/person-profile-stats` (if exists)
- No console errors on taste-map page
- ESLint passes
- All existing tests pass
