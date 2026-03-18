import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock TwinTasters to avoid Next.js router dependency
vi.mock('@/app/profile/taste-map/TwinTasters', () => ({
  default: () => null,
}));

import TasteMapClient from '@/app/profile/taste-map/TasteMapClient';
import type { TasteMap } from '@/lib/taste-map/types';

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
    const html = renderToStaticMarkup(
      <TasteMapClient
        tasteMap={createMockTasteMap()}
        userId="user-123"
      />
    );

    expect(html).toBeTruthy();
  });

  it('should render genre profile section', () => {
    const html = renderToStaticMarkup(
      <TasteMapClient
        tasteMap={createMockTasteMap({
          genreProfile: { Action: 30, Drama: 25, Comedy: 20 },
        })}
        userId="user-123"
      />
    );

    expect(html).toContain('Профиль жанров');
    expect(html).toContain('recharts');
  });

  it('should render without topActors/topDirectors props', () => {
    // These props were removed in phase 25
    const html = renderToStaticMarkup(
      <TasteMapClient
        tasteMap={createMockTasteMap()}
        userId="user-123"
      />
    );

    expect(html).not.toContain('Любимые актеры');
    expect(html).not.toContain('Любимые режиссеры');
    expect(html).not.toContain('Actor One');
    expect(html).not.toContain('Director One');
  });
});
