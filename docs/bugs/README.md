# 🐛 База знаний: Ошибки и Решения

> **Обновлено:** 2025-01-27  
> **Новый формат:** GSD Debug Sessions  
> **Мигрировано:** 17 отчётов → 5 системных анализов

---

## 🔴 Свежие Исправления (2025-01-28)

### 0. TMDB API: Отсутствие genre_ids в Details Endpoints
**Файл:** [`2025-01-28-tmdb-genre-ids-conversion.md`](./2025-01-28-tmdb-genre-ids-conversion.md)

**Проблема:** На `/my-movies` и `/collection` страницах Аниме показывались как "Фильм", Мультфильмы как "Сериал"

**Причина:** TMDB API возвращает разные структуры:
- `search/multi` → `genre_ids: number[]` ✓
- `movie/{id}` → `genres: {id, name}[]` ✗ (нет `genre_ids`)

Код ожидал `genre_ids`, получал `undefined`, использовал fallback `[]`

**Решение:** Автоматическое преобразование `genres` в `genre_ids` в обоих API маршрутизаторах

**Затронутые файлы:**
- `src/app/api/my-movies/route.ts` - fetchMediaDetails добавлен конверт genres→genre_ids
- `src/app/api/collection/[id]/route.ts` - fetchMediaDetails добавлен конверт genres→genre_ids

---

## 🔴 Свежие Исправления (2025-01-27)

### 1. Twin Tasters: Три Паттерна Совпадения Оценок
**Файл:** [`2025-01-27-twin-tasters-rating-patterns.md`](./2025-01-27-twin-tasters-rating-patterns.md)

**Проблема:** Алгоритм показывал только Pearson корреляцию, не показывая полную картину совместимости вкусов

**Решение:** Добавлены три паттерна анализа:
- **Паттерн 1:** Абсолютные совпадения (одинаковые оценки, ±1, ±2)
- **Паттерн 2:** Категории интенсивности (обе в категории 1-3 vs обе в 8-9?)
- **Паттерн 3:** Интенсивность вкуса (средняя оценка показывает позитивность вкуса)

**Затронутые файлы:**
- `src/lib/taste-map/similarity.ts` - добавлены константы, интерфейсы, функции
- `src/app/api/user/taste-map-comparison/[userId]/route.ts` - возврат `ratingPatterns`
- `src/app/profile/taste-map/compare/[userId]/page.tsx` - новая UI секция для паттернов

### 2. Twin Tasters: Только Просмотренные Фильмы
**Файл:** [`2025-01-27-twin-tasters-only-watched-movies.md`](./2025-01-27-twin-tasters-only-watched-movies.md)

**Проблема:** Алгоритм смотрел ВСЕ фильмы в списках (включая "Хочу посмотреть")

**Решение:** Фильтр на только watched/rewatched фильмы для честного сравнения оценок

### 3. Next.js 16: Async Params in Dynamic Routes
**Файл:** [`2025-01-27-nextjs-async-params-in-dynamic-routes.md`](./2025-01-27-nextjs-async-params-in-dynamic-routes.md)

**Проблема:** API endpoints с динамическими параметрами возвращали ошибки с пустым error object

**Решение:** Обработка параметров как Promise в Next.js 15+

---

## 📋 Новая Структура

### Где Искать Отчёты

**Активные сессии (текущие баги):**
```
.planning/debug/*.md
```

**Решённые инциденты:**
```
.planning/debug/resolved/*.md
```

### Типы Документов

| Тип | Расположение | Описание |
|-----|-------------|----------|
| **Debug Session** | `.planning/debug/[name].md` | Активная отладка |
| **Resolved Session** | `.planning/debug/resolved/[name].md` | Завершённые инциденты |
| **Systemic Reflection** | `.planning/debug/resolved/SYSTEMIC_REFLECTION.md` | Системный анализ |

---

## 📚 Индекс Решённых Инцидентов

### Пагинация
**Файл:** [`pagination-system-failures.md`](./resolved/pagination-system-failures.md)

