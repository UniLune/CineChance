# 2025-01-27 - Next.js 16 Async Params in Dynamic Route Handler

## Problem Description

Error when accessing taste map comparison page: `Failed to load comparison {}` with empty error object in browser console. The API route `/api/user/taste-map-comparison/[userId]` was receiving requests but returning errors with no clear error message.

**Error Context:**
- Occurred when clicking on "Twin Taster" card to view detailed taste comparison
- Error object was empty: `{}`
- Indicated either a network error or route handler failure before proper error handling

**Affected Files:**
- `src/app/profile/taste-map/compare/[userId]/page.tsx` - Comparison detail page (client)
- `src/app/api/user/taste-map-comparison/[userId]/route.ts` - Comparison API endpoint (server)

## Root Cause Analysis

**Primary Issue:** Next.js 15+ (adopted in 16.1.6) changed how async dynamic route parameters are handled.

In Next.js 14 and earlier, route parameters were synchronous objects:
```typescript
// Next.js 14: params are synchronous
{ params }: { params: { userId: string } }
```

In Next.js 15+, route parameters can be **Promises** (async), especially in certain conditions:
```typescript
// Next.js 15+: params can be Promise
{ params }: { params: Promise<{ userId: string }> }
```

**Why This Matters:**
- Route handler tried to access `params.userId` directly without awaiting
- When params came as a Promise, accessing `.userId` would return `undefined`
- Accessing `undefined.userId` or using undefined userId in database queries caused silent failures
- Error object was empty because the failure happened before try/catch blocks

## Solution Implemented

### 1. Updated Type Signature (Required)

```typescript
// BEFORE
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
)

// AFTER
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> | { userId: string } }
)
```

**Why:** By accepting both Promise and direct object, we handle both Next.js versions and edge cases.

### 2. Resolve Params Immediately

```typescript
// Add at start of handler
const resolvedParams = await Promise.resolve(params);
const { userId } = resolvedParams;
```

**Why:** 
- `Promise.resolve()` works with both Promise and non-Promise values
- If `params` is already an object, it returns immediately
- If `params` is a Promise, it awaits and returns the value
- This ensures `userId` is always a string, never undefined

### 3. Use Resolved Parameter Throughout

```typescript
// BEFORE
const comparedUserId = params.userId;

// AFTER
const comparedUserId = userId;  // From resolvedParams
```

**Why:** Uses extracted, resolved value instead of potentially undefined param.

### 4. Enhanced Error Logging & Messages

Added detailed logging with stack traces and context:

```typescript
catch (error) {
  logger.error('Failed to get taste map comparison', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,  // NEW: stack trace
    context: 'TasteMapComparisonAPI',
    userId,  // NEW: helps debug which user caused issue
  });

  return NextResponse.json(
    { 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error)  // NEW: details sent to client
    },
    { status: 500 }
  );
}
```

On client side (page.tsx), improved error interpretation:

```typescript
if (err instanceof Error && err.message.includes('API returned')) {
  if (err.message.includes('404')) {
    displayError = 'Пользователь не найден';
  } else if (err.message.includes('500')) {
    displayError = 'Ошибка сервера при расчёте сравнения';
  }
}
```

## Files Modified

1. **src/app/api/user/taste-map-comparison/[userId]/route.ts**
   - Updated GET function signature for async params
   - Added `await Promise.resolve(params)` resolution
   - Updated userId reference to use resolved value
   - Enhanced error logging with stack traces

2. **src/app/profile/taste-map/compare/[userId]/page.tsx**
   - Improved error handling in useEffect
   - Better error messages based on HTTP status
   - Added detailed logging with comparedUserId context

## Testing

Run the comparison API test:
```bash
node test-comparison-api.js
```

Or test manually:
1. Navigate to `/profile/taste-map`
2. Click on a "Twin Taster" card
3. Verify comparison page loads without errors
4. Check browser DevTools console - should see success logs, not errors
5. Check server logs for detailed metrics about the comparison

## Prevention

This issue likely affects all dynamic route handlers with parameters in projects using Next.js 15+. 

**To prevent similar issues:**

1. **Always handle async params** in all route handlers:
   ```typescript
   { params }: { params: Promise<Record<string, string>> | Record<string, string> }
   const resolvedParams = await Promise.resolve(params);
   ```

2. **Never assume params are synchronous** - always await Promise.resolve()

3. **Add stack traces to error logs** for better debugging:
   ```typescript
   stack: error instanceof Error ? error.stack : undefined,
   ```

4. **Never pass empty error objects** to clients - always include details:
   ```typescript
   { error: 'message', details: error.message }
   ```

## Related Issues

Similar patterns might affect:
- All dynamic route handlers: `/api/[id]/route.ts`
- All dynamic page components: `/post/[id]/page.tsx`
- Any middleware checking params

**Recommendation:** Audit all dynamic routes in the project for params handling.

## References

- Next.js 15.1 release notes: Async route parameters
- [Next.js App Router Dynamic Routes](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes)
- Project: CineChance taste map comparison feature

## Verification Status

✅ Code changes applied
✅ Syntax validated
⏳ Runtime testing pending (execute test-comparison-api.js after dev server starts)

---

**Last Updated:** 2025-01-27
**Status:** RESOLVED (pending runtime verification)
