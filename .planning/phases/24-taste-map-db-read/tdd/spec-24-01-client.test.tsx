import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock TwinTasters to avoid Next.js router dependency
vi.mock('@/app/profile/taste-map/TwinTasters', () => ({
  default: () => null,
}));

import TasteMapClient from '@/app/profile/taste-map/TasteMapClient';
import type { TasteMap } from '@/lib/taste-map/types';

// Simple component test using server-side rendering (no DOM needed)

describe('TasteMapClient Props and Rendering', () => {
  const createMockTasteMap = (overrides?: Partial<TasteMap>): TasteMap => ({
    userId: 'user-123',
    genreProfile: { Action: 30, Drama: 25 },
    ratingDistribution: { high: 60, medium: 30, low: 10 },
    averageRating: 7.5,
    personProfiles: { actors: {}, directors: {} },
    behaviorProfile: { rewatchRate: 10, dropRate: 5, completionRate: 85 },
    computedMetrics: { positiveIntensity: 60, consistency: 80, diversity: 70, negativeIntensity: 10 },
    updatedAt: new Date(),
    ...overrides,
  });

  it('should render without crashing when given valid props', () => {
    const topActors = [['Actor One', 8.5]] as const;
    const topDirectors = [['Director One', 9.0]] as const;

    // Should not throw
    const html = renderToStaticMarkup(
      <TasteMapClient
        tasteMap={createMockTasteMap()}
        userId="user-123"
        topActors={topActors}
        topDirectors={topDirectors}
      />
    );

    expect(html).toContain('Любимые актеры');
    expect(html).toContain('Actor One');
    expect(html).toContain('8.5');
    expect(html).toContain('Любимые режиссеры');
    expect(html).toContain('Director One');
    expect(html).toContain('9.0');
  });

  it('should display empty state when topActors is empty', () => {
    const topActors: Array<[string, number]> = [];
    const topDirectors = [['Director', 9.0]] as const;

    const html = renderToStaticMarkup(
      <TasteMapClient
        tasteMap={createMockTasteMap()}
        userId="user-123"
        topActors={topActors}
        topDirectors={topDirectors}
      />
    );

    expect(html).toContain('Нет данных об актерах');
    expect(html).toContain('Director');
  });

  it('should display empty state when topDirectors is empty', () => {
    const topActors = [['Actor', 8.5]] as const;
    const topDirectors: Array<[string, number]> = [];

    const html = renderToStaticMarkup(
      <TasteMapClient
        tasteMap={createMockTasteMap()}
        userId="user-123"
        topActors={topActors}
        topDirectors={topDirectors}
      />
    );

    expect(html).toContain('Нет данных о режиссерах');
    expect(html).toContain('Actor');
  });

  it('should format scores to one decimal place using toFixed(1)', () => {
    const topActors = [
      ['Actor A', 8.555],
      ['Actor B', 7.2],
    ] as const;
    const topDirectors: Array<[string, number]> = [];

    const html = renderToStaticMarkup(
      <TasteMapClient
        tasteMap={createMockTasteMap()}
        userId="user-123"
        topActors={topActors}
        topDirectors={topDirectors}
      />
    );

    expect(html).toContain('8.6'); // 8.555 rounded to 8.6
    expect(html).toContain('7.2'); // 7.2 stays 7.2
  });

  it('should use correct links for actors and directors', () => {
    const topActors = [['Actor', 8.5]] as const;
    const topDirectors = [['Director', 9.0]] as const;

    const html = renderToStaticMarkup(
      <TasteMapClient
        tasteMap={createMockTasteMap()}
        userId="user-123"
        topActors={topActors}
        topDirectors={topDirectors}
      />
    );

    expect(html).toContain('href="/profile/actors"');
    expect(html).toContain('href="/profile/creators"');
  });

  it('should handle zero or negative scores gracefully with dash', () => {
    const topActors = [
      ['Actor A', 0],
      ['Actor B', -1],
    ] as const;
    const topDirectors: Array<[string, number]> = [];

    const html = renderToStaticMarkup(
      <TasteMapClient
        tasteMap={createMockTasteMap()}
        userId="user-123"
        topActors={topActors}
        topDirectors={topDirectors}
      />
    );

    // Both should show dash because score <= 0
    expect(html).toContain('(—)');
  });
});
