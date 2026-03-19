# Acceptance Test Specification - Phase 27: "Ваши жанры" Block

## Overview
This specification covers the implementation of a "Ваши жанры" (Your Genres) block on the TasteMap page, displaying user's genre distribution based on their watch history.

---

## User Scenarios (Gherkin)

### Scenario 1: Display all 19 genres with bar widths proportional to counts
```gherkin
Given пользователь залогинен и имеет историю просмотров в нескольких жанрах
When он просматривает страницу TasteMap
Then отображается блок "Ваши жанры"
And в блоке показаны все 19 жанров из TMDB
And ширина каждого бара пропорциональна количеству просмотренных фильмов в этом жанре
```

### Scenario 2: Count numbers visible for each genre
```gherkin
Given пользователь просматривает блок "Ваши жанры"
When в блоке есть данные для жанра "Драма"
Then рядом с названием жанра отображается точное число просмотренных фильмов в этом жанре
```

### Scenario 3: Average ratings from genreProfile shown
```gherkin
Given пользователь имеет рейтинги фильмов в определённых жанрах
When отображается блок "Ваши жанры"
Then для каждого жанра показывается средняя оценка пользователя по фильмам этого жанра
And средняя оценка вычисляется из рейтингов в genreProfile
```

### Scenario 4: Block positioned before TwinTasters
```gherkin
Given пользователь находится на странице TasteMap
When страница рендерится
Then блок "Ваши жанры" отображается перед блоком "TwinTasters"
And элементы следуют в правильном порядкеvereen
```

### Scenario 5: Empty state when no genre data exists
```gherkin
Given пользователь новый и не имеет ни одного просмотренного фильма
When он просматривает страницу TasteMap
Then блок "Ваши жанры" показывает состояние "нет данных"
And отображается сообщение "Просмотрите фильмы, чтобы увидеть распределение по жанрам"
И график баров не отображается
```

---

## Acceptance Criteria

### AC1: All 19 TMDB genres displayed
- Система отображает все 19 стандартных TMDB жанров (Action, Adventure, Animation, Comedy, Crime, Documentary, Drama, Family, Fantasy, History, Horror, Music, Mystery, Romance, Science Fiction, TV Movie, Thriller, War, Western)
- Каждый жанр имеет свою строку в блоке
- Жанры следуют в алфавитном порядке (или по убыванию количества просмотров)
- Отсутствующие жанры (с нулевым count) всё равно отображаются с bar width 0

### AC2: Bar widths proportional to counts
- Ширина бара для каждого жанра вычисляется как: `(genreCount / totalWatched) * 100%`
- Минимальная ширина бара: 2px (для визуального отображения жанров с 1 просмотром)
- Масштабирование выполняется на клиенте с использованием CSS flex/grid

### AC3: Count numbers visible
- Рядом с названием жанра отображается число в формате: `Жанр (N)`
- Где N — точное количество просмотренных фильмов в этом жанре
- Цифра имеет тот же размер/стиль, что и название жанра

### AC4: Average ratings from genreProfile shown
- Для каждого жанра вычисляется средний рейтинг пользователя по фильмам этого жанра
- Оценка округляется до одного знака после запятой (например, 3.5)
- Если оценок нет, отображается "—" или "N/A"
- Рейтинг отображается справа от бара или в отдельном столбце

### AC5: Block position before TwinTasters
- В DOM порядке блок "Ваши жанры" должен быть перед блоком "TwinTasters"
- На странице визуальное расположение соответсвует порядку отображения сверху вниз
- Используются те же отступы и стили, что и у соседних блоков

### AC6: Empty state handling
- Если у пользователя нет просмотренных фильмов:
  - Отображается сообщение "У вас пока нет данных о жанрах"
  - График баров не рендерится
  - Блок сохраняет свою высоту и стили для согласованности UI
- Если есть только просмотренные без оценок:
  - Бар отображается на основе counts
  - Средние рейтинги показывают "—"
- Empty state также покрывает случай, когда genreProfile отсутствует в базе

### AC7: Data source correctness
- Источник данных: Prisma запрос к таблице `MovieStatus` с фильтром по userId
- Для каждого фильма берутся жанры из TMDB API response (кэшированный)
- Рейтинги берутся из `genreProfile` (если существует)
- Обновление происходит при добавлении нового фильма в историю

---

## Test Scope

### Included
1. **Unit Tests** (Vitest)
   - Жанры рендерятся корректно
   - Вычисление ширины бара
   - Форматирование count и rating
   - Empty state detection

2. **Integration Tests** (Vitest + Testing Library)
   - Компонент получает данные и рендерит 19 жанров
   - Сортировка жанров по количеству
   - Обработка отсутствующих жанров
   - Empty state UI

3. **E2E Tests** (Playwright/Cypress)
   - Полный путь: логин → переход на TasteMap → отображение блока
   - Проверка порядка блоков (Ваши жанры → TwinTasters)
   - Адаптивность на мобильных и десктопе
   - Анимации/переходы (если есть)

4. **API Tests**
   - `/api/tastemap/genre-distribution` возвращает правильную структуру
   - Запрос корректно обрабатывает отсутствие данных
   - Кэширование работает (ISR 1 час)

### Excluded
1. Тестирование TMDB API интеграции (мocked)
2. Тестирование Prisma миграций (отдельно в Phase X)
3. Тестирование редких крайних случаев (нулевой totalWatchedAlready covered by empty state)
4. Тестирование производительности при 10k+ фильмов (отдельно в нагрузочных тестах)
5. Тестирование кросс-браузерности (Chrome/Firefox/Safari включены, IE исключён)

---

## Data Setup Requirements

For tests, need fixtures:
- `userWithFullHistory` — 50+ фильмов, распределённых по 19 жанрам
- `userWithEmptyHistory` — 0 фильмов
- `userWithOnlyCounts` — фильмы без оценок
- `mockGenreProfile` — объект с average ratings по жанрам

---

## Definition of Done

- [ ] All acceptance criteria implemented и проходят тесты
- [ ] Code reviewed и соответствует guidelines (Server Component, no any types)
- [ ] ESLint + TypeScript проверки пройдены
- [ ] Тесты покрывают ≥80% строк компонента
- [ ] Empty state протестирован вручную и автоматически
- [ ] Блок правильно отображается на мобильных (width < 768px)
- [ ] Нет regressions в существующих блоках TasteMap