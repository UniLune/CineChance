# Research: Serial Numbers on Movie Cards

## Точки интеграции

### Existing Components

**MovieCard** (`src/app/components/MovieCard.tsx`)
- Main component displaying individual movie card
- Already receives `priority` prop for lazy loading (0-6)
- Displays poster, title, rating badge, status icon
- Currently does NOT display any index/counter
- **Integration point**: Add `serialNumber` prop to `MovieCardProps`

**FilmGridWithFilters** (`src/app/components/FilmGridWithFilters.tsx`)
- Maps over movies array: `movies.map((movie, index) => ...)`
- Currently passes `index` only as `priority={index < 6}`
- index is NOT currently passed to MovieCard
- **Integration point**: Pass `index` prop to `MovieCard`

**MyMoviesPage** (`src/app/my-movies/page.tsx`)
- "Мои фильмы" page with tabs (watched, wantToWatch, dropped, hidden)
- Uses FilmGridWithFilters to display movies
- Correct location for serial numbers

### Existing Styles & Patterns

**MovieCard Positioning** (`src/app/components/MovieCard.tsx`)
- Uses `absolute` positioning for status icons: `top-2 right-2 z-10`
- Status icons: want (blue +), watched (green ✓), dropped (red ×), rewatched (purple ↻)
- **Positioning Strategy**: Place serial number at `top-2 left-2 z-20` to avoid overlap

**Tailwind Color Classes**
- Project uses amber/gold palette for branding (e.g., `bg-amber-600`)
- For "бледно золотистый" (pale golden):
  - `bg-amber-900/40` (pale gold, 40% opacity)
  - `text-amber-100/90` (light gold text, 90% opacity)
  - `shadow-sm` (subtle shadow)

## Существующие типы для переиспользования

### MovieCardProps Interface

The existing interface in `MovieCard.tsx` can be extended:

```typescript
interface MovieCardProps {
  movie: Media;
  restoreView?: boolean;
  initialIsBlacklisted?: boolean;
  initialStatus?: MediaStatus;
  showRatingBadge?: boolean;
  priority?: boolean;
  initialUserRating?: number | null;
  initialWatchCount?: number;
  initialAverageRating?: number | null;
  initialRatingCount?: number;
  // NEW: Add index for serial number display
  index?: number; // 0-based index, displayed as index + 1
}
```

**Implementation Pattern:**
- Use existing `absolute` positioning pattern (already used for status icons)
- Apply Tailwind classes for block-scoped, scoped styling
- Reuse existing z-index management (z-20 for overlay, z-10 for status icons)

## Как добавить фичу "порядковые номера"

### 1. Изменить MovieCardProps в MovieCard.tsx

Добавить новое свойство `index`:

```typescript
interface MovieCardProps {
  // ... существующие свойства
  index?: number;  // Порядковый номер в списке (0-based)
}
```

### 2. Изменить отображение в MovieCard.tsx

Добавить отображение номера в левом верхнем углу (чтобы не конфликтовать с иконками статуса):

```tsx
// В компоненте MovieCard, после статусной иконки (которая находится в top-2 right-2)
{index !== undefined && (
  <div className="absolute top-2 left-2 z-20 bg-amber-900/40 rounded px-1.5 py-0.5 text-xs text-amber-100/90 font-medium shadow-sm">
    {index + 1}
  </div>
)}
```

**Объяснение стилей:**
- `bg-amber-900/40`: Бледно-золотистый фон с 40% непрозрачностью
- `text-amber-100/90`: Светлый золотистый текст с 90% непрозрачностью
- `text-xs`: Маленький размер шрифта
- `px-1.5 py-0.5`: Небольшой padding для компактного вида
- `shadow-sm`: Едва заметная тень
- `z-20`: Выше чем иконки статуса (z-10)
- `absolute top-2 left-2`: В левом верхнем углу, не мешает статусам

### 3. Передать index из FilmGridWithFilters.tsx

Изменить вызов MovieCard в FilmGridWithFilters:

