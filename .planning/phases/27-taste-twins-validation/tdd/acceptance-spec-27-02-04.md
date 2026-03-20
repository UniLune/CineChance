# Acceptance Spec: Admin Taste Map Dashboard

**User Story**
> As an admin, I want a dashboard to view similarity scores statistics and trigger cleanup/computation operations, so that I can manage the Taste Twins system.

**Acceptance Criteria**
1. Page accessible only to admin users (server-side check with redirect)
2. Displays stats:
   - Total SimilarityScore count
   - Unique users count
   - Average match percentage (as percentage)
   - Last computed timestamp
   - Scheduler last run timestamp
3. Buttons:
   - "Очистить сиротские записи" → POST `/api/admin/cleanup/similarity?type=orphaned`
   - "Очистить старые записи (>365 дней)" → calls `deleteOldSimilarityScores()` (optional, can be omitted)
   - "Пересчитать все" → POST `/api/admin/compute-similarities`
4. Buttons show loading state and refresh stats after successful action
5. Page auto-refreshes stats periodically (e.g., every 30 seconds) or has manual refresh button
6. Uses existing admin layout (AdminSidebar) and styling patterns
7. Shows toast notifications on success/error
8. Handles API errors gracefully (401, 429, 500)

**Scenario: Admin visits taste map dashboard**
Given:
- Admin user is authenticated (`session.user.id === ADMIN_USER_ID`)
- User navigates to `/admin/taste-map`

When page loads

Then:
- Server checks admin privileges (redirects if not admin)
- Page renders with stats cards showing:
  - Total SimilarityScore count (from `totalScores`)
  - Unique users count (from `uniqueUsers`)
  - Average match percentage (from `averageMatch`, e.g., "75.5%")
  - Last computed timestamp (formatted, e.g., "2024-01-15 14:30:00" or "N/A")
  - Scheduler last run timestamp (formatted, e.g., "2024-01-15 10:00:00" or "N/A")
- Three action buttons are visible:
  - "Очистить сиротские записи"
  - "Очистить старые записи (>365 дней)" (if implemented)
  - "Пересчитать все"
- Buttons are enabled and styled consistently with admin UI
- Stats are loaded via `GET /api/admin/compute-similarities` or server-side fetch

**Scenario: Non-admin redirected**
Given:
- Non-admin user is authenticated (`session.user.id !== ADMIN_USER_ID`)
- User navigates to `/admin/taste-map`

When page renders

Then:
- Server redirects to `/` (home page)
- No admin content is shown

**Scenario: Admin triggers orphan cleanup**
Given:
- Admin user is on `/admin/taste-map`
- Orphaned SimilarityScore records exist (3 records)
- Page shows stats: totalScores = 100, uniqueUsers = 50

When admin clicks "Очистить сиротские записи"

Then:
- Button shows loading state (disabled, spinner/text "Очистка...")
- POST request sent to `/api/admin/cleanup/similarity?type=orphaned`
- Response: `{ success: true, deleted: 3, orphans: [...] }`
- Success toast: "Удалено 3 сиротских записей"
- Stats refresh automatically (new totalScores = 97)
- Button returns to enabled state

**Scenario: Admin triggers old records cleanup**
Given:
- Admin user is on `/admin/taste-map`
- Old records (>365 days) exist (5 records)
- Button "Очистить старые записи" is present

When admin clicks "Очистить старые записи (>365 дней)"

Then:
- Button shows loading state (disabled, spinner/text "Очистка...")
- Client calls internal API route that executes `deleteOldSimilarityScores(365)`
- Success toast: "Удалено 5 старых записей"
- Stats refresh automatically (new totalScores decreases by 5)
- Button returns to enabled state

**Scenario: Admin triggers full recomputation**
Given:
- Admin user is on `/admin/taste-map`
- Stats show: totalScores = 100, uniqueUsers = 50

When admin clicks "Пересчитать все"

Then:
- Button shows loading state (disabled, spinner/text "Вычисление...")
- POST request sent to `/api/admin/compute-similarities`
- Response: `{ success: true, result: { processed: 50, computed: 100, errors: 0, duration: 12000, timestamp: "..." }, stats: { ... } }`
- Success toast: "Обработано 50 пользователей, вычислено 100 записей"
- Stats refresh to latest values (lastComputed updated, averageMatch recalculated)
- Button returns to enabled state

**Scenario: Auto-refresh updates stats**
Given:
- Admin user is on `/admin/taste-map`
- Initial stats loaded at time T0

When:
- Auto-refresh interval elapses (30 seconds) OR admin clicks manual refresh button

Then:
- GET request sent to `/api/admin/compute-similarities` (or equivalent endpoint)
- Stats cards update with fresh data
- Timestamps show latest values
- No page reload required

**Scenario: Error handling - cleanup failure**
Given:
- Admin user is on `/admin/taste-map`

When admin clicks cleanup button and API returns 500 error

Then:
- Button disabled during request, re-enabled after response
- Error toast appears: "Ошибка при очистке: <error message>"
- Stats remain unchanged (no refresh on error)

