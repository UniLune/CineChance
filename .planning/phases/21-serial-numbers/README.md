# Phase 21: Serial Numbers Feature

## Overview
Added sequential order numbers (1, 2, 3...) to movie cards in the "Мои фильмы" (My Movies) page.

## Purpose
Allow users to verify the total count of loaded results by seeing the last number on the card (e.g., if last card shows "10", user knows there are 10 movies loaded).

## Implementation

### MovieCard.tsx
- Added `index?: number` prop to `MovieCardProps` interface
- When `index` is provided, displays order number (index + 1) in top-left corner
- Styling: small, pale golden/amber text that is unobtrusive
- Position: `absolute top-0 left-0` with `z-10` to avoid overlapping status icons

### FilmGridWithFilters.tsx
- Passes `index={index}` to each `MovieCard` in the map loop
- Uses the array index from `movies.map((movie, index) => ...)`

## Files Modified
- `src/app/components/MovieCard.tsx`
- `src/app/components/FilmGridWithFilters.tsx`

## Test Command
```bash
npm run test:ci
```
