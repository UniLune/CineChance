# CineChance: Системная Рефлексия Багов (Февраль 2026)

## Executive Summary

В течение февраля 2026 года проект CineChance столкнулся с **22 инцидентами**, которые можно сгруппировать в **6 системных паттернов**. Этот документ анализирует корневые причины на уровне архитектуры, процессов и культуры разработки.

### Ключевые Метрики

- **Всего багов:** 22 (17 + 5 новых)
- **Уникальных паттернов:** 6
- **Критических инцидентов:** 7
- **Файлов изменено:** 60+
- **Дней на исправление:** 14 (период с 09.02 по 16.02)

### Группировка по Паттернам

| Паттерн | Количество | Сложность | Влияние |
|---------|-----------|-----------|---------|
| Пагинация | 3 | Высокая | Все списки фильмов |
| Rate Limiting | 4 | Средняя | Все API endpoints |
| Статусы | 3 | Средняя | Отображение данных |
| Кеширование | 4 | Высокая | Производительность |
| API Архитектура | 3 | Средняя | Клиент-сервер |
| Race Conditions | 2 | Высокая | Client-side fetch |

---

## Архитектурные Долги

### Долг #1: Copy-Paste Архитектура

**Проявление:**
- Пагинация реализована в 4+ местах с одинаковыми багами
- Логика фильтров скопирована с незначительными вариациями
- Обработка ошибок различалась между API

**Корневая Причина:**
- Отсутствие shared utilities
- "Быстрее скопировать, чем создать абстракцию"
- Нет code review на архитектурные паттерны

**Последствия:**
- Исправление одного бага требовало 4+ PR
- Регрессии при копировании "исправленного" кода
- Невозможность внести глобальные изменения

**Решение:**
```typescript
// src/lib/pagination.ts
export function createPaginationParams(page: number, limit: number) {
  return {
    skip: (page - 1) * limit,
    take: limit + 1, // For hasMore detection
    orderBy: [{ addedAt: 'desc' }, { id: 'desc' }],
  };
}

// Использование во всех API
const pagination = createPaginationParams(page, limit);
```

### Долг #2: Неявные Контракты

**Проявление:**
- API возвращали разные структуры данных
- Статусы фильмов: `status`, `statusId`, `statusName` - всё в разных местах
- Нет runtime validation

**Корневая Причина:**
- TypeScript types только для разработки
- Нет Zod/io-ts валидации
- API менялись без обновления клиентов

**Последствия:**
- Client-side crashes на production
- "Работает у меня" синдром
- Сложная отладка несоответствий

**Решение:**
```typescript
// src/lib/api-contracts.ts
import { z } from 'zod';

export const MovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  statusId: z.number(),
  statusName: z.string(),
});

export type Movie = z.infer<typeof MovieSchema>;

// Валидация в API
const movie = MovieSchema.parse(dbResult);
```

### Долг #3: Отсутствие Тестирования Под Нагрузкой

**Проявление:**
- Пагинация не тестировалась с >20 элементами
- Rate limiting не тестировался с реальным трафиком
- Кеширование не тестировалось с высокой нагрузкой

**Корневая Причина:**
- Разработка на пустых/тестовых данных
- Нет staging environment с production-like данными
- "Протестируем в production"

**Последствия:**
- Баги обнаруживались пользователями
- Emergency hotfixes
- Потеря доверия пользователей

**Решение:**
```typescript
// Тесты с реальными объёмами
describe('pagination', () => {
  it('works with 1000 movies', async () => {
    await seedDatabase(1000);
    const pages = await fetchAllPages('/api/my-movies');
    expect(pages).toHaveLength(50); // 1000/20
    expect(noDuplicates(pages)).toBe(true);
  });
});
```

---

## Процессные Проблемы

### Проблема #1: Отсутствие Чеклистов

**Что Отсутствовало:**
- Чеклист при добавлении нового статуса фильма
- Чеклист при создании нового API endpoint
- Чеклист при изменении кеширования

**Пример Чеклиста (Статусы):**
```markdown
## При Добавлении Нового Статуса

- [ ] Prisma schema обновлён
- [ ] Все WHERE clauses включают новый статус
- [ ] Все API возвращают statusId и statusName
- [ ] Client types обновлены
- [ ] UI компоненты поддерживают новый статус
- [ ] Фильтры обновлены
- [ ] Export functionality обновлена
- [ ] Тесты добавлены
```

### Проблема #2: Отсутствие Мониторинга

**Что Не Отслеживалось:**
- Rate limit hit rate
- Cache hit/miss ratio
- API error rates
- Performance metrics

