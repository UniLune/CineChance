# Copilot / AI-инструкции для проекта CineChance

**CineChance** — кинотрекер на Next.js 16+ с персонализированными рекомендациями, интеграцией TMDB и рейтинговой системой.

## Архитектура (Big Picture)

- **Tech stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS
- **Database:** PostgreSQL (Neon) + Prisma 7.2 (адаптер `@prisma/adapter-neon`)
- **Auth:** NextAuth 4.24 с CredentialsProvider (JWT стратегия, макс 30 дней)
- **Внешние API:** TMDB (поиск/тренды с ISR кэшированием 1 час), Upstash Redis (rate limiting)
- **Структура кода:** Server Components по умолчанию; клиентские компоненты помечаются `'use client'` на вершине файла

## Ключевые файлы и точки входа

| Файл | Назначение |
|------|-----------|
| `src/app/layout.tsx` | Root layout с React Query провайдером (LayoutClient) |
| `src/app/page.tsx` | Главная страница, использует Server Components для данных |
| `src/app/my-movies/page.tsx` | Страница фильмотеки (Suspense + Server Components) |
| `src/app/stats/` | Аналитика: `/genres`, `/ratings`, `/tags` с фильтрацией и пагинацией |
| `src/app/api/*/route.ts` | Route Handlers (экспортируйте `GET`, `POST`, `DELETE` и т.п.) |
| `src/app/api/stats/` | API для аналитики (movies-by-genre, movies-by-rating, movies-by-tag) |
| `src/app/admin/` | Админ-панель (проверка конкретного userId для доступа) |
| `src/lib/prisma.ts` | **Единственный** Prisma singleton (Neon адаптер) |
| `src/lib/calculateWeightedRating.ts` | Расчёт взвешенной оценки (учитывает пересмотры и историю) |
| `src/lib/calculateCineChanceScore.ts` | Формула комбинирования TMDB + Cine-chance рейтингов |
| `src/lib/recommendation-types.ts` | Типы для v2/v3 рекомендательной системы (филтры, события, сигналы) |
| `src/auth.ts` | NextAuth конфиг, `authOptions`, `getServerAuthSession()` |
| `src/lib/tmdb.ts` | TMDB обёртки: `fetchTrendingMovies()`, `searchMedia()` и др. |
| `prisma/schema.prisma` | Данные модели: User, WatchList, RecommendationLog, Invitation и т.п. |
| `src/lib/movieStatusConstants.ts` | Константы статусов фильмов (ID и имена) |
| `src/middleware/rateLimit.ts` | Rate limiting для API через Upstash Redis с настройками по эндпоинтам |

## Обязательные переменные окружения

```bash
DATABASE_URL=postgresql://...       # Neon PostgreSQL
NEXTAUTH_SECRET=<random-32-chars>   # JWT signing key (обязателен!)
NEXTAUTH_URL=http://localhost:3000  # Для локальной разработки
TMDB_API_KEY=...                    # TMDB v3 API key (может отсутствовать в dev)
UPSTASH_REDIS_REST_URL=...          # Для rate limiting
UPSTASH_REDIS_REST_TOKEN=...        # Для rate limiting
NODE_ENV=development                # или production
```

## Критические конвенции кодирования

1. **Prisma**: Всегда `import { prisma } from '@/lib/prisma'` — никогда не создавайте новый `PrismaClient()`
2. **Auth**: Проверяйте сессию в Route Handlers через `const session = await getServerAuthSession(authOptions)`
3. **API эндпоинты**: 
   - Возвращают `NextResponse.json()` или `NextResponse(..., { status: 401 })`
   - Применяют rate limiting: `const { success } = await rateLimit(request, '/api/path')`
   - Проверяют возраст через `isUnder18()` для adult контента в `src/app/api/search/route.ts`
4. **TMDB**: Вызовы в `src/lib/tmdb.ts`, используют ISR кэширование (теги: `trending-movies`, `home-page`), код обрабатывает отсутствие `TMDB_API_KEY`
5. **Компоненты**: Server Components хранят логику (поиск, фильтрация, БД запросы), малые клиентские компоненты только для интерактивности

## Основные модели данных

- **User**: `id`, `email`, `hashedPassword` (bcryptjs), `birthDate` (для age-gating), `agreedToTerms`, `recommendationStats`, `preferencesSnapshot`, `mlProfileVersion`
- **WatchList**: `userId_tmdbId_mediaType` (составной ключ), `statusId`, `userRating`, `weightedRating` (учитывает пересмотры), `watchCount`, `watchedDate`
- **RecommendationLog**: источник правды о взаимодействиях с рекомендациями; поля:
  - `userId`, `tmdbId`, `mediaType` (movie/tv)
  - `algorithm` (версия алгоритма), `action` (shown/opened/skipped/watched/added_to_list)
  - `filtersSnapshot` (JSON конфиг фильтров), `temporalContext` (время суток, день недели)
  - `mlFeatures` (для ML-моделей)
