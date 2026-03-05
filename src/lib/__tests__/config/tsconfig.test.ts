import { readFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { describe, it, expect, beforeAll } from 'vitest';

interface TSConfig {
  compilerOptions: Record<string, unknown>;
  include?: string[];
  exclude?: string[];
}

const PROJECT_ROOT = process.cwd();
const TSCONFIG_PATH = join(PROJECT_ROOT, 'tsconfig.json');

describe('TypeScript Configuration - Strict Mode Migration', () => {
  let tsconfig: TSConfig;

  beforeAll(() => {
    const content = readFileSync(TSCONFIG_PATH, 'utf-8');
    tsconfig = JSON.parse(content);
  });

  describe('compilerOptions settings', () => {
    it('has target: "es2017"', () => {
      expect(tsconfig.compilerOptions.target).toBe('es2017');
    });

    it('has strict: true', () => {
      expect(tsconfig.compilerOptions.strict).toBe(true);
    });

    it('has noImplicitAny: true', () => {
      expect(tsconfig.compilerOptions.noImplicitAny).toBe(true);
    });

    it('has strictNullChecks: true', () => {
      expect(tsconfig.compilerOptions.strictNullChecks).toBe(true);
    });

    it('preserves essential compiler options', () => {
      const expectedOptions = [
        'lib',
        'allowJs',
        'skipLibCheck',
        'forceConsistentCasingInFileNames',
        'noEmit',
        'esModuleInterop',
        'module',
        'moduleResolution',
        'resolveJsonModule',
        'isolatedModules',
        'jsx',
        'incremental',
        'plugins',
        'paths'
      ];

      expectedOptions.forEach(option => {
        expect(tsconfig.compilerOptions).toHaveProperty(option);
      });
    });

    it('preserves lib array', () => {
      expect(Array.isArray(tsconfig.compilerOptions.lib)).toBe(true);
      expect(tsconfig.compilerOptions.lib).toContain('dom');
      expect(tsconfig.compilerOptions.lib).toContain('dom.iterable');
      expect(tsconfig.compilerOptions.lib).toContain('esnext');
    });

    it('preserves module settings', () => {
      expect(tsconfig.compilerOptions.module).toBe('esnext');
      expect(tsconfig.compilerOptions.moduleResolution).toBe('node');
    });

    it('preserves JSX setting', () => {
      expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
    });

    it('preserves path aliases', () => {
      expect(tsconfig.compilerOptions.paths).toHaveProperty('@/*');
      expect(tsconfig.compilerOptions.paths).toHaveProperty('@/app/api/auth/[...nextauth]/*');
    });

    it('preserves Next.js plugin configuration', () => {
      expect(Array.isArray(tsconfig.compilerOptions.plugins)).toBe(true);
      expect(tsconfig.compilerOptions.plugins).toContainEqual({ name: 'next' });
    });
  });

  describe('include/exclude patterns', () => {
    it('preserves include array', () => {
      expect(Array.isArray(tsconfig.include)).toBe(true);
      expect(tsconfig.include).toContain('next-env.d.ts');
      expect(tsconfig.include).toContain('**/*.ts');
      expect(tsconfig.include).toContain('**/*.tsx');
      expect(tsconfig.include).toContain('.next/types/**/*.ts');
      expect(tsconfig.include).toContain('.next/dev/types/**/*.ts');
    });

    it('preserves exclude array', () => {
      expect(Array.isArray(tsconfig.exclude)).toBe(true);
      expect(tsconfig.exclude).toContain('node_modules');
    });
  });

  describe('TypeScript compiler validation', () => {
    it('runs tsc --noEmit without configuration errors', async () => {
      // Use execa or simple spawn with proper handling
      const { stdout, stderr, status } = await new Promise<{
        stdout: Buffer;
        stderr: Buffer;
        status: number;
      }>((resolve, reject) => {
        const proc = spawn('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
          cwd: PROJECT_ROOT,
          stdio: 'pipe',
          shell: true,
          timeout: 15000 // 15 second timeout for the process
        });

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];

        proc.stdout?.on('data', (data) => stdoutChunks.push(Buffer.from(data)));
        proc.stderr?.on('data', (data) => stderrChunks.push(Buffer.from(data)));

        proc.on('close', (code) => {
          resolve({
            stdout: Buffer.concat(stdoutChunks),
            stderr: Buffer.concat(stderrChunks),
            status: code ?? 0
          });
        });

        proc.on('error', reject);
      });

      const stdoutText = stdout.toString();
      const stderrText = stderr.toString();

      // Configuration should be valid (exit code 0 or 1)
      // 0 = no errors, 1 = type errors in code (okay), anything else indicates config failure
      expect([0, 1]).toContain(status);

      // Should not have configuration-related errors
      const configErrors = [
        'error TS6046: Argument for \'--project\' option must be an existing file',
        'error TS5055: Cannot write file',
        'error TS1127: Invalid character',
        'error TS1005: \';\' expected',
        'error TS1109: Expression expected',
        'Unknown compiler option'
      ];

      const combinedOutput = stdoutText + stderrText;
      configErrors.forEach(errorPattern => {
        expect(combinedOutput).not.toMatch(errorPattern);
      });
    });
  });
});