**Scenario: Error handling - unauthorized on refresh**
Given:
- Admin user is on `/admin/taste-map`
- Session expires during background refresh

When refresh request returns 401

Then:
- No crash or infinite loop
- Optional: redirect to home page with auth error toast
- Stats show last known values until user navigates away

**Edge Cases**
- API rate limited (429) → shows error toast "Слишком много запросов", button re-enables
- Network error (fetch fails) → shows generic error toast "Ошибка сети", button re-enables
- Empty SimilarityScore table → stats show zeros or "N/A" appropriately
- No orphaned records → success toast "Удалено 0 сиротских записей" or "Сиротские записи не найдены"
- Component unmounts during request → cleanup to prevent memory leaks and state updates on unmounted component
- Timestamps are null/undefined → display "N/A" or "—" without throwing errors
- `deleteOldSimilarityScores` API missing → optional feature, button not rendered or shows "Не поддерживается"
- Auto-refresh interval too frequent → respects minimum interval (e.g., 30s) to avoid excessive requests

**Implementation Notes**
- Admin USER_ID source: `process.env.ADMIN_USER_ID`
- Admin check (server-side): 
  ```typescript
  const ADMIN_USER_ID = process.env.ADMIN_USER_ID || 'cmkbc7sn2000104k3xd3zyf2a';
  if (session.user.id !== ADMIN_USER_ID) redirect('/');
  ```
- Page can be Server Component (async) or use Client Component with `useEffect` for auto-refresh. Recommended: Server Component + Client Component wrapper for interactivity.
- Stats API: use `GET /api/admin/compute-similarities` (existing endpoint returns stats in `response.stats`)
- Cleanup API: `POST /api/admin/cleanup/similarity?type=orphaned` (existing endpoint)
- Compute API: `POST /api/admin/compute-similarities` (existing endpoint, returns updated stats in response)
- Old records cleanup: either create new endpoint or implement client-side call to server action; optional per AC. If omitted, don't render button.
- Refresh mechanism:
  - Option A: `setInterval` in client component calling `/api/admin/compute-similarities` every 30s
  - Option B: Manual refresh button only (simpler, avoids background requests)
  - Button state: `const [isRefreshing, setIsRefreshing] = useState(false)`
- Stats formatting:
  - Average match: multiply by 100 and format as percentage: `(averageMatch * 100).toFixed(1) + '%'`
  - Timestamps: `new Date(timestamp).toLocaleString('ru-RU')` or "N/A" if null
- Toast notifications: use existing `useToast` hook: `toast({ title, description, variant })`
- Loading states: button `disabled` attribute + optional spinner icon or text change
- Styling: follow existing admin patterns from `src/app/admin/page.tsx` (gray-800/700 colors, rounded-xl, icons)
- Layout: Use AdminSidebar component, main content area with stats grid + actions section
- Auto-refresh: implement via `setInterval` with cleanup on unmount, debounce to prevent overlapping requests

**Related Files**
- New page: `src/app/admin/taste-map/page.tsx` (to be created)
- API cleanup: `src/app/api/admin/cleanup/similarity/route.ts` (existing)
- API compute & stats: `src/app/api/admin/compute-similarities/route.ts` (existing, has GET for stats)
- Stats function: `src/lib/taste-map/similarity-storage.ts` (has `getSimilarityScoreStats()`)
- Cleanup function (old records): `src/lib/taste-map/similarity-storage.ts` (has `deleteOldSimilarityScores()`)
- Admin layout: `src/app/admin/AdminSidebar.tsx`, `src/app/admin/page.tsx`
- Auth: `src/auth.ts` (session handling)
- Toast hook: `src/hooks/use-toast.ts` (verify)
- Env config: `.env.local` (ADMIN_USER_ID)

**Dependencies**
- Admin authentication must be functional
- API endpoints must be implemented and tested:
  - `POST /api/admin/cleanup/similarity` (acceptance-spec-27-02-02)
  - `POST /api/admin/compute-similarities` (acceptance-spec-27-02-01 or existing)
  - `GET /api/admin/compute-similarities` (existing, returns stats)
- `getSimilarityScoreStats()` utility must return correct shape:
  ```typescript
  {
    totalScores: number;
    uniqueUsers: number;
    averageMatch: number; // 0-1
    lastComputed: Date | null;
    schedulerLastRun: Date | null;
  }
  ```
- Toast notification system must be available
- Admin USER_ID environment variable must be set

**Optional Features**
- "Очистить старые записи (>365 дней)" button may be omitted if no API endpoint exists (create separate endpoint or use server action). If implemented, button should only appear if `deleteOldSimilarityScores()` is callable via API.

**Non-Functional Requirements**
- Page must load within 2 seconds on cold start (stats queries optimized)
- Auto-refresh must not cause UI flicker or jump
- All buttons must provide feedback on click (loading state)
- Error messages should be user-friendly but informative for admin
- Timestamps should use timezone-aware formatting (local time or UTC with indicator)
- Responsive design: stats grid adapts to screen size (1 col mobile, 2 tablet, 4 desktop)
