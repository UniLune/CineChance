# 2025-01-27 - Исправление алгоритма Twin Tasters: Только просмотренные фильмы

## Проблема

Алгоритм сравнения вкусов смотрел **ВСЕ фильмы** в списках пользователей (включая "Хочу посмотреть"), но правильнее было бы сравнивать только **просмотренные/пересмотренные** фильмы, потому что:

1. Только просмотренные фильмы имеют реальную оценку пользователя
2. Фильмы в списке "Хочу посмотреть" еще не смотрели, поэтому оценки могут быть случайными
3. Это обеспечивает более точное определение совместимости вкусов

## Решение

### 1. Изменена функция `computeRatingCorrelation` в `similarity.ts`

**Было:**
```typescript
const watchListA = await prisma.watchList.findMany({
  where: { userId: userIdA },
  select: { tmdbId: true, userRating: true },
});
```

**Стало:**
```typescript
const watchListA = await prisma.watchList.findMany({
  where: { 
    userId: userIdA,
    statusId: { in: COMPLETED_STATUS_IDS },  // Только watched + rewatched
  },
  select: { tmdbId: true, userRating: true },
});
```

**Добавлен импорт:**
```typescript
import { MOVIE_STATUS_IDS } from '@/lib/movieStatusConstants';

const COMPLETED_STATUS_IDS = [MOVIE_STATUS_IDS.WATCHED, MOVIE_STATUS_IDS.REWATCHED];
```

### 2. Изменен API endpoint `/api/user/taste-map-comparison/[userId]/route.ts`

Все запросы к БД для получения watch lists теперь фильтруют только просмотренные фильмы:

```typescript
// Get watch counts (only completed watches)
const currentCount = await prisma.watchList.count({ 
  where: { 
    userId: currentUserId,
    statusId: { in: COMPLETED_STATUS_IDS },
  } 
});

// Get shared watched movies
const currentWatchlist = await prisma.watchList.findMany({
  where: { 
    userId: currentUserId,
    statusId: { in: COMPLETED_STATUS_IDS },  // Фильтр добавлен
  },
  select: { tmdbId: true, userRating: true, title: true },
});
```

## Затронутые Компоненты

| Компонент | Статус | Описание |
|-----------|--------|---------|
| `similarity.ts` | ✅ ИСПРАВЛЕНО | Функция computeRatingCorrelation теперь смотрит только просмотренные |
| `API: taste-map-comparison` | ✅ ИСПРАВЛЕНО | Все запросы фильтруют по статусу |
| Тастовая карта (genreProfile) | ✅ УЖЕ ПРАВИЛЬНО | Уже использовала COMPLETED_STATUS_IDS |
| API: similar-users | ✅ ОК | Использует computeSimilarity, которая уже исправлена |

## Трассировка Данных

**До исправления:**
```
Twin Taster Card → API: similar-users → computeSimilarity()
  ├─ tasteSimilarity: ✅ Правильно (только watched)
  ├─ ratingCorrelation: ❌ ВСЕ фильмы (want + watched)
  └─ personOverlap: ✅ Правильно (только watched)

Comparison Page → API: taste-map-comparison
  ├─ sharedMovies: ❌ ВСЕ общие (want + watched)
  └─ watchCounts: ❌ ВСЕ фильмы
```

**После исправления:**
```
Twin Taster Card → API: similar-users → computeSimilarity()
  ├─ tasteSimilarity: ✅ Только watched
  ├─ ratingCorrelation: ✅ Только watched + их пересечение
  └─ personOverlap: ✅ Только watched

Comparison Page → API: taste-map-comparison
  ├─ sharedMovies: ✅ Только общие watched/rewatched
  └─ watchCounts: ✅ Только watched/rewatched
```

## Статусы Фильмов (константы)

```
WANT_TO_WATCH = 1  (Хочу посмотреть)
WATCHED = 2        (Просмотрено)      ← Используется
DROPPED = 3        (Брошено)
REWATCHED = 7      (Пересмотрено)     ← Используется
```

## Файлы Изменены

1. `/workspaces/CineChance/src/lib/taste-map/similarity.ts`
   - Добавлен импорт MOVIE_STATUS_IDS
   - Добавлена константа COMPLETED_STATUS_IDS
   - Обновлена функция computeRatingCorrelation с фильтром
   - Обновлены комментарии в computeSimilarity

2. `/workspaces/CineChance/src/app/api/user/taste-map-comparison/[userId]/route.ts`
   - Добавлен импорт MOVIE_STATUS_IDS
   - Добавлена константа COMPLETED_STATUS_IDS
   - Обновлены запросы для watch count
   - Обновлены запросы для shared movies
   - Улучшены комментарии документации

## Влияние на Метрики

**Возможные изменения в результатах:**

1. **Совместимость вкусов может снизиться** для некоторых пар пользователей
   - Раньше: "хочу посмотреть" фильмы могли совпадать просто случайно
   - Теперь: только реальные просмотры считаются

2. **Более точные рекомендации похожих пользователей**
   - Пользователи будут подобраны на основе реального вкуса, а не планов

3. **Меньше shared movies в сравнении**
   - Четкий фильтр на просмотренные означает более честное сравнение

## Тестирование

После деплоя нужно проверить:
1. Нажать на Twin Taster карточку
2. Открыть страницу сравнения для конкретной пары пользователей
3. Убедиться что `commonWatchedCount` показывает только просмотренные фильмы
4. Проверить что метрики соответствуют Pearson correlation только для watched movies

### API Test

```bash
curl http://localhost:3000/api/user/taste-map-comparison/cmkouv7y9000004kvgjzdrnhj \
  -H "Authorization: Bearer <jwt-token>"
```

Ожидается:
- `myWatchedCount` и `theirWatchedCount` показывают только watched/rewatched
- `commonWatchedCount` даёт честное число общих просмотренных
- `metrics.ratingCorrelation` основана на разной выборке (не ВСЕ фильмы)

## Заметки для Архитектора

**Pattern для будущего:**
Если в любых других местах вычисляется similarity пользователей, убедитесь что используется фильтр `statusId: { in: COMPLETED_STATUS_IDS }` при работе с watchList.

**Почему важно:**
- Вкусовые профили должны быть консистентны (одни и те же статусы везде)
- "Хочу посмотреть" это временное состояние, не вкус
- Рейтинговая корреляция требует реальных оценок

---

**Дата:** 2025-01-27  
**Статус:** IMPLEMENTED  
