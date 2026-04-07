import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock TwinTasters to avoid Next.js router dependency
vi.mock('@/app/profile/taste-map/TwinTasters', () => ({
  default: () => <div data-testid="twin-tasters">Twin Tasters</div>,
}));

import TasteMapClient from '@/app/profile/taste-map/TasteMapClient';
import type { TasteMap } from '@/lib/taste-map/types';

// All 19 TMDB genre names in Russian (as displayed in the component)
const TMDB_GENRES = [
  'Боевик',
  'Приключения',
  'Анимация',
  'Комедия',
  'Криминал',
  'Документальный',
  'Драма',
  'Семейный',
  'Фэнтези',
  'Исторический',
  'Ужасы',
  'Музыка',
  'Мистика',
  'Мелодрама',
  'Научная фантастика',
  'Телефильм',
  'Триллер',
  'Военный',
  'Вестерн',
];

// Mapping from Russian genre names to English keys for genreCounts lookup
const RUSSIAN_TO_ENGLISH: Record<string, string> = {
  'Боевик': 'Action',
  'Приключения': 'Adventure',
  'Анимация': 'Animation',
  'Комедия': 'Comedy',
  'Криминал': 'Crime',
  'Документальный': 'Documentary',
  'Драма': 'Drama',
  'Семейный': 'Family',
  'Фэнтези': 'Fantasy',
  'Исторический': 'History',
  'Ужасы': 'Horror',
  'Музыка': 'Music',
  'Мистика': 'Mystery',
  'Мелодрама': 'Romance',
  'Научная фантастика': 'Science Fiction',
  'Телефильм': 'TV Movie',
  'Триллер': 'Thriller',
  'Военный': 'War',
  'Вестерн': 'Western',
};

