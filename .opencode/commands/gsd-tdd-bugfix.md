---
description: "Find and fix a UI bug via TDD. Usage: /gsd-tdd-bugfix \"описание проблемы\""
agent: gsd-tdd-orchestrator
---

Баг найден в браузере: **$ARGUMENTS**

Выполни все шаги автоматически без остановок. Переходи к следующему шагу сразу после завершения предыдущего.

## Шаг 1 — Анализ → вызови gsd-tdd-bugfixer
Передай описание бага. Bugfixer создаёт `.planning/debug/resolved/<slug>.md`.
Единственная допустимая пауза — если bugfixer задаёт уточняющие вопросы пользователю.
После получения ответов — продолжай автоматически.

## Шаг 2 — RED → вызови gsd-tdd-red
Прочитай `.planning/debug/resolved/<slug>.md` раздел "Spec для RED теста".
Напиши тест. Убедись что RED. Сразу переходи к Шагу 3.

## Шаг 3 — GREEN → вызови gsd-tdd-green
Минимальное исправление. Убедись что GREEN. Сразу переходи к Шагу 4.

## Шаг 4 — REFACTOR → вызови gsd-tdd-refactor
Чистка кода. Убедись что тесты остались GREEN. Сразу переходи к Шагу 5.

## Шаг 5 — Верификация → вызови gsd-tdd-verifier
```bash
npx vitest run --reporter=verbose 2>&1 | tail -30
npx tsc --noEmit 2>&1 | head -20
```

## Финальный отчёт
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Bug Fixed — проверьте в браузере
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bug: $ARGUMENTS
Report: .planning/debug/resolved/<slug>.md
Тесты: N passed / 0 failed
Регрессии: не обнаружены

После визуальной проверки запустите:
/gsd-tdd-docs-update
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
