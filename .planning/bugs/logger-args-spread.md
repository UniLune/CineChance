# Bug: Logger throws TypeError when called with additional arguments

## Дата
2026-03-12

## Описание
При вызове методов `logger.error/warn/info/debug` с дополнительными аргументами возникает ошибка в браузере:

```
Uncaught TypeError: FormattableMessage is not iterable
    at Logger._log (src/lib/logger.ts:80:39)
```

Ошибка происходит всегда, когда в методы передачиются аргументы помимо основного сообщения.

## Шаги воспроизведения
1. В браузере открыть любое место, где используется логгер с дополнительными аргументами (например, `logger.error('msg', { info: 'test' })`).
2. Увидеть ошибку в консоли.

## Ожидаемое поведение
Логгер должен корректно логировать сообщение с любыми дополнительными аргументами, передавая их в `console.[level]`.

## Фактическое поведение
Spread-оператор `...args` в методе `_log` выбрасывает TypeError, потому что `args` оказывается неитерируемым (или `undefined`). В частности, в Chrome это проявляется как "FormattableMessage is not iterable".

## Локализация
- Файл: `src/lib/logger.ts`
- Функция/компонент: `Logger._log` (строки 76–86)
- Предполагаемая причина: ненормализованный `args`; приSpread-операторе ожидается, что `args` является итерируемым (массивом). В некоторых окружениях (или при определённых вызовах) `args` может быть `undefined` или не массивом, что приводит к падению.

## Acceptance критерии исправления
- [ ] Добавить RED тест, который воспроизводит падение при вызове `logger.[level]` с дополнительными аргументами.
- [ ] Исправить `_log` так, чтобы `args` всегда был массивом перед spread (использовать `Array.isArray` или `|| []`).
- [ ] Применить аналогичную защиту к `networkLogger` для консистентности.
- [ ] Все существующие тесты проходят.
- [ ] ESLint проходит без ошибок.

## Предлагаемое исправление
В методе `_log` нормализовать `args` в безопасный массив:

```typescript
private _log(level: LogLevel, msg: string, ...args: unknown[]) {
  const formatted = format(level, msg, this.context);
  if (this.output === 'console') {
    const safeArgs = Array.isArray(args) ? args : [];
    if (level === 'error') console.error(formatted, ...safeArgs);
    else if (level === 'warn') console.warn(formatted, ...safeArgs);
    else if (level === 'info') console.info(formatted, ...safeArgs);
    else console.debug(formatted, ...safeArgs);
  }
}
```

Для `networkLogger` предложено аналогичное исправление:

```typescript
export const networkLogger = {
  debug: (...args: unknown[]) => console.debug('[NETWORK_RETRY]', ...(Array.isArray(args) ? args : [])),
  info: (...args: unknown[]) => console.info('[NETWORK_RETRY]', ...(Array.isArray(args) ? args : [])),
  warn: (...args: unknown[]) => console.warn('[NETWORK_RETRY]', ...(Array.isArray(args) ? args : [])),
  error: (...args: unknown[]) => console.error('[NETWORK_RETRY]', ...(Array.isArray(args) ? args : [])),
};
```

Хотя `args` является rest-параметром и теоретически всегда массив, практика показывает, что в некоторых окружениях (Chrome) может возникать ситуация, когда spread получает неитерируемое значение. Добавление защиты делает код более устойчивым.
