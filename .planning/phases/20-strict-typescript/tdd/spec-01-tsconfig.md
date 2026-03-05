# Unit Test Specification: tsconfig.json Strict Mode

**Phase:** 20 Task 1  
**Target File:** `tsconfig.json`  
**Test File:** `src/lib/__tests__/config/tsconfig.test.ts`

---

## Test Cases

### 1. Verify Compiler Target
- **Purpose:** Ensure compilation target is es2017.
- **Test:** Read tsconfig.json and assert `compilerOptions.target === "es2017"`.

### 2. Verify Strict Mode
- **Purpose:** Ensure strict type checking is enabled.
- **Test:** Assert `compilerOptions.strict === true`.

### 3. Verify No Implicit Any
- **Purpose:** Ensure implicit any types are disallowed.
- **Test:** Assert `compilerOptions.noImplicitAny === true`.

### 4. Verify Strict Null Checks
- **Purpose:** Ensure null/undefined are distinct types.
- **Test:** Assert `compilerOptions.strictNullChecks === true`.

### 5. Preserve Other Options
- **Purpose:** Ensure existing options are not removed.
- **Test:** Verify presence of options: lib, allowJs, skipLibCheck, forceConsistentCasingInFileNames, noEmit, esModuleInterop, module, moduleResolution, resolveJsonModule, isolatedModules, jsx, incremental, plugins, paths.

### 6. Preserve Include/Exclude
- **Purpose:** Ensure file patterns unchanged.
- **Test:** Verify `include` and `exclude` arrays contain expected entries.

### 7. Compiler Validation
- **Purpose:** Ensure tsconfig is valid for TypeScript.
- **Test:** Run `npx tsc --noEmit` and assert exit code 0 or 1 (0 = no errors, 1 = type errors in code, but config valid).

---

## Mocking Strategy

- No mocking needed; directly read tsconfig.json file.
- Use Node.js `fs` module to read file.
- Use `path` to construct absolute path.

---

## Coverage Goals

- **Lines:** 100% (simple config file)
- **Branches:** N/A (no branches)
- **Statements:** 100%

All assertions must be tested.

---

## Test Structure

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

describe('tsconfig.json', () => {
  let config: any;

  beforeAll(() => {
    const content = readFileSync(join(process.cwd(), 'tsconfig.json'), 'utf-8');
    config = JSON.parse(content);
  });

  it('has target: "es2017"', () => {
    expect(config.compilerOptions.target).toBe('es2017');
  });

  it('has strict: true', () => {
    expect(config.compilerOptions.strict).toBe(true);
  });

  it('has noImplicitAny: true', () => {
    expect(config.compilerOptions.noImplicitAny).toBe(true);
  });

  it('has strictNullChecks: true', () => {
    expect(config.compilerOptions.strictNullChecks).toBe(true);
  });

  // Additional preservation checks...
});
```

---

## Success Criteria

- [ ] All test cases implemented
- [ ] Tests fail before implementation (RED)
- [ ] Tests pass after updating tsconfig.json (GREEN)
- [ ] Full coverage of required config changes