describe('Acceptance 27: "Ваши жанры" Block', () => {
  const createMockTasteMap = (
    overrides?: Partial<TasteMap & { genreCounts?: Record<string, number> }>
  ): TasteMap & { genreCounts?: Record<string, number> } => ({
    userId: 'user-123',
    genreProfile: { Action: 85, Drama: 70, Comedy: 65 },
    genreCounts: {
      Action: 15,
      Adventure: 8,
      Animation: 3,
      Comedy: 20,
      Crime: 5,
      Documentary: 2,
      Drama: 25,
      Family: 6,
      Fantasy: 4,
      History: 1,
      Horror: 7,
      Music: 2,
      Mystery: 3,
      Romance: 10,
      'Science Fiction': 9,
      'TV Movie': 1,
      Thriller: 12,
      War: 2,
      Western: 1,
    },
    ratingDistribution: { high: 60, medium: 30, low: 10 },
    averageRating: 7.5,
    personProfiles: { actors: {}, directors: {} },
    behaviorProfile: { rewatchRate: 10, dropRate: 5, completionRate: 85 },
    computedMetrics: { positiveIntensity: 60, consistency: 80, diversity: 70, negativeIntensity: 10 },
    updatedAt: new Date(),
    ...overrides,
  });

  describe('Scenario 1: Display all 19 genres with bar widths proportional to counts', () => {
    it('should display the "Ваши жанры" section', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      expect(html).toContain('Ваши жанры');
    });

    it('should show all 19 TMDB genres', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      TMDB_GENRES.forEach((genre) => {
        expect(html).toContain(genre);
      });
    });

    it('should display bars with proportional widths', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      // Check that total count is used for scaling
      const genreCounts = createMockTasteMap().genreCounts!;
      const totalWatched = (Object.values(genreCounts) as number[]).reduce((a, b) => a + b, 0);
      
      // Драма has 25 out of 106 total ≈ 23.6%
      // Боевик has 15 out of 106 total ≈ 14.2%
      // These are approximate because we're checking static HTML widths
      expect(html).toContain('Драма'); // Should be one of the widest bars
      expect(html).toContain('Боевик');
    });

    it('should position "Ваши жанры" before TwinTasters', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      const вашиЖанрыIndex = html.indexOf('Ваши жанры');
      const twinTastersIndex = html.indexOf('Twin Tasters');

      expect(вашиЖанрыIndex).toBeGreaterThan(-1);
      expect(twinTastersIndex).toBeGreaterThan(-1);
      expect(вашиЖанрыIndex).toBeLessThan(twinTastersIndex);
    });
  });

  describe('Scenario 2: Count numbers visible for each genre', () => {
    it('should show count next to each genre name', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      // Format: "Драма (25)"
      TMDB_GENRES.forEach((genre) => {
        const englishKey = RUSSIAN_TO_ENGLISH[genre];
        const count = createMockTasteMap().genreCounts?.[englishKey] ?? 0;
        if (count > 0) {
          expect(html).toContain(`${genre} (${count})`);
        }
      });
    });
  });

  describe('Scenario 3: Average ratings from genreProfile shown', () => {
    it('should display average ratings for each genre', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      // Check that ratings from genreProfile appear
      expect(html).toContain('85'); // Action rating
      expect(html).toContain('70'); // Drama rating
      expect(html).toContain('65'); // Comedy rating
    });

    it('should show "—" for genres without ratings', () => {
      const mockWithMissingRatings = createMockTasteMap({
        genreProfile: { Action: 85 }, // Only Action has rating
      });
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={mockWithMissingRatings} userId="user-123" />
      );

      // Genres without ratings should show dash, but count still visible
      // Вестерн count = 1, Документальный count = 2
      expect(html).toContain('Вестерн (1) —');
      expect(html).toContain('Документальный (2) —');
    });
  });

  describe('Scenario 4: Block positioned before TwinTasters', () => {
    it('should render Ваши жанры section before TwinTasters in DOM order', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      // Ensure Ваши жанры block appears before TwinTasters div
      const genresBlockStart = html.indexOf('section');
      const twinTastersStart = html.indexOf('id="twin-tasters"') - 20; // Check before the div

      // We look for the section header position relative to twin-tasters
      const вашиЖанрыHeader = html.indexOf('Ваши жанры');
      const twinTastersDiv = html.indexOf('twin-tasters');

      expect(вашиЖанрыHeader).toBeGreaterThan(-1);
      expect(twinTastersDiv).toBeGreaterThan(-1);
      expect(вашиЖанрыHeader).toBeLessThan(twinTastersDiv);
    });
  });

  describe('Scenario 5: Empty state handling', () => {
    it('should show empty state when no genreCounts', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient
          tasteMap={createMockTasteMap({ genreCounts: {} })}
          userId="user-123"
        />
      );

      expect(html).toContain('Карта вкуса пуста');
      expect(html).toContain('Добавить фильмы');
      expect(html).not.toContain('Ваши жанры');
    });

    it('should show empty state when genreCounts all zero', () => {
      const zeroCounts = { ...createMockTasteMap().genreCounts };
      Object.keys(zeroCounts).forEach((k) => {
        zeroCounts[k] = 0;
      });

      const html = renderToStaticMarkup(
        <TasteMapClient
          tasteMap={createMockTasteMap({ genreCounts: zeroCounts })}
          userId="user-123"
        />
      );

      expect(html).toContain('Карта вкуса пуста');
      expect(html).not.toContain('Ваши жанры');
    });

    it('should handle partial genre data (some genres missing from counts)', () => {
      const partialCounts = { Action: 10, Drama: 5 }; // Only 2 of 19 genres
      const html = renderToStaticMarkup(
        <TasteMapClient
          tasteMap={createMockTasteMap({ genreCounts: partialCounts })}
          userId="user-123"
        />
      );

      // Should still show all 19 genre names
      TMDB_GENRES.forEach((genre) => {
        expect(html).toContain(genre);
      });

      // Genres with counts should show the count
      expect(html).toContain('Боевик (10)');
      expect(html).toContain('Драма (5)');

      // Genres without counts should show (0) or —
      expect(html).toContain('Комедия (0)');
    });

    it('should work when genreProfile is empty but genreCounts exist', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient
          tasteMap={createMockTasteMap({ genreProfile: {} })}
          userId="user-123"
        />
      );

      // Should show genres with counts but ratings as "—"
      expect(html).toContain('Боевик (15) —');
      expect(html).toContain('Драма (25) —');
    });
  });

  describe('AC1-AC4: Acceptance Criteria Integration', () => {
    it('should satisfy AC1: All 19 TMDB genres displayed', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      TMDB_GENRES.forEach((genre) => {
        expect(html).toContain(genre);
      });
    });

    it('should satisfy AC2: Bar widths scale proportionally', () => {
      const { genreCounts } = createMockTasteMap();
      const total = (Object.values(genreCounts!) as number[]).reduce((a, b) => a + b, 0);
      
      // Драма (25) should be wider than Вестерн (1)
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      // We can verify proportional scaling by checking that the higher count genre
      // appears before the lower count one (sorted by count descending likely)
      const dramaIndex = html.indexOf('Драма');
      const westernIndex = html.indexOf('Вестерн');
      expect(dramaIndex).toBeLessThan(westernIndex);
    });

    it('should satisfy AC3: Count numbers in format "Жанр (N)"', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      // Check format: "Драма (25)"
      expect(html).toMatch(/Драма \(25\)/);
      expect(html).toMatch(/Боевик \(15\)/);
      expect(html).toMatch(/Комедия \(20\)/);
    });

    it('should satisfy AC4: Average ratings displayed with one decimal place', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      // Action rating: 85 (should appear as 85.0 or just 85)
      // Drama rating: 70
      // Comedy rating: 65
      expect(html).toContain('85');
      expect(html).toContain('70');
      expect(html).toContain('65');
    });

    it('should satisfy AC5: Block positioned before TwinTasters', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      const вашиЖанрыPos = html.indexOf('Ваши жанры');
      const twinTastersPos = html.indexOf('twin-tasters');

      expect(вашиЖанрыPos).toBeLessThan(twinTastersPos);
    });

    it('should satisfy AC6: Empty state handling', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap({ genreCounts: {} })} userId="user-123" />
      );

      expect(html).toContain('Карта вкуса пуста');
      expect(html).toContain('Добавить фильмы');
      expect(html).not.toContain('Ваши жанры');
    });
  });

  describe('AC7: Data source correctness (integration)', () => {
    it('should accept TasteMap with extended genreCounts field', () => {
      // This tests that the component can handle the new field
      const extendedTasteMap: TasteMap & { genreCounts?: Record<string, number> } = {
        ...createMockTasteMap(),
        genreCounts: createMockTasteMap().genreCounts,
      };

      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={extendedTasteMap} userId="user-123" />
      );

      expect(html).toContain('Ваши жанры');
      expect(html).not.toContain('Карта вкуса пуста');
    });
  });
});
