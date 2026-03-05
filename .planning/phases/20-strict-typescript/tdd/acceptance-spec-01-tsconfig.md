# Acceptance Spec: TypeScript Strict Mode Migration

**Phase:** 20 Task 1  
**Component:** `tsconfig.json`  
**Objective:** Enable strict TypeScript mode to catch more type errors during development.

---

## User Stories

### US-1: Strict Type Checking
As a developer, I want TypeScript to enforce strict type checking, so that potential bugs are caught early.

**Scenarios:**
- Given tsconfig.json has `strict: true`
- And `noImplicitAny: true`
- And `strictNullChecks: true`
- When the TypeScript compiler runs
- Then it should flag any implicit any types
- And it should flag any nullable type issues
- And it should enforce strict type adherence

### US-2: Modern Target
As a developer, I want the compilation target to be es2017 or higher, so we can use modern JavaScript features.

**Scenarios:**
- Given the `target` is set to `"es2017"`
- When the TypeScript compiler emits code
- Then the output should use ES2017+ syntax

---

## Acceptance Criteria

1. **Strict Mode:** `compilerOptions.strict` must be `true` (enables all strict type-checking options).
2. **No Implicit Any:** `compilerOptions.noImplicitAny` must be `true` (disallows implicit `any` types).
3. **Strict Null Checks:** `compilerOptions.strictNullChecks` must be `true` (ensures null/undefined are distinct types).
4. **Modern Target:** `compilerOptions.target` must be `"es2017"` (or higher).
5. **Preserve Existing Options:** All other compiler options (lib, module, jsx, paths, plugins, etc.) must remain unchanged.
6. **Include/Exclude:** `include` and `exclude` arrays must remain unchanged.
7. **Compiler Validation:** `npx tsc --noEmit` must complete without configuration errors.

---

## Test Scope

Unit tests should verify:
- The tsconfig.json file contains the required compilerOptions values.
- The file remains valid JSON.
- No required options are removed or altered beyond the specified changes.

---

## Out of Scope

- Actual type-checking of source files (the compiler will do that).
- Performance of compilation.
- Changes to dependencies or build scripts.

---

## References

- Phase 20 Plan: `.planning/phases/20-strict-typescript/20-PLAN.md`
- Source file: `tsconfig.json`