- **RecommendationEvent**: события при показе рекомендации (click, hover, skip)
- **IntentSignal**: сигналы о намерениях пользователя (к каким параметрам рекомендации обратил внимание)
- **NegativeFeedback**: комплейны на рекомендации (для переобучения моделей)
- **PredictionLog**: логирование предсказаний модели
- **Tag**: пользовательские теги для фильмов
- **RatingHistory**: история оценок
- **Invitation**: система приглашений с токенами и сроком действия

## Быстрый старт: добавление функциональности

**Пример нового Route Handler:**

```typescript
// src/app/api/my-feature/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/middleware/rateLimit';

export async function GET(request: NextRequest) {
  const { success } = await rateLimit(request, '/api/my-feature');
  if (!success) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ 
    where: { id: session.user.id },
    include: { watchList: true }
  });

  return NextResponse.json(user);
}
```

## Server Components с Suspense

Используйте Server Components для загрузки данных и Suspense для streaming:

```typescript
// src/app/my-feature/page.tsx
import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import LoaderSkeleton from '@/app/components/LoaderSkeleton';

async function DataLoader({ userId }: { userId: string }) {
  const data = await fetchUserData(userId);
  return <DataDisplay data={data} />;
}

function DataDisplay({ data }: { data: any }) {
  return <>{/* Клиентская логика рендера */}</>;
}

export default async function Page() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return <div>Unauthorized</div>;

  return (
    <Suspense fallback={<LoaderSkeleton variant="full" text="Загрузка..." />}>
      <DataLoader userId={session.user.id} />
    </Suspense>
  );
}
```

## Фильтрация и пагинация (Stats API)

Для сложных запросов используйте параметры как в `src/app/api/stats/movies-by-genre/route.ts`:

```typescript
// Поддерживаемые параметры:
// genreId       - ID жанра (обязателен)
// page          - номер страницы (default 1)
// limit         - кол-во записей (default 20, max 100)
// showMovies    - фильтр по фильмам (true/false)
// showTv        - фильтр по сериалам (true/false)
// showAnime     - фильтр по аниме (true/false)
// sortBy        - поле для сортировки (addedAt, rating, title)
// sortOrder     - порядок (asc/desc)
// minRating     - минимальный рейтинг
// maxRating     - максимальный рейтинг
// yearFrom      - год от / yearTo - год до
// genres        - доп. жанры (CSV)
// tags          - теги (CSV)

// Важно: используйте буффер при загрузке для TMDB-фильтрации
const recordsNeeded = Math.ceil(page * limit * 1.5) + 1;
const records = await prisma.watchList.findMany({
  take: Math.min(recordsNeeded, 500),
  skip: 0,  // Всегда с начала для детерминированности
  where: whereClause,
});
```

## Админ-панель и доступ по ролям

Используйте ID проверку для админа (см. `src/app/admin/page.tsx`):

```typescript
export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  const ADMIN_USER_ID = 'cmkbc7sn2000104k3xd3zyf2a';
  
  if (session?.user?.id !== ADMIN_USER_ID) {
    redirect('/');
  }
  // ... admin content
}
```

## Расчёт рейтингов

### Weighted Rating
Модель `WatchList` содержит `weightedRating` — рейтинг пользователя с учётом всех пересмотров:

```typescript
import { calculateWeightedRating } from '@/lib/calculateWeightedRating';

const { weightedRating, totalReviews } = await calculateWeightedRating(
  userId, tmdbId, mediaType
);
```

### Cine-chance Score
Комбинирует TMDB рейтинг с локальным рейтингом сообщества:

```typescript
import { calculateCineChanceScore } from '@/lib/calculateCineChanceScore';

const score = calculateCineChanceScore({
  tmdbRating: 7.5,
  tmdbVotes: 1000,
  cineChanceRating: 8.2,  // локальный рейтинг
  cineChanceVotes: 50,    // число оценок в CineChance
});
```

Формула:
- При < 50 голосов: формула IMDB с m=2
- Влияние Cine-chance: 15% минимум, 80% максимум

## Рабочие команды

