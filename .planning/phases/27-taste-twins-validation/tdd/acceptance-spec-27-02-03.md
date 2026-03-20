# Acceptance Spec: Add Cleanup Button to TwinTasters Component

**User Story**
> As an admin, I want to trigger orphan cleanup directly from the TwinTasters block, so that I can quickly clean up without navigating to admin page.

**Acceptance Criteria**
1. Button appears only if current user is admin (`session.user.id === ADMIN_USER_ID`)
2. Button labeled "Очистить кеш близнецов" with trash/cleanup icon
3. Positioned in header row next to existing tooltip button (flex row, right-aligned)
4. On click, sends POST request to `/api/admin/cleanup/similarity?type=orphaned`
5. Shows loading state: button disabled, spinner/icon animation, text "Очистка..."
6. On success (200), shows toast: `Удалено X сиротских записей` (X from response.deleted)
7. On error (401/500), shows error toast with response message
8. Prevents concurrent clicks (button disabled during request)
9. Button styled consistently with existing UI (gray-400 hover:purple-400)
10. Uses existing toast system (from `@/hooks/use-toast` or similar)

**Scenario: Admin sees cleanup button**
Given:
- Admin user is authenticated (`session.user.id === ADMIN_USER_ID`)
- User visits taste map page with TwinTasters component

When TwinTasters component renders

Then:
- Button with text "Очистить кеш близнецов" (or icon + text) is visible in header row
- Button is positioned to the left of the existing tooltip button (or alongside it)
- Button has appropriate styling and hover states
- Button is enabled and clickable

**Scenario: Non-admin does not see cleanup button**
Given:
- Non-admin user is authenticated (`session.user.id !== ADMIN_USER_ID`)
- User visits taste map page

When TwinTasters component renders

Then:
- No cleanup button is rendered in the component
- Tooltip button (existing) is still visible

**Scenario: Admin triggers cleanup - success**
Given:
- Admin user is authenticated
- TwinTasters component is rendered with cleanup button visible
- Orphaned similarity records exist (3 records)

When admin clicks cleanup button

Then:
- Button becomes disabled immediately
- Button shows loading state (spinner or "Очистка..." text)
- POST request sent to `/api/admin/cleanup/similarity?type=orphaned`
- Response: `{ success: true, deleted: 3, orphans: [...], message: "..." }`
- Success toast appears: "Удалено 3 сиротских записей"
- Button re-enables after response
- Component state not affected (twins list unchanged)

**Scenario: Admin triggers cleanup - error**
Given:
- Admin user is authenticated
- Component is rendered

When admin clicks cleanup button and API returns error (401 or 500)

Then:
- Button becomes disabled during request
- Error toast appears with message from response (fallback to "Ошибка при очистке")
- Button re-enables after response
- No successful toast shown

**Scenario: Concurrent clicks prevented**
Given:
- Admin user clicked cleanup button and request is still pending

When admin clicks button again

Then:
- Second click is ignored (button is disabled)
- Only one request is sent

**Edge Cases**
- API rate limited (429) → shows error toast "Слишком много запросов"
- Network error (fetch fails) → shows generic error toast "Ошибка сети"
- No orphaned records → success toast: "Удалено 0 сиротских записей" or "Сиротские записи не найдены"
- Component unmounts during request → cleanup to prevent memory leaks
- Session expires during request → 401 error toast shown

**Implementation Notes**
- Admin USER_ID source: `process.env.ADMIN_USER_ID`
- Check admin: `const isAdmin = session.user.id === ADMIN_USER_ID`
- Button placement: modify header flex container (line 115-130) to include cleanup button alongside tooltip
- Import toast: `import { useToast } from '@/hooks/use-toast'` (verify existing pattern in codebase)
- Request pattern:
  ```typescript
  const response = await fetch('/api/admin/cleanup/similarity?type=orphaned', {
    method: 'POST',
    credentials: 'include',
  });
  const data = await response.json();
  ```
- Button variant: `className="text-gray-400 hover:text-purple-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"`
- Icon: Trash icon from Heroicons or similar: `<svg>...</svg>` or use text-only if simpler
- Loading state: replace icon with spinner or change text to "Очистка..."
- Position: flex row with `justify-between` on header (line 115), add button to right side alongside tooltip
- Error handling: check `response.ok`, handle non-200 status codes
- Toast messages: use `toast({ title, description, variant })` pattern
- No state refresh needed (orphan cleanup doesn't affect displayed twins list)
- Verify ADMIN_USER_ID env var exists in `.env.example` and runtime config

**Related Files**
- Component: `src/app/profile/taste-map/TwinTasters.tsx`
- API endpoint: `src/app/api/admin/cleanup/similarity/route.ts` (should exist from phase 27-02-02)
- Auth: `src/auth.ts` (session handling)
- Toast hook: `src/hooks/use-toast.ts` (verify location)
- Env config: `.env.local`, `.env.example`

**Dependencies**
- Requires API endpoint implementation (acceptance-spec-27-02-02) to be completed first
- Admin authentication must be functional
- Toast notification system must be available