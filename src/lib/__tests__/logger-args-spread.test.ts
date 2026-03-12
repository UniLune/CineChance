/**
 * Unit Tests: Logger Args Spread Bug
 * Bug Report: .planning/bugs/logger-args-spread.md
 * 
 * This test reproduces the bug where calling logger methods with
 * additional arguments throws TypeError: FormattableMessage is not iterable
 * 
 * The bug occurs when args is not properly handled (undefined or non-array),
 * causing "TypeError: X is not iterable" when using spread operator ...args
 * 
 * RED TEST: These tests should FAIL with current buggy implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger, logError, networkLogger } from '@/lib/logger';

// Helper class to access private _log method for testing
class TestableLogger extends Logger {
  // Expose private _log method for testing by re-declaring it as public
  public testLog(level: 'debug' | 'info' | 'warn' | 'error', msg: string, ...args: unknown[]) {
    // @ts-expect-error - accessing private method for testing
    return this._log(level, msg, ...args);
  }
}

describe('Logger args spread bug - RED test', () => {
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('Logger class with additional args (normal usage)', () => {
    it('should not throw TypeError when error is called with object argument', () => {
      const logger = new Logger({ level: 'error' });
      
      // This should NOT throw: TypeError: FormattableMessage is not iterable
      expect(() => {
        logger.error('Error occurred', { code: 500, details: 'Server error' });
      }).not.toThrow();
    });

    it('should not throw TypeError when warn is called with object argument', () => {
      const logger = new Logger({ level: 'warn' });
      
      expect(() => {
        logger.warn('Warning message', { retry: 3 });
      }).not.toThrow();
    });

    it('should not throw TypeError when info is called with multiple args', () => {
      const logger = new Logger({ level: 'info' });
      
      expect(() => {
        logger.info('Info message', { userId: '123' }, 'extra string', 42);
      }).not.toThrow();
    });

    it('should not throw TypeError when debug is called with additional args', () => {
      const logger = new Logger({ level: 'debug' });
      
      expect(() => {
        logger.debug('Debug message', { traceId: 'abc' });
      }).not.toThrow();
    });

    it('should forward additional args correctly to console.error', () => {
      const logger = new Logger({ level: 'error' });
      logger.error('Error occurred', { code: 500 });
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error occurred'),
        { code: 500 }
      );
    });

    it('should forward additional args correctly to console.warn', () => {
      const logger = new Logger({ level: 'warn' });
      logger.warn('Warning message', { retry: 3 });
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning message'),
        { retry: 3 }
      );
    });

    it('should forward additional args correctly to console.info', () => {
      const logger = new Logger({ level: 'info' });
      logger.info('Info message', { userId: '123' }, 'extra', 42);
      
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Info message'),
        { userId: '123' },
        'extra',
        42
      );
    });

    it('should forward additional args correctly to console.debug', () => {
      const logger = new Logger({ level: 'debug' });
      logger.debug('Debug message', { traceId: 'abc' });
      
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Debug message'),
        { traceId: 'abc' }
      );
    });
  });

  describe('Logger._log with direct non-array args (bug reproduction)', () => {
    /**
     * This test reproduces the exact bug from the bug report.
     * The bug occurs when _log receives a non-array as the args parameter.
     * In Chrome, this manifests as "TypeError: FormattableMessage is not iterable"
     * 
     * We simulate this by calling testLog with a single non-array argument,
     * which will be passed as the args parameter (not ...args rest parameter).
     */
    it('should handle error level with additional object arg without throwing', () => {
      const logger = new TestableLogger({ level: 'error' });
      
      // This should NOT throw after fix is applied
      // Current bug: may throw when args is not properly normalized
      expect(() => {
        logger.testLog('error', 'Test message', { code: 500 });
      }).not.toThrow();
    });

    it('should handle warn level with additional object arg without throwing', () => {
      const logger = new TestableLogger({ level: 'warn' });
      
      expect(() => {
        logger.testLog('warn', 'Test message', { retry: 3 });
      }).not.toThrow();
    });

    it('should handle info level with multiple args without throwing', () => {
      const logger = new TestableLogger({ level: 'info' });
      
      expect(() => {
        logger.testLog('info', 'Test message', { userId: '123' }, 'extra', 42);
      }).not.toThrow();
    });

    it('should handle debug level with additional args without throwing', () => {
      const logger = new TestableLogger({ level: 'debug' });
      
      expect(() => {
        logger.testLog('debug', 'Test message', { traceId: 'abc' });
      }).not.toThrow();
    });
  });

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

    it('should forward args correctly in networkLogger.error', () => {
      networkLogger.error('Network error', { status: 404 });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[NETWORK_RETRY]',
        'Network error',
        { status: 404 }
      );
    });

    it('should forward args correctly in networkLogger.warn', () => {
      networkLogger.warn('Network warning', { retry: true });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[NETWORK_RETRY]',
        'Network warning',
        { retry: true }
      );
    });

    it('should forward args correctly in networkLogger.info', () => {
      networkLogger.info('Network info', { url: '/api/test' });
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '[NETWORK_RETRY]',
        'Network info',
        { url: '/api/test' }
      );
    });

    it('should forward args correctly in networkLogger.debug', () => {
      networkLogger.debug('Network debug', { latency: 100 });
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[NETWORK_RETRY]',
        'Network debug',
        { latency: 100 }
      );
    });
  });

  describe('networkLogger with non-array args (bug reproduction)', () => {
    /**
     * This test directly reproduces the bug with spread operator on non-iterable.
     * The bug report shows this is exactly what happens in Chrome.
     */
    it('should handle spread of undefined without throwing', () => {
      expect(() => {
        const formatted = '[NETWORK_RETRY] Test';
        // Simulating what happens inside networkLogger when args handling fails
        // This directly tests the problematic pattern: spread on non-iterable
        // @ts-expect-error - intentionally passing non-iterable to reproduce bug
        console.error(formatted, ...undefined);
      }).not.toThrow();
    });

    it('should handle spread of null without throwing', () => {
      expect(() => {
        const formatted = '[NETWORK_RETRY] Test';
        // @ts-expect-error - intentionally passing non-iterable to reproduce bug
        console.error(formatted, ...null);
      }).not.toThrow();
    });

    it('should handle spread of number without throwing', () => {
      expect(() => {
        const formatted = '[NETWORK_RETRY] Test';
        // @ts-expect-error - intentionally passing non-iterable to reproduce bug
        console.error(formatted, ...12345);
      }).not.toThrow();
    });
  });

  describe('logError function with additional args', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should not throw when logError is called with error and extra context', () => {
      const error = new Error('Test error');
      
      expect(() => {
        logError('TestCtx', error, { userId: 'u1', action: 'login' });
      }).not.toThrow();
    });

    it('should not throw when logError is called with string error', () => {
      expect(() => {
        logError('Ctx', 'string error', { extra: 'data' });
      }).not.toThrow();
    });

    it('should not throw when logError is called with object error', () => {
      expect(() => {
        logError('Ctx', { code: 500, message: 'Fail' }, { extra: 'info' });
      }).not.toThrow();
    });
  });
});
