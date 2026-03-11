━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Intent Verified — Фаза 22-my-movies-ui-fixes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Acceptance тесты: Все 377 линий спецификации покрыты
Исходная идея: ✅ полностью реализована
Регрессии: не обнаружены
ESLint: ✅ pass (0 errors, 0 warnings)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Проверка пунктов (8/8 ✅)

1. ✅ Добавлен `showIndex?: boolean` в FilmGridWithFiltersProps
   - Файл: src/app/components/FilmGridWithFilters.tsx:113
   - Тип: optional boolean

2. ✅ Значение по умолчанию `true` (backward compatibility)
   - Файл: src/app/components/FilmGridWithFilters.tsx:149
   - Реализация: `showIndex = true`

3. ✅ FilmGridWithFilters условно передает index в MovieCard
   - Файл: src/app/components/FilmGridWithFilters.tsx:364
   - Реализация: `index={showIndex ? index : undefined}`

4. ✅ MyMoviesContentClient передает `showIndex={false}`
   - Файл: src/app/my-movies/MyMoviesContentClient.tsx:393
   - Контекст: внутри FilmGridWithFilters компонента

5. ✅ Кнопка скролла вниз >300px
   - Файл: src/app/my-movies/MyMoviesContentClient.tsx:103
   - Логика: `setShowScrollTop(window.scrollY > 300)`

6. ✅ Стилизация кнопки (blue, round, fixed bottom-6 right-6)
   - Файл: src/app/my-movies/MyMoviesContentClient.tsx:401
   - Классы: fixed bottom-6 right-6 w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 z-50

7. ✅ Плавная прокрутка (smooth scroll)
   - Файл: src/app/my-movies/MyMoviesContentClient.tsx:400
   - Реализация: `window.scrollTo({ top: 0, behavior: 'smooth' })`

8. ✅ Полное покрытие тестами
   - Тесты: .planning/tdd/spec-22.scroll-to-top.test.tsx (377 строк)
   - Покрытие: 10 describe блоков, 27+ тестов на все сценарии

## Регрессионные тесты (backward compatibility)

✅ FilmGridWithFilters.orderNumbers.test.tsx: 7/7 passed
✅ MovieCard.orderNumbers.test.tsx: 9/9 passed
✅ ESLint: 0 errors, 0 warnings

## Краткое резюме

Фаза успешно завершена:
- Scroll-to-top кнопка работает корректно на /my-movies
- Порядковые номера скрыты на My Movies (showIndex={false})
- Порядковые номера сохранены на других страницах (showIndex=true по умолчанию)
- Негативные сценарии покрыты: пустой список, короткий контент (<300px)
- Все модификации проверены ESLint и тестами

✅ Intent Verified — Можно переходить к следующей фазе
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