**Были объединены:**
- 2026-02-13-pagination-duplicate-movies
- 2026-02-14-pagination-missing-stats-pages  
- 2026-02-16-anime-cartoon-filters (pagination component)

**Ключевые выводы:**
- Пагинация реализована в 4+ местах с одинаковыми багами
- Отсутствие secondary sort по ID приводило к нестабильной сортировке
- hasMore рассчитывался на основе неотфильтрованных данных

---

### Rate Limiting
**Файл:** [`rate-limiting-architecture-failures.md`](./resolved/rate-limiting-architecture-failures.md)

**Были объединены:**
- 2026-02-15-stats-rate-limit
- 2026-02-09-image-proxy-rate-limit-cache
- SEARCH_FIXES.md (rate limit component)
- 2026-02-09-infinite-slow-loading-loop (rate limit component)

**Ключевые выводы:**
- Rate limiting проверялся до auth и cache
- IP-based limiting ломал corporate NAT пользователей
- Ошибки 429 кешировались на 24 часа

---

### Статусы и Отображение
**Файл:** [`status-display-consistency-failures.md`](./resolved/status-display-consistency-failures.md)

**Были объединены:**
- 2026-02-15-genre-stats-incorrect-status-display
- 2026-02-13-my-movies-incorrect-status-display
- 2026-02-15-stats-mismatch

**Ключевые выводы:**
- API возвращали разные структуры статусов
- DROPPED статус добавлялся частично, вызывая несоответствия
- Отсутствие единого маппинга statusId ↔ statusName

---

### Кеширование и Изображения
**Файл:** [`caching-architecture-failures.md`](./resolved/caching-architecture-failures.md)

**Были объединены:**
- 2026-02-13-actor-photo-slow-loading
- 2026-02-13-profile-average-rating-fix
- POSTER_MOBILE_FIX_FINAL.md
- 2026-02-09-infinite-slow-loading-loop (caching component)

**Ключевые выводы:**
- Redis сериализация: объекты сохранялись как строки
- Placeholder ошибок кешировались на 24 часа
- Mobile Chrome требовал server-side proxy для CORS

---

### API и Архитектура
**Файл:** [`api-architecture-failures.md`](./resolved/api-architecture-failures.md)

**Были объединены:**
- 2026-02-15-person-api-error
- 2026-02-15-server-actions-error
- 2026-02-13-cinechance-rating-not-fetched

**Ключевые выводы:**
- Server Actions использовались не по назначению
- Нет стандартизированной обработки ошибок
- Условия загрузки данных никогда не выполнялись

---

## 🧠 Системная Рефлексия

**Файл:** [`SYSTEMIC_REFLECTION.md`](./resolved/SYSTEMIC_REFLECTION.md)

Глубокий анализ 17 инцидентов, выявивший:
- **5 системных паттернов**
- **3 архитектурных долга**
- **3 процессные проблемы**
- **3 культурных фактора**

---

## 🔄 Как Документировать Новые Баги

### Способ 1: Интерактивная Отладка (Рекомендуется)

```bash
/gsd-debug "Описание проблемы"
```

Система автоматически:
1. Создаёт сессию в `.planning/debug/`
2. Исследует корневую причину
3. Применяет исправление (опционально)
4. Перемещает в `.planning/debug/resolved/`

### Способ 2: Ручное Создание

Если нужно документировать постфактум:

1. Создайте файл в `.planning/debug/resolved/[YYYY-MM-DD-description].md`
2. Используйте шаблон GSD формата
3. Включите разделы:
   - Symptoms
   - Investigation Timeline
   - Technical Deep Dive
   - Deep Reflection
   - Prevention Strategies

---

## 📊 Статистика

### Февраль 2026

- **Всего инцидентов:** 17
- **Критических:** 6
- **Файлов изменено:** 50+
- **Среднее время исправления:** 2.3 дня

### Распределение по Паттернам

```
Пагинация        ████████░░  3 бага (18%)
Rate Limiting    ██████████  4 бага (24%)
Статусы          ██████░░░░  3 бага (18%)
Кеширование      ██████████  4 бага (24%)
API/Архитектура  ██████░░░░  3 бага (18%)
```