**Рекомендуемый Стек Мониторинга:**
```typescript
// Логирование
logger.info('Rate limit check', {
  endpoint,
  userId,
  remaining,
  hit: !success,
});

// Метрики
metrics.histogram('api.response_time', duration, { endpoint });
metrics.counter('api.errors', 1, { endpoint, status_code });
metrics.gauge('cache.hit_rate', hitRate, { cache_name });
```

### Проблема #3: Технический Долг Без Приоритизации

**Накопленные Проблемы:**
- Нет shared utilities (пагинация, кеширование)
- Нет стандартизированной обработки ошибок
- Нет единого подхода к data fetching
- Нет runtime validation

**Приоритизация (MoSCoW):**

**Must Have:**
- Shared pagination utility
- API response validation
- Error handling standard

**Should Have:**
- Monitoring and alerting
- Automated integration tests
- Performance benchmarks

**Could Have:**
- GraphQL instead of REST
- Advanced caching strategies

**Won't Have (пока):**
- Microservices разделение
- Multi-region deployment

---

## Культурные Факторы

### Фактор #1: "Работает - Не Трогай"

**Проявление:**
- Старый код с `skip=0` не пересматривался
- "Магические числа" без комментариев
- Копирование "проверенного" кода с багами

**Антидот:**
- Регулярный code review с архитектурным фокусом
- Вопрос: "Почему это работает?" вместо "Работает ли это?"
- Рефакторинг как часть feature development

### Фактор #2: Фичи > Качество

**Проявление:**
- Фильтры anime/cartoon добавлены без тестирования пагинации
- Rate limiting добавлен без анализа трафика
- Кеширование добавлено без стратегии инвалидации

**Антидот:**
- Definition of Done включает тестирование
- Feature freeze перед релизом для стабилизации
- Bug budget: max 5% времени на hotfixes

### Фактор #3: Недостаток Документации

**Проявление:**
- "Зачем skip=0?" - не документировано
- "Как работает rate limiting?" - только в коде
- "Какой статус в каком API?" - проверять вручную

**Антидот:**
- Architecture Decision Records (ADRs)
- Код документирует намерения, не механику
- README для каждого модуля

---

## Системные Паттерны (Cross-Cutting)

### Паттерн #1: Частичные Исправления

**Наблюдение:** Многие баги потребовали 2-3 итераций исправлений.

**Примеры:**
- Пагинация: duplicate fix → missing pagination fix → final fix
- Rate limiting: IP fix → cache-first fix → final fix
- Статусы: my-movies fix → stats detail fix → consistency fix

**Причина:** Исправление симптома, не системы.

**Решение:** При исправлении бага:
1. Найти ВСЕ места с похожим кодом
2. Понять системную причину
3. Исправить систему, не симптом
4. Добавить regression тесты

### Паттерн #2: Конфигурация в Коде

**Наблюдение:** "Магические числа" разбросаны по codebase.

**Примеры:**
- `limit * 1.5` - зачем 1.5?
- `500` max records - откуда число?
- `86400` cache TTL - почему 24 часа?
- `0.5` threshold для similarity - почему именно 0.5?

**Решение:**
```typescript
// src/config/app.ts
export const CONFIG = {
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
    hasMoreBuffer: 1, // Instead of magic +1
  },
  cache: {
    imageTtl: 6 * 60 * 60, // 6 hours, documented
    statsTtl: 60 * 60,     // 1 hour
    errorTtl: 0,           // Never cache errors
    tmdbTtl: 24 * 60 * 60, // 24 hours for TMDB
  },
  rateLimit: {
    imageProxy: 1000,
    search: 300,
    default: 100,
  },
  similarity: {
    threshold: 0.5, // Minimum overall match for "similar users"
  },
} as const;
```

### Паттерн #3: Неполнота Edge Cases

**Наблюдение:** Код работал для "happy path", ломался на граничных случаях.

**Примеры:**
- Пустой список фильмов
- Только один тип фильтра (anime без cartoon)
- Rate limit при первой загрузке
- Таймаут TMDB API
- **Race conditions** при переходе между страницами (новое!)

**Решение:** При разработке feature:
1. Определить happy path
2. Список edge cases (пустой, один элемент, максимум, ошибка)
3. Тесты для каждого edge case
4. Graceful degradation
5. **Добавить AbortController для всех fetch запросов**

### Паттерн #4: Race Conditions в Client-Side Fetch

**Наблюдение:** При переходе между страницами старые fetch-запросы не отменялись, вызывая state update после unmount.