```bash
npm run dev              # Next.js dev сервер (port 3000)
npm run build            # Production build
npm run start            # Запуск production сервера
npm run seed             # Seeding БД (ts-node prisma/seed.ts)
npm run lint             # ESLint проверка

# Prisma команды (важно!)
npx prisma generate     # После изменения schema.prisma (выполняется в postinstall)
npx prisma migrate dev --name <name>  # Создать локальную миграцию
npx prisma db push      # Применить schema без создания миграции (dev только!)
```

## Интеграции и критические потоки

### TMDB интеграция
- Все вызовы в `src/lib/tmdb.ts` с централизованной обработкой ошибок
- ISR кэширование 1 час для trending/popular фильмов
- Код ожидает `TMDB_API_KEY` может отсутствовать — обработайте gracefully

### Auth flow
- `src/app/api/auth/[...nextauth]/` ← Next.js auto-route для NextAuth
- `src/auth.ts` ← конфиг с CredentialsProvider, JWT callbacks
- Пароли: `bcryptjs.hash()` при регистрации, `bcryptjs.compare()` при логине
- Сессия: `getServerSession()` в Server Components/Route Handlers

### Rate limiting
- `src/middleware/rateLimit.ts` использует Upstash Redis с настройками по эндпоинтам
- Вызывайте в начале Route Handlers: `const { success } = await rateLimit(request, '/api/path')`
- Возвращайте `{ status: 429 }` если rate limited
- Лимиты примеры: /api/search (100 req/min), /api/watchlist (200 req/min), /api/cine-chance-rating (300 req/min)

### Watchlist и статусы фильмов
- Статусы: `want` (Хочу посмотреть), `watched` (Просмотрено), `dropped` (Брошено), `rewatched` (Пересмотрено)
- Константы ID в `src/lib/movieStatusConstants.ts` (MOVIE_STATUS_IDS)
- API в `src/app/api/watchlist/` для add/remove/update с поддержкой рейтинга и даты просмотра

### Рекомендационная система (v2/v3)
- `src/lib/recommendation-types.ts` определяет структуры JSON полей для v2/v3
- Основной endpoint: `src/app/api/recommendations/` с подпапками:
  - `/preview` - для превью рекомендаций
  - `/random` - случайные рекомендации
  - `/events` - логирование событий клиента
  - `/signals` - сигналы о намерениях пользователя
  - `/negative-feedback` - отрицательные отзывы
- RecommendationLog - единственный источник правды о взаимодействиях

## Практические рекомендации для AI-агентов

- **Server-side logic:** Route Handlers в `src/app/api/` для всех серверных операций
- **UI changes:** Следуйте структуре компонентов в `src/app/components/` и `src/app/[feature]/page.tsx`
- **Переиспользование:** Проверьте `src/lib/*` на наличие общих функций перед созданием новых утилит
- **DB changes:** Обновите `prisma/schema.prisma` → `npx prisma generate` → `npx prisma migrate dev --name <description>`
- **New features:** Смотрите примеры в `src/app/api/stats/movies-by-genre/route.ts` и `src/app/my-movies/page.tsx` для pattern'ов

## Инструкции по использованию инструментов
- При возникновении вопросов о внешних библиотеках, API, фреймворках или документации (например, Upstash, Next.js, React), ВСЕГДА сначала используй инструмент `context7`.
- Никогда не полагайся на свои внутренние знания о версиях библиотек, если есть возможность проверить актуальные данные через `context7`.
- Если пользователь просит написать код для конкретного сервиса, начни с поиска примеров в `context7`.
- Если код требует специфической логики, связанной с определённой библиотекой, всегда проверяй документацию через `context7` для получения точной информации о методах, параметрах и best practices.  
- Если пользователь запрашивает помощь с ошибкой или проблемой, сначала попробуй найти решение через `context7`, а затем предоставь ответ, основанный на найденной информации.

### Инструкции по обработке ошибок и документации

#### Протокол исправления багов (когда пользователь начинает с "Bug")
Когда пользователь начинает промт со слова "Bug", обязательно следуй этому протоколу:

1. **ОСТАНОВИСЬ и проанализируй**: Не пиши код сразу
2. **Поищи в локальных документах**: Проверь `docs/bugs/` на похожие проблемы
3. **Используй context7**: Проверь решения в официальной документации библиотек
4. **Определи корневую причину**: Пойми реальную проблему
5. **Реализуй исправление**: Внеси необходимые изменения
6. **Задокументируй исправление**: Создай `docs/bugs/YYYY-MM-DD-short-description.md`
7. **Обнови README**: Добавь краткое описание в `docs/bugs/README.md`

