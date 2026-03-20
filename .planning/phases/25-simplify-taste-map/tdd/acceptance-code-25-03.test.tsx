import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock TwinTasters to avoid Next.js router dependency
vi.mock('@/app/profile/taste-map/TwinTasters', () => ({
  default: () => null,
}));

import TasteMapClient from '@/app/profile/taste-map/TasteMapClient';
import type { TasteMap } from '@/lib/taste-map/types';

describe('Acceptance 25-03: Remove Chart Visualizations', () => {
  const createMockTasteMap = (overrides?: Partial<TasteMap>): TasteMap => ({
    userId: 'user-123',
    genreProfile: { Action: 30, Drama: 25 },
    genreCounts: { Action: 30, Drama: 25 },
    ratingDistribution: { high: 60, medium: 30, low: 10 },
    averageRating: 7.5,
    personProfiles: { actors: {}, directors: {} },
    behaviorProfile: { rewatchRate: 10, dropRate: 5, completionRate: 85 },
    computedMetrics: { positiveIntensity: 60, consistency: 80, diversity: 70, negativeIntensity: 10 },
    updatedAt: new Date(),
    ...overrides,
  });

  describe('Scenario 1: Page loads without chart blocks', () => {
    it('should render summary stats', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      // After Phase 25 simplification, summary stats correspond to the four metric cards
      expect(html).toContain('Положительный настрой');
      expect(html).toContain('Критический настрой');
      expect(html).toContain('Консистентность');
      expect(html).toContain('Разнообразие');
    });

    it('should render computed metrics section', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      expect(html).toContain('Метрики профиля');
      expect(html).toContain('Положительный настрой');
      expect(html).toContain('Критический настрой');
    });

    it('should render behavior profile section', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      expect(html).toContain('Поведенческий профиль');
      expect(html).toContain('Пересмотры');
      expect(html).toContain('Брошено');
      expect(html).toContain('Завершение');
    });

    it('should NOT render genre profile bar chart block', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      expect(html).not.toContain('Профиль жанров');
    });

    it('should NOT render rating distribution pie chart block', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      expect(html).not.toContain('Распределение оценок');
    });

    it('should NOT import recharts in rendered output', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient tasteMap={createMockTasteMap()} userId="user-123" />
      );

      expect(html).not.toContain('recharts');
    });
  });

  describe('Scenario 2: Empty state unchanged', () => {
    it('should show empty state when no genre data', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient
          tasteMap={createMockTasteMap({ genreProfile: {} })}
          userId="user-123"
        />
      );

      expect(html).toContain('Карта вкуса пуста');
      expect(html).toContain('Добавить фильмы');
    });

    it('should not show any chart blocks in empty state', () => {
      const html = renderToStaticMarkup(
        <TasteMapClient
          tasteMap={createMockTasteMap({ genreProfile: {} })}
          userId="user-123"
        />
      );

      expect(html).not.toContain('Профиль жанров');
      expect(html).not.toContain('Распределение оценок');
      expect(html).not.toContain('Метрики профиля');
    });
  });
});