**Примеры:**
- Collection page crash при переходе с главной (AbortController отсутствовал)
- Double-fetch в useEffect без очистки

**Корневая Причина:**
- Отсутствие AbortController в useEffect
- Нет проверки isMounted перед setState
- Suspense boundary transitions могут вызвать перерендер

**Решение:**
```typescript
// Правильный паттерн для fetch в useEffect
useEffect(() => {
  const controller = new AbortController();
  let isMounted = true;

  const fetchData = async () => {
    try {
      const data = await fetch(url, { signal: controller.signal });
      if (isMounted) {
        setData(data);
      }
    } catch (error) {
      if (error.name !== 'AbortError' && isMounted) {
        setError(error);
      }
    }
  };

  fetchData();

  return () => {
    controller.abort();
    isMounted = false;
  };
}, [url]);
```

---

## Рекомендации по Предотвращению

### Немедленные Действия (1-2 недели)

1. **Создать shared utilities:**
    ```typescript
    // src/lib/pagination.ts
    // src/lib/cache.ts
    // src/lib/api-response.ts
    ```

2. **Внедрить runtime validation:**
    ```bash
    npm install zod
    # Добавить валидацию во все API routes
    ```

3. **Создать чеклисты:**
    - Новый API endpoint
    - Изменение статусов
    - Добавление кеширования
    - Изменение пагинации
    - **Добавление fetch в useEffect (обязательно AbortController!)**

4. **Добавить AbortController во все fetch запросы:**
    - Проверить все useEffect с fetch
    - Добавить isMounted флаг
    - Фильтровать AbortError в логах

### Краткосрочные (1-2 месяца)

1. **Мониторинг:**
   - Интеграция с Sentry/DataDog
   - Rate limit dashboards
   - Cache hit rate monitoring

2. **Тестирование:**
   - Integration tests с реальными данными
   - Load testing для critical paths
   - E2E tests для основных сценариев

3. **Документация:**
   - ADRs для архитектурных решений
   - README для каждого модуля
   - Troubleshooting guide

### Долгосрочные (3-6 месяцев)

1. **Архитектурные улучшения:**
   - GraphQL для сложных queries
   - CQRS для read/write разделения
   - Event sourcing для audit log

2. **Процессы:**
   - Code review checklist
   - Architecture review board
   - Regular tech debt sprints

---

## Метрики Успеха

### Технические Метрики

| Метрика | Текущее | Цель | Как Мерить |
|---------|---------|------|-----------|
| Багов/неделю | 4 | 1 | GitHub issues |
| Время исправления | 3 дня | 1 день | Lead time |
| Code coverage | 20% | 70% | Test reports |
| Cache hit rate | 60% | 90% | Redis stats |
| API error rate | 5% | <1% | Logs |

### Процессные Метрики

| Метрика | Текущее | Цель |
|---------|---------|------|
| PR review time | 2 дня | <4 часов |
| Hotfixes/месяц | 8 | 2 |
| Тех долг/спринт | 0% | 20% |
| Документация coverage | 10% | 80% |

---

## Выводы

### Что Мы Узнали

1. **Copy-paste - это технический долг** который множится с каждым использованием
2. **Неявные контракты** приводят к трудноуловимым багам
3. **"Работает в dev" ≠ "работает в production"** особенно для mobile/performance
4. **Частичные исправления** создают новые багы
5. **Отсутствие мониторинга** означает, что баги находят пользователи

### Что Нужно Изменить

1. **Культура:** Quality over speed, документация как код
2. **Процессы:** Чеклисты, code review, testing requirements
3. **Архитектура:** Shared utilities, explicit contracts, monitoring
4. **Инструменты:** Runtime validation, automated testing, observability

### Ключевое Правило

> "Если исправление бага требует изменений в более чем 2 файлах, это признак архитектурной проблемы, не локального бага."

---

## Связанные Документы

- [Pagination System Failures](./pagination-system-failures.md)
- [Rate Limiting Architecture Failures](./rate-limiting-architecture-failures.md)
- [Status Display Consistency Failures](./status-display-consistency-failures.md)
- [Caching Architecture Failures](./caching-architecture-failures.md)
- [API Architecture Failures](./api-architecture-failures.md)
- [Collection Page Crash (Race Condition)](./2026-02-25-collection-page-crash-after-load.md)
- [Similar Users Not Found (Similarity Logic)](./2026-02-24-similar-users-not-found.md)

---

*Создано: 2026-02-19*
*Автор: GSD System*
*Версия: 1.0*
