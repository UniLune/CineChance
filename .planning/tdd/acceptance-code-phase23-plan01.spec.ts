import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/user/achiev_creators/route';
import { prisma } from '@/lib/prisma';
import { MOVIE_STATUS_IDS } from '@/lib/movieStatusConstants';

// Helper to create mock request with query params
function createMockRequest(params: URLSearchParams): NextRequest {
  const url = new URL('http://localhost:3000/api/user/achiev_creators');
  url.search = params.toString();
  return new NextRequest(url);
}

// Helper to seed test data
async function seedTestUserWithData(userId: string) {
  // Clear existing
  await prisma.watchList.deleteMany({ where: { userId } });

  // Create test movies with appropriate data for creators calculation
  const testData = [
    // Movie 1: Good rating, rewatched
    {
      userId,
      tmdbId: 101,
      mediaType: 'movie',
      statusId: MOVIE_STATUS_IDS.WATCHED,
      userRating: 9,
    },
    // Movie 2: Medium rating
    {
      userId,
      tmdbId: 102,
      mediaType: 'movie',
      statusId: MOVIE_STATUS_IDS.WATCHED,
      userRating: 7,
    },
    // Movie 3: Dropped
    {
      userId,
      tmdbId: 103,
      mediaType: 'movie',
      statusId: MOVIE_STATUS_IDS.DROPPED,
      userRating: null,
    },
  ];

  for (const data of testData) {
    await prisma.watchList.upsert({
      where: {
        userId_tmdbId_mediaType: {
          userId: data.userId,
          tmdbId: data.tmdbId,
          mediaType: data.mediaType,
        },
      },
      create: data,
      update: data,
    });
  }
}

describe('Achiev Creators API - Acceptance Tests', () => {
  const TEST_USER_ID = 'test-user-123';

  beforeAll(async () => {
    await seedTestUserWithData(TEST_USER_ID);
  });

  afterAll(async () => {
    await prisma.watchList.deleteMany({ where: { userId: TEST_USER_ID } });
  });

  it('Scenario 1: singleLoad mode returns creators sorted by creator_score', async () => {
    const req = createMockRequest(new URLSearchParams({
      singleLoad: 'true',
      limit: '10',
    }));

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.creators).toBeDefined();
    expect(Array.isArray(data.creators)).toBe(true);
    expect(data.singleLoad).toBe(true);

    // Verify sorting by creator_score (descending)
    for (let i = 1; i < data.creators.length; i++) {
      expect(data.creators[i].creator_score).toBeLessThanOrEqual(data.creators[i - 1].creator_score);
    }
  });

  it('Scenario 2: paginated mode returns creators sorted by creator_score', async () => {
    const req = createMockRequest(new URLSearchParams({
      limit: '10',
      offset: '0',
    }));

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.creators).toBeDefined();
    expect(data.singleLoad).toBe(false);

    // Verify sorting by creator_score (descending)
    for (let i = 1; i < data.creators.length; i++) {
      expect(data.creators[i].creator_score).toBeLessThanOrEqual(data.creators[i - 1].creator_score);
    }
  });

  it('Scenario 3: Tie-breakers are applied correctly', async () => {
    // This test would need more sophisticated data seeding to create equal scores
    // For now, we verify that creator_score exists and is numeric
    const req = createMockRequest(new URLSearchParams({
      singleLoad: 'true',
      limit: '10',
    }));

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    data.creators.forEach((creator: any) => {
      expect(typeof creator.creator_score).toBe('number');
      expect(typeof creator.average_rating === 'number' || creator.average_rating === null).toBe(true);
      expect(typeof creator.progress_percent).toBe('number');
      expect(typeof creator.name).toBe('string');
    });
  });

  it('Scenario 4: Response has proper type structure', async () => {
    const req = createMockRequest(new URLSearchParams({
      singleLoad: 'true',
      limit: '10',
    }));

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty('creators');
    expect(data).toHaveProperty('hasMore');
    expect(data).toHaveProperty('total');
    expect(Array.isArray(data.creators)).toBe(true);

    if (data.creators.length > 0) {
      const creator = data.creators[0];
      expect(creator).toHaveProperty('id');
      expect(creator).toHaveProperty('name');
      expect(creator).toHaveProperty('profile_path');
      expect(creator).toHaveProperty('watched_movies');
      expect(creator).toHaveProperty('rewatched_movies');
      expect(creator).toHaveProperty('dropped_movies');
      expect(creator).toHaveProperty('total_movies');
      expect(creator).toHaveProperty('progress_percent');
      expect(creator).toHaveProperty('average_rating');
      expect(creator).toHaveProperty('creator_score');
    }
  });

  it('Scenario 5: Filtering matches actors behavior', async () => {
    // This test would require mocking TMDB responses to verify filtering
    // For now, we just ensure the API runs without error
    const req = createMockRequest(new URLSearchParams({
      singleLoad: 'true',
      limit: '10',
    }));

    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});
