# Plan 25-03 Summary: Remove Chart Visualizations from TasteMap

## Goal
Remove genre bar chart and rating pie chart visualization blocks from TasteMapClient, along with all supporting imports and variables. Keep only text-based metrics.

## Changes Made

### 1. `src/app/profile/taste-map/TasteMapClient.tsx`
- Removed `recharts` import (BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend)
- Removed `COLORS` constant (only used by chart data)
- Removed `genreData` variable (data for bar chart)
- Removed `ratingData` variable (data for pie chart)
- Removed `typeData` variable (already unused)
- Removed "Профиль жанров" bar chart JSX block (~30 lines)
- Removed "Распределение оценок" pie chart JSX block (~33 lines)
- Added JSDoc documentation to component and props interface
- File reduced from 250 lines → 165 lines (85 lines removed)

### 2. `.planning/phases/24-taste-map-db-read/tdd/spec-24-01-client.test.tsx`
- Changed test `should render genre profile section` to `should not render genre profile section (removed in phase 25)`
- Updated assertion from `toContain('Профиль жанров')` to `not.toContain('Профиль жанров')`
- Removed `toContain('recharts')` assertion

### 3. New TDD artifacts
- `acceptance-spec-25-03.md` — acceptance scenarios
- `acceptance-code-25-03.test.tsx` — 8 E2E tests
- `spec-25-03.md` — unit spec

## What Preserved
- Summary Stats (4 cards: average rating, positive/negative intensity, consistency, diversity)
- Computed Metrics Details (4 cards with descriptions)
- Behavior Profile (rewatch rate, drop rate, completion rate)
- TwinTasters component
- Empty state

## Tests
- Acceptance tests: 8/8 pass (new)
- Unit tests: 3/3 pass (updated)
- Full suite: 287 passed, 2 failed (pre-existing tsconfig timeout issues)
- Lint: Passes
- TypeScript: Compiles

## Files Modified
- `src/app/profile/taste-map/TasteMapClient.tsx` (250→165 lines)
- `.planning/phases/24-taste-map-db-read/tdd/spec-24-01-client.test.tsx` (65→64 lines)

## Files Created
- `.planning/phases/25-simplify-taste-map/tdd/acceptance-spec-25-03.md`
- `.planning/phases/25-simplify-taste-map/tdd/acceptance-code-25-03.test.tsx`
- `.planning/phases/25-simplify-taste-map/tdd/spec-25-03.md`