```tsx
{movies.map((movie, index) => (
  <div key={`${movie.id || 'unknown'}-${movie.media_type || 'unknown'}-${index}`} className="p-1">
    <MovieCardErrorBoundary>
      <MovieCard
        movie={movie}
        showRatingBadge={showRatingBadge}
        priority={index < 6}
        restoreView={restoreView}
        index={index}  // ← Добавить эту строку
        initialIsBlacklisted={getInitialIsBlacklisted ? getInitialIsBlacklisted(movie) : undefined}
        initialStatus={getInitialStatus ? getInitialStatus(movie) : initialStatus}
        initialAverageRating={movie.vote_average}
        initialRatingCount={movie.vote_count}
        initialUserRating={getInitialRating ? getInitialRating(movie) : undefined}
      />
    </MovieCardErrorBoundary>
  </div>
))}
```

### 4. Конфликт с существующими иконками

На карточке уже есть иконки статуса в `top-2 right-2`:
- StatusIcon показывает: want (blue +), watched (green ✓), dropped (red ×), rewatched (purple ↻)

**Решение:** Показывать номер слева: `top-2 left-2` - не конфликтует с существующими иконками статуса

### 5. Проверить другие страницы

**FilmGridWithFilters используется на:**
- `/src/app/my-movies/page.tsx` (Мои фильмы)
- `/src/app/movie-history/page.tsx` (История)
- `/src/app/recommendations/page.tsx` (Рекомендации)
- Возможно другие страницы

**Вопрос:** Нужны ли номера на всех страницах или только на "Мои фильмы"?

**Ответ пользователя:** "На странице Мои фильмы, во всех вкладках"

**Вывод:** Фича должна работать только на странице Мои фильмы (MyMoviesPage), но поскольку FilmGridWithFilters используется в разных местах, нужно:
1. Либо передавать флаг `showIndex={true}` в FilmGridWithFilters
2. Либо всегда показывать, если `index` передан

## Потенциальные риски

### 1. Визуальные конфликты

**Риск:** Номер может накладываться на другие элементы (статус, год, рейтинг)

**Митигация:**
- Использовать `left-2` вместо `right-2` (конфликт с иконками статуса)
- Использовать `z-20` (выше z-index для layering)
- Протестировать на всех размерах экрана

### 2. Изменение высоты карточки

**Риск:** Абсолютный элемент не влияет на layout, но может перекрывать контент

**Митигация:**
- Маленький размер (`text-xs`, `px-1.5 py-0.5`)
- Полупрозрачный фон (`bg-amber-900/40`) - не загораживает полностью

### 3. Пагинация

**Риск:** При бесконечной прокрутке индексы продолжают увеличиваться (1, 2, 3... 100)

**Примечание:** Это ожидаемое поведение - порядковый номер в общем списке

### 4. Сортировка

**Риск:** При изменении сортировки индексы изменятся

**Примечание:** Это ожидаемо - индексы отражают текущий порядок отображения

## Рекомендуемая структура файлов

### Для этой фичи

```
src/app/components/MovieCard.tsx
├── Добавить index?: number в MovieCardProps
├── Добавить отображение номера в JSX

src/app/components/FilmGridWithFilters.tsx
├── Добавить передачу index={index} в MovieCard

.planning/phases/21-serial-numbers/
├── PLAN.md
└── RESEARCH.md (этот файл)
```

## Что НЕ трогать

- `src/app/components/MovieCard.tsx` - только добавляем новое свойство, не изменяем существующую логику
- `src/app/components/FilmGridWithFilters.tsx` - только передаем проп, не изменяем логику
- Существующие иконки статуса - оставляем как есть
- Существующие цвета и стили - только добавляем новую информацию

## Тестирование

1. **Визуальное тестирование:**
   - Открыть "Мои фильмы" во всех вкладках
   - Проверить, что номера отображаются
   - Проверить, что не перекрывают другие элементы
   - Проверить на разных размерах экрана

2. **Функциональное тестирование:**
   - Проверить, что номера правильные (1, 2, 3...)
   - Проверить, что при смене сортировки номера обновляются
   - Проверить, что при бесконечной прокрутке номера продолжаются

3. **Тесты компонентов:**
   - Существующие тесты MovieCard должны пройти
   - Новые тесты для index prop не обязательны (опциональный проп)

---

**RESEARCH completed**: 2026-03-10
**Target Phase**: 21-serial-numbers