# 2025-01-28 - TMDB API genre_ids Conversion Fix

## Problem Summary
**Media type display was broken on `/my-movies` and `/collection` pages:**
- Anime (Аниме) showed as "Фильм" (Movie)
- Cartoons (Мульт) showed as "Сериал" (TV Show)
- Other pages worked correctly (media type detected properly)

## Root Cause
TMDB API endpoints return different data structures:
- **Search API** (`/3/search/multi`): Returns `genre_ids: number[]` ✓
- **Details API** (`/3/movie/{id}`, `/3/tv/{id}`): Returns `genres: {id: number; name: string}[]` NOT `genre_ids`

Our code assumed `genre_ids` would exist in `/3/movie/{id}` responses, but it doesn't.
**Result:** `genre_ids` was undefined → fell back to `?? []` → empty array → no genre detection possible

## Detection Method
1. Browser console logs showed `genre_ids: []` for movies (even though Зверополис is obviously animated)
2. Traced back to API response: confirmed empty `genre_ids` in `/api/my-movies` response
3. Examined `/api/my-movies/route.ts` → `fetchMediaDetails()` function
4. Cross-referenced with TypeScript types in `src/lib/types/tmdb.ts`:
   - `TMDbMovieResponse` interface defined both `genres` and `genre_ids` as optional
   - But TMDB actually only sends `genres` in `/3/movie/{id}` endpoint

## Solution Implemented
Added automatic conversion in both API routes:

### File 1: `/src/app/api/my-movies/route.ts` (fetchMediaDetails function)
```typescript
// Convert genres to genre_ids for consistency with search API
if (!data.genre_ids && data.genres && Array.isArray(data.genres)) {
  data.genre_ids = data.genres.map((g: any) => g.id);
}
```

### File 2: `/src/app/api/collection/[id]/route.ts` (fetchMediaDetails function)
```typescript
let genreIds: number[] = [];
if (data.genres && Array.isArray(data.genres)) {
  genreIds = data.genres.map((g: any) => g.id);
} else if (data.genre_ids && Array.isArray(data.genre_ids)) {
  genreIds = data.genre_ids;
}
```

## Why This Works
1. After conversion, `genre_ids` array is populated with proper genre IDs
2. `getMediaTypeDisplay()` function can now detect:
   - **Anime:** `genre_ids.includes(16) && original_language === 'ja'`
   - **Cartoon:** `genre_ids.includes(16) && original_language !== 'ja'`
3. All downstream code works as designed

## Prevention
**This type of issue happens when:**
- External API changes structure between endpoints (TMDB: search vs details)
- TypeScript interfaces have optional fields that might not be populated
- Code assumes all interfaces have the same shape across endpoints

**How to prevent:**
1. Always test with real API responses, not just type definitions
2. When integrating external APIs, verify each endpoint returns expected fields
3. Add defensive checks: `data.genres ? convert(data.genres) : data.genre_ids`
4. Log actual TMDB response structure during debugging

## Verification
Test cases to verify fix is working:
1. Visit `/my-movies` in browser
2. Look for any anime or cartoon movies in your watchlist
3. Verify they show "Аниме" or "Мульт" badge instead of "Фильм"/"Сериал"
4. Same for `/collection/{id}` page

Known anime/cartoon test IDs:
- Зверополис (Zootopia) - ID 269149 - Should show "Мульт"
- For anime: Any Japanese animated movie should show "Аниме"

## Technical Details
- Code change: ~7 lines of logic added per file
- Performance: No impact (conversion happens once during API call)
- Backward compatibility: Fully compatible (handles both old and new data formats)
- Test coverage: Should cover all /my-movies and /collection display cases

## Files Modified
1. `/src/app/api/my-movies/route.ts` - Line ~60 in fetchMediaDetails()
2. `/src/app/api/collection/[id]/route.ts` - Line ~35 in fetchMediaDetails()

## Related Code
- Media type detection: `src/lib/mediaType.ts` - `getMediaTypeDisplay()`
- Movie card display: `src/app/components/MovieCard.tsx`
- Type definitions: `src/lib/types/tmdb.ts`
