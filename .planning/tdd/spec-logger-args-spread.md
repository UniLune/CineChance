# Unit Test Specification: Logger Args Spread Bug

**Phase:** Bugfix Task  
**Target File:** `src/lib/logger.ts`  
**Test File:** `src/lib/__tests__/logger-args-spread.test.ts`  
**Bug Report:** `.planning/bugs/logger-args-spread.md`

---

## Background

This test reproduces the bug reported in `logger-args-spread.md`:

- **Error:** `TypeError: FormattableMessage is not iterable`
- **Location:** `src/lib/logger.ts:80:39` (console.error line)
- **Trigger:** Calling `logger.error/warn/info/debug` with additional arguments (e.g., `logger.error('msg', { info: 'test' })`)
- **Root Cause:** In certain environments (Chrome), when `args` is not properly an array, the spread operator `...args` throws TypeError

---

## Test Cases

### 1. Logger.error with additional object argument

```typescript
it('should not throw TypeError when error is called with object argument', () => {
  const logger = new Logger({ level: 'error' });
  
  // This should NOT throw: TypeError: FormattableMessage is not iterable
  expect(() => {
    logger.error('Error occurred', { code: 500, details: 'Server error' });
  }).not.toThrow();
});
```

### 2. Logger.warn with additional object argument

```typescript
it('should not throw TypeError when warn is called with object argument', () => {
  const logger = new Logger({ level: 'warn' });
  
  expect(() => {
    logger.warn('Warning message', { retry: 3 });
  }).not.toThrow();
});
```

### 3. Logger.info with multiple additional arguments

```typescript
it('should not throw TypeError when info is called with multiple args', () => {
  const logger = new Logger({ level: 'info' });
  
  expect(() => {
    logger.info('Info message', { userId: '123' }, 'extra string', 42);
  }).not.toThrow();
});
```

### 4. Logger.debug with additional arguments

```typescript
it('should not throw TypeError when debug is called with additional args', () => {
  const logger = new Logger({ level: 'debug' });
  
  expect(() => {
    logger.debug('Debug message', { traceId: 'abc' });
  }).not.toThrow();
});
```

### 5. networkLogger with additional arguments

```typescript
describe('networkLogger with additional args', () => {
  it('should not throw when networkLogger.error is called with object', () => {
    expect(() => {
      networkLogger.error('Network error', { status: 404 });
    }).not.toThrow();
  });

  it('should not throw when networkLogger.warn is called with object', () => {
    expect(() => {
      networkLogger.warn('Network warning', { retry: true });
    }).not.toThrow();
  });

  it('should not throw when networkLogger.info is called with object', () => {
    expect(() => {
      networkLogger.info('Network info', { url: '/api/test' });
    }).not.toThrow();
  });

  it('should not throw when networkLogger.debug is called with object', () => {
    expect(() => {
      networkLogger.debug('Network debug', { latency: 100 });
    }).not.toThrow();
  });
});
```

### 6. logError function with additional context

```typescript
describe('logError function with additional args', () => {
  it('should not throw when logError is called with error and extra context', () => {
    const error = new Error('Test error');
    
    expect(() => {
      logError('TestCtx', error, { userId: 'u1', action: 'login' });
    }).not.toThrow();
  });
});
```

---

## Implementation Notes

- **Test Approach:** These are negative tests - they verify that NO error is thrown
- **Expected Result:** Currently these tests WILL FAIL (RED) because the bug exists
- **After Fix:** All tests should pass when `args` is normalized to a safe array in `_log` method
- **Mocking:** Use `vi.spyOn(console, ...).mockImplementation(() => {})` to suppress console output during tests

---

## Acceptance Criteria

- [ ] All test cases from this spec are implemented
- [ ] Tests FAIL (RED) with the current buggy implementation
- [ ] Tests PASS after applying the fix (normalizing args to array)
- [ ] ESLint passes without errors