---

## 🔍 Поиск по Базе Знаний

### Поиск по Симптому

```bash
# Найти все упоминания "pagination"
grep -r "pagination" .planning/debug/resolved/

# Найти связанные с rate limit
find .planning/debug/resolved/ -name "*rate*"
```

### Поиск по Файлу

Если вы изменяете файл, проверьте связанные инциденты:

```bash
# Найти инциденты, связанные с image-proxy
grep -r "image-proxy" .planning/debug/resolved/ | head -5
```

---

## 📖 Устаревшие Файлы

Следующие файлы были мигрированы и удалены:

- ❌ `2026-02-16-anime-cartoon-filters.md` → `pagination-system-failures.md`
- ❌ `2026-02-15-genre-stats-incorrect-status-display.md` → `status-display-consistency-failures.md`
- ❌ `2026-02-15-stats-rate-limit.md` → `rate-limiting-architecture-failures.md`
- ❌ `2026-02-15-stats-mismatch.md` → `status-display-consistency-failures.md`
- ❌ `2026-02-15-person-api-error.md` → `api-architecture-failures.md`
- ❌ `2026-02-15-server-actions-error.md` → `api-architecture-failures.md`
- ❌ `2026-02-14-pagination-missing-stats-pages.md` → `pagination-system-failures.md`
- ❌ `2026-02-13-pagination-duplicate-movies.md` → `pagination-system-failures.md`
- ❌ `2026-02-13-actor-photo-slow-loading.md` → `caching-architecture-failures.md`
- ❌ `2026-02-13-profile-average-rating-fix.md` → `caching-architecture-failures.md`
- ❌ `2026-02-13-cinechance-rating-not-fetched.md` → `api-architecture-failures.md`
- ❌ `2026-02-13-my-movies-incorrect-status-display.md` → `status-display-consistency-failures.md`
- ❌ `SEARCH_FIXES.md` → `rate-limiting-architecture-failures.md`
- ❌ `POSTER_MOBILE_FIX_FINAL.md` → `caching-architecture-failures.md`
- ❌ `2026-02-09-infinite-slow-loading-loop.md` → `caching-architecture-failures.md` + `rate-limiting-architecture-failures.md`
- ❌ `2026-02-09-image-proxy-rate-limit-cache.md` → `rate-limiting-architecture-failures.md`

---

## 🎯 Ключевые Уроки

### 1. Copy-Paste = Долг
Если код скопирован в 3+ места, он станет источником багов. Создавайте shared utilities.

### 2. Неявные Контракты = Баги
API должны валидировать входные/выходные данные. Используйте Zod или io-ts.

### 3. "Работает в Dev" ≠ "Работает в Prod"
Тестируйте с production-like данными и на реальных устройствах.

### 4. Частичные Исправления Создают Новые Баги
Исправляйте систему, не симптом. Найдите все места с похожим кодом.

### 5. Мониторинг Обязателен
Если вы не отслеживаете метрику, вы не управляете ею. rate limit hits, cache hit rate, API errors.

---

## 🛠️ Рекомендуемые Действия

### Для Разработчиков

1. **Перед изменением:** Проверьте `.planning/debug/resolved/` на похожие инциденты
2. **При создании API:** Используйте shared utilities (pagination, error handling)
3. **При добавлении кеширования:** Добавьте чеклист из `caching-architecture-failures.md`

### Для Code Review

1. **Проверяйте паттерны:** Нет ли copy-paste? Есть ли shared utility?
2. **Валидация:** Валидируются ли API inputs/outputs?
3. **Обработка ошибок:** Все ли edge cases покрыты?

### Для Архитекторов

1. **Прочитайте** `SYSTEMIC_REFLECTION.md`
2. **Приоритизируйте** технический долг
3. **Внедрите** мониторинг и alerting

---

*Последнее обновление: 2026-02-19*  
*Формат: GSD Debug Sessions v1.0*