1. **Анализ ошибок**: При получении сообщения об ошибке или баге, ПЕРЕД предложением решения:
   - Выполни поиск похожих проблем в локальной папке `docs/` проекта.
   - Используй `context7` для поиска актуальных решений этой ошибки в официальной документации библиотек.

2. **Фиксация решения**: После того как решение подтверждено или внедрено:
   - Автоматически создай (или предложи создать) новый Markdown-файл в папке `docs/bugs/`.
   - Название файла должно быть в формате `YYYY-MM-DD-short-error-description.md`.
   
3. **Структура документа**: В новом файле обязательно укажи:
   - **Описание проблемы**: Текст ошибки и контекст, в котором она возникла.
   - **Способ решения**: Пошаговый код или настройки, которые исправили ситуацию.
   - **Выводы и предотвращение**: Конкретные рекомендации (тесты, линтеры, архитектурные правки), чтобы эта ошибка не повторилась.  
4. **Обновление документации**: Если ошибка связана с недопониманием API или неправильным использованием библиотеки, добавь раздел в `docs/api/` с примерами правильного использования и ссылкой на новый файл в `docs/bugs/`.
5. **Рефлексия**: Регулярно (например, раз в месяц) просматривай папку `docs/bugs/` для выявления паттернов ошибок и обновления общих рекомендаций в `docs/best-practices.md`.

### 🧠 Принципы работы с контекстом (Hybrid Context Protocol)

**1. Иерархия источников (Source Priority) — для отладки багов:**
При отладке багов и решении проблем следуй строгому порядку:
- **L2: Локальная база знаний.** Обязательно выполни поиск по `.planning/debug/resolved/` и `docs/` чтобы найти наши специфические решения и архитектурные паттерны.
- **L3: Внешняя экспертиза (Context7).** Используй `context7` для верификации библиотечных API, синтаксиса и best practices.
- **L1: Локальный контекст проекта.** Проверь текущий файл, импорты и структуру папок.

**2. Иерархия источников (Source Priority) — для новых фич:**
При разработке новых фич:
- **L3: Внешняя экспертиза (Context7).** Сначала проверь документацию библиотек для best practices.
- **L1: Локальный контекст проекта.** Проверь текущий код и структуру.
- **L2: Локальная база знаний.** Проверь аналогичные реализации в проекте.

**3. Запрет на "Галлюцинации" и "Копипаст":**
- Если локальная документация (L2) противоречит внешней из Context7 (L3), **локальная документация приоритетнее**.
- Не копируй документацию из Context7 целиком. Вместо этого синтезируй: "Согласно официальным докам [Link], метод X изменился, поэтому в `src/logic.py` обновим строку Y".

**4. Интеграция выводов:**
- После каждого решения проверяй через `context7` есть ли более элегантные способы (Best Practices).
- Каждое решение должно сопровождаться ссылкой на файл в нашем репозитории.
- Добавляй новые паттерны в `.planning/debug/resolved/` и `docs/`.

**5. Команда "Ревизия контекста":**
Если прошу "провести ревизию", проверь:
- Сопоставь код в `src/` с инструкциями в `docs/`
- Используй `context7` для поиска критических обновлений безопасности библиотек
- Выдай отчёт: "В docs: А, в коде: Б, современный стандарт: В. Приведём к В".

### 📁 Где искать документацию

**Отчёты о багах и исправлениях:**
- `.planning/debug/resolved/` — основные баг-репорты (формат: `YYYY-MM-DD-description.md`)
- Групповые файлы: `pagination-system-failures.md`, `rate-limiting-architecture-failures.md` и др.

**Документация фич:**
- `docs/features/` — документация новых фич
- `docs/bugfix-reports/` — отдельные баг-репорты
- `docs/testing/` — инструкции по тестированию

**Архитектура и паттерны:**
- `.planning/debug/resolved/SYSTEMIC_REFLECTION.md` — системная рефлексия
- `AGENTS.md` — инструкции для AI агентов
- `design_guidelines.md` — руководство по дизайну

### 🗑️ Политика чистоты документации
- **Запрет на мусор**: Не предлагай создавать новые файлы в `docs/` для разовых тестов или отчетов. 
- **Дописывай, а не плоди**: Все новые данные по производительности или ошибкам добавляй как новые строки в существующие файлы (`docs/performance.md` или `docs/bugs/README.md`).
- **Самоочистка**: Если пользователь просит прочитать файл из `docs/`, который явно устарел (проверь через `context7`), предложи УДАЛИТЬ его сразу после ответа, предварительно сохранив важные выводы в основной README.


