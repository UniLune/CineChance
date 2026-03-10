# Bug: Collection Page Crash After Load from Home Page

## Issue Description

Когда пользователь переходит на страницу коллекции фильма с главной страницы (путём клика по ссылке коллекции в модалке MovieCard), страница загружается нормально, но через ~1-2 секунды падает с ошибкой:

```
[ERROR] Collection fetch error {}
```

## Root Cause

**Race condition + Double-fetch в useEffect:**

1. При переходе с главной страницы запускается `fetchCollection` в `CollectionClient.tsx`
2. Первый fetch успешно загружает коллекцию и отрисовывает страницу
3. При переходе (Suspense boundary transition или Turbopack hot reload) компонент может перерендериться
4. **Без AbortController** старый fetch не отменяется, а новый стартует
5. Если старый fetch ещё выполняется в фоне, он может попытаться обновить state после unmount или вызвать state update после новой загрузки
6. Это приводит к потере синхронизации state и повторному вызову error handler

Также проблема усугубляется отсутствием checks на `isMounted` и чека сигнала `aborted`.

## Solution

### 1. Добавлен AbortController в fetchCollection (первый useEffect)
- При размонтировании компонента или смене `collectionId` старый запрос отменяется
- Предотвращает memory leak и state update после unmount

### 2. Добавлен isMounted флаг
- Дополнительная защита от state updates после unmount
- Проверяется перед `setState` вызовами

### 3. Отфильтровано логирование AbortError
- AbortError теперь не логируется как ошибка (это нормальное поведение при отмене запроса)

### 4. Улучшено логирование в API
- Добавлены параметры `collectionId` и `context` для лучшей отладки

## Files Changed

1. **src/app/collection/[id]/CollectionClient.tsx**
   - Добавлен AbortController к первому useEffect (fetchCollection)
   - Добавлен AbortController ко второму useEffect (fetchWatchlistStatuses)
   - Добавлены isMounted флаги
   - Улучшено логирование ошибок

2. **src/app/api/collection/[id]/route.ts**
   - Добавлены parameters `collectionId` и `context` в логирование

## Testing

После фикса:
1. ✅ Переход на страницу коллекции с главной страницы не вызывает crash
2. ✅ Страница коллекции загружается и остаётся стабильной
3. ✅ При быстром переходе между коллекциями старые запросы отменяются
4. ✅ Нет memory leaks от незавершённых fetch запросов

## Prevention

Воспользуемся этим как template для других fetch операций в компонентах:

```typescript
useEffect(() => {
  const abortController = new AbortController();
  let isMounted = true;

  const fetchData = async () => {
    try {
      const res = await fetch(url, { signal: abortController.signal });
      
      if (!abortController.signal.aborted && isMounted) {
        const data = await res.json();
        setState(data);
      }
    } catch (err) {
      if (!abortController.signal.aborted && isMounted) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg !== 'The operation was aborted.') {
          // Handle error
        }
      }
    }
  };

  fetchData();

  return () => {
    isMounted = false;
    abortController.abort();
  };
}, [dependencies]);
```

## References

- Pattern: AbortController for fetch cancellation (MDN)
- Race condition prevention in React hooks
- Related: TWIN_TASTERS_WATCHED_MOVIES_FIX.md (similar pattern for stats API)
