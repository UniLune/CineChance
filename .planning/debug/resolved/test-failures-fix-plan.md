# Plan: Исправление падающих тестов

## Обзор

Текущее состояние тестов: **множество падающих тестов** в разных частях проекта, не связанных с исправлением `stats/route.ts`.

---

## Список падающих тестов

| # | Тест | Файлы | Причина |
|---|------|-------|---------|
| 1 | Phase 25-03: TasteMap charts removal | `.planning/phases/25-simplify-taste-map/tdd/acceptance-code-25-03.test.tsx` | Ожидаемые строки не найдены в рендере |
| 2 | Phase 29 (AC27): Genre stats display | `.planning/phases/29-genre-stats-display/tdd/acceptance-code-27.test.tsx` | 19 жанров не отображаются |
| 3 | similar-users route tests | `src/app/api/user/similar-users/__tests__/route.test.ts` | `res.text is not a function` — проблема в mock |
| 4 | similar-users unit tests | `src/app/api/user/similar-users/__tests__/route.unit.test.ts` | Те же проблемы с rate limit mock |
| 5 | TwinTasters component | `src/app/components/__tests__/TwinTasters.test.tsx` | API вызовы не работают |
| 6 | TypeScript config tests | `src/lib/__tests__/config/tsconfig.test.ts` | `tsc --noEmit` ошибки |
| 7 | Phase 20 TypeScript | `.planning/phases/20-strict-typescript/tdd/acceptance-code-01-tsconfig.test.ts` | Те же TS ошибки |

---

## Детальный анализ и план исправления

### 1. similar-users rate limit mock issue (ПРИОРИТЕТ: HIGH)

**Проблема:** В тестах mock для rate limit возвращает объект без метода `text()`.

**Ошибка:**
```
[ERROR] Rate limit check failed for ip:anonymous on /api/user/similar-users { error: 'res.text is not a function' }
```

**План:**
1. Найти mock для `rateLimit` в similar-users тестах
2. Добавить метод `res.text()` в mock response
3. Проверить что mock возвращает корректную структуру

**Файлы для проверки:**
- `src/app/api/user/similar-users/__tests__/route.test.ts`
- `src/app/api/user/similar-users/__tests__/route.unit.test.ts`

---

### 2. Phase 25-03: TasteMapRemove Charts (ПРИОРИТЕТ: MEDIUM)

**Проблема:** Тесты ожидают определённые строки в рендере, но компонент их не рендерит.

**Упавшие тесты:**
- `should show empty state when no genre data` — ожидает "Карта вкуса пуста", "Добавить фильмы"
- `should not show any chart blocks in empty state` — ожидает отсутствие "Профиль жанров", "Распределение оценок"

**План:**
1. Запустить тест в isolation для понимания что рендерится
2. Проверить `TasteMapClient.tsx` на наличие условий для empty state
3. Добавить необходимые элементы в компонент или обновить mock данные

**Файлы для проверки:**
- `src/app/profile/taste-map/TasteMapClient.tsx` — строки 86-110 (empty state)

---

### 3. Phase 29: Genre Stats Display (ПРИОРИТЕТ: MEDIUM)

**Проблема:** Тесты ожидают отображение 19 жанров TMDB, но компонент не рендерит их.

**Упавшие тесты (9 из 19):**
- `should show all 19 TMDB genres`
- `should display bars with proportional widths`
- `should show count next to each genre name`
- и др.

**План:**
1. Проверить, есть ли в `TasteMapClient.tsx` секция "Ваши жанры"
2. Добавить рендеринг жанров если отсутствует
3. Проверить что `genreCounts` передаётся в компонент

**Файлы для проверки:**
- `src/app/profile/taste-map/TasteMapClient.tsx` — нужна секция "Ваши жанры"
- `src/app/profile/taste-map/page.tsx` — передача данных

---

### 4. TwinTasters Component Tests (ПРИОРИТЕТ: MEDIUM)

**Проблема:** API вызовы не работают в тестах.

**План:**
1. Проверить моки для API в `TwinTasters.test.tsx`
2. Убедиться что fetch/axios моки корректны

**Файлы для проверки:**
- `src/app/components/__tests__/TwinTasters.test.tsx`

---

### 5. TypeScript Config Tests (ПРИОРИТЕТ: LOW)

**Проблема:** `tsc --noEmit` выдаёт ошибки типизации.

**План:**
1. Запустить `npx tsc --noEmit` для просмотра конкретных ошибок
2. Исправить ошибки типизации (могут быть в любых файлах)

---

## Рекомендуемый порядок выполнения

```
1. similar-users mock (HIGH)      → Быстрое исправление, разблокирует тесты
2. Phase 25-03 TasteMap (MEDIUM)  → Проверка empty state рендера
3. Phase 29 Genre (MEDIUM)       → Добавление секции жанров
4. TwinTasters (MEDIUM)           → Исправление API моков
5. TypeScript (LOW)               → Большой объём работы
```

---

## Команды для диагностики

```bash
# Запуск конкретного теста
npx vitest run src/app/api/user/similar-users/__tests__/route.test.ts

# Проверка TypeScript ошибок
npx tsc --noEmit

# Запуск всех тестов
npm run test:ci
```

---

## Ожидаемые результаты

После исправления:
- ✅ Все тесты similar-users проходят
- ✅ TasteMap рендерит empty state корректно
- ✅ Genre stats отображаются в TasteMap
- ✅ TwinTasters тесты работают
- ✅ TypeScript ошибки исправлены (или задокументированы)