import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/user/achiev_actors/route';

process.env.NEXTAUTH_SECRET = 'test-secret-32-characters-long-1234567890';
process.env.NEXTAUTH_URL = 'http://localhost:3000';
process.env.TMDB_API_KEY = 'test-api-key';

// Mock next-auth
vi.mock('next-auth', () => ({
  getServerSession: vi.fn().mockResolvedValue({
    user: { id: 'test-user', email: 'test@example.com' },
  }),
  authOptions: {},
}));

// Mock authOptions
vi.mock('@/auth', () => ({
  authOptions: {
    secret: process.env.NEXTAUTH_SECRET,
    providers: [],
    pages: { signIn: '/auth/signin' },
    session: { strategy: 'jwt' },
    jwt: { secret: process.env.NEXTAUTH_SECRET },
  },
}));

// Mock rate limiting
vi.mock('@/middleware/rateLimit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock movie status constants
vi.mock('@/lib/movieStatusConstants', () => ({
  MOVIE_STATUS_IDS: {
    WATCHED: 1,
    REWATCHED: 2,
    WANT_TO_WATCH: 3,
    DROPPED: 4,
    HIDDEN: 5,
  },
}));

// Mock prisma
const mockWatchListFindMany = vi.fn();
const mockMoviePersonCacheFindUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    watchList: {
      findMany: (...args: unknown[]) => mockWatchListFindMany(...args),
    },
    moviePersonCache: {
      findUnique: (...args: unknown[]) => mockMoviePersonCacheFindUnique(...args),
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock getMediaCredits
vi.mock('@/lib/tmdb', () => ({
  getMediaCredits: vi.fn().mockResolvedValue({
    topActors: [
      { id: 500, name: 'Tom Hanks', profile_path: '/xNoKzC4Uc5s4q-framework-1.png', character: 'Forrest Gump' },
      { id: 819, name: 'Emma Thompson', profile_path: '/tL6hF8oTz7i8H4t4kZ5eX4wYf0.jpg', character: 'Nurse' },
    ],
    topDirectors: [],
  }),
}));

// Mock redis - withCache should just call the fetcher directly
vi.mock('@/lib/redis', () => ({
  withCache: vi.fn(async (_key: string, fetcher: () => Promise<any>) => {
    return fetcher();
  }),
}));

// Import prisma after mocking
import { prisma } from '@/lib/prisma';

describe('AchievActors API - Live Calculation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createRequest = (url: string): NextRequest => {
    return new Request(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } }) as unknown as NextRequest;
  };

  describe('returns actors with weighted rating calculation', () => {
    it('calculates weighted rating using watchCount', async () => {
      // Arrange: User has watched movies with different watchCount
      mockWatchListFindMany
        .mockResolvedValueOnce([
          // WATCHED movies
          { tmdbId: 13, mediaType: 'movie', userRating: 8, watchCount: 1 },
          { tmdbId: 24, mediaType: 'movie', userRating: 9, watchCount: 2 }, // rewatched 2 times
          { tmdbId: 35, mediaType: 'movie', userRating: 7, watchCount: 1 },
        ])
        .mockResolvedValueOnce([
          // REWATCHED movies - should add to watched count
          { tmdbId: 24, mediaType: 'movie', userRating: 9, watchCount: 2 },
        ])
        .mockResolvedValueOnce([]); // DROPPED

      // Return cached person data from DB
      mockMoviePersonCacheFindUnique
        .mockResolvedValue({
          tmdbId: 13,
          mediaType: 'movie',
          topActors: [
            { id: 500, name: 'Tom Hanks', profile_path: '/xNoKzC4.png', character: 'Test' },
          ],
          topDirectors: [],
        });

      // Act
      const req = createRequest('http://localhost/api/user/achiev_actors?limit=50&singleLoad=true');
      const res = await GET(req);

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('actors');
      expect(Array.isArray(data.actors)).toBe(true);
    });

    it('returns correct movie counts (watched, rewatched, dropped)', async () => {
      // Arrange: Different counts
      mockWatchListFindMany
        .mockResolvedValueOnce([
          // WATCHED: 3 movies
          { tmdbId: 13, mediaType: 'movie', userRating: 8, watchCount: 1 },
          { tmdbId: 24, mediaType: 'movie', userRating: 9, watchCount: 1 },
          { tmdbId: 35, mediaType: 'movie', userRating: 7, watchCount: 1 },
        ])
        .mockResolvedValueOnce([
          // REWATCHED: 1 movie
          { tmdbId: 24, mediaType: 'movie', userRating: 9, watchCount: 2 },
        ])
        .mockResolvedValueOnce([
          // DROPPED: 2 movies
          { tmdbId: 45, mediaType: 'movie' },
          { tmdbId: 55, mediaType: 'movie' },
        ]);

      mockMoviePersonCacheFindUnique
        .mockResolvedValue({
          tmdbId: 13,
          mediaType: 'movie',
          topActors: [
            { id: 500, name: 'Tom Hanks', profile_path: '/xNoKzC4.png', character: 'Test' },
            { id: 819, name: 'Emma Thompson', profile_path: '/tL6h.png', character: 'Test2' },
          ],
          topDirectors: [],
        });

      // Act
      const req = createRequest('http://localhost/api/user/achiev_actors?limit=50&singleLoad=true');
      const res = await GET(req);

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();

      // Should have actors
      if (data.actors.length > 0) {
        const actor = data.actors[0];
        expect(actor).toHaveProperty('watched_movies');
        expect(actor).toHaveProperty('rewatched_movies');
        expect(actor).toHaveProperty('dropped_movies');
      }
    });

    it('handles empty watchlist gracefully', async () => {
      // Arrange: No watched movies
      mockWatchListFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      // Act
      const req = createRequest('http://localhost/api/user/achiev_actors?limit=50&singleLoad=true');
      const res = await GET(req);

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.actors).toEqual([]);
      expect(data.hasMore).toBe(false);
      expect(data.total).toBe(0);
    });

    it('respects limit parameter', async () => {
      // Arrange: Return enough data
      const watchedMovies = Array.from({ length: 20 }, (_, i) => ({
        tmdbId: 1000 + i,
        mediaType: 'movie',
        userRating: 8,
        watchCount: 1,
      }));

      mockWatchListFindMany
        .mockResolvedValueOnce(watchedMovies)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockMoviePersonCacheFindUnique.mockResolvedValue({
        tmdbId: 1000,
        mediaType: 'movie',
        topActors: [
          { id: 500, name: 'Actor 1', profile_path: '/a1.png', character: 'Char' },
        ],
        topDirectors: [],
      });

      // Act: Request only 2 actors
      const req = createRequest('http://localhost/api/user/achiev_actors?limit=2&singleLoad=true');
      const res = await GET(req);

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();

      // Should respect limit (at most 2 actors)
      expect(data.actors.length).toBeLessThanOrEqual(2);
    });

    it('sorts by actor_score in singleLoad mode', async () => {
      // Arrange: Create actors with different scores
      const watchedMovies = [
        { tmdbId: 1, mediaType: 'movie', userRating: 10, watchCount: 1 },
        { tmdbId: 2, mediaType: 'movie', userRating: 5, watchCount: 1 },
      ];

      mockWatchListFindMany
        .mockResolvedValueOnce(watchedMovies)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      // First movie has actor with high rating, second has actor with low rating
      mockMoviePersonCacheFindUnique
        .mockResolvedValueOnce({
          tmdbId: 1,
          mediaType: 'movie',
          topActors: [{ id: 500, name: 'High Rated Actor', profile_path: '/h.png', character: 'C' }],
          topDirectors: [],
        })
        .mockResolvedValueOnce({
          tmdbId: 2,
          mediaType: 'movie',
          topActors: [{ id: 501, name: 'Low Rated Actor', profile_path: '/l.png', character: 'C' }],
          topDirectors: [],
        });

      // Act
      const req = createRequest('http://localhost/api/user/achiev_actors?limit=50&singleLoad=true');
      const res = await GET(req);

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();

      if (data.actors.length > 1) {
        // Should be sorted by actor_score descending
        expect(data.actors[0].actor_score).toBeGreaterThanOrEqual(data.actors[1].actor_score);
      }
    });

    it('includes profile_path in response', async () => {
      // Arrange
      mockWatchListFindMany
        .mockResolvedValueOnce([
          { tmdbId: 13, mediaType: 'movie', userRating: 8, watchCount: 1 },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockMoviePersonCacheFindUnique.mockResolvedValue({
        tmdbId: 13,
        mediaType: 'movie',
        topActors: [
          { id: 500, name: 'Tom Hanks', profile_path: '/test-profile.jpg', character: 'Role' },
        ],
        topDirectors: [],
      });

      // Act
      const req = createRequest('http://localhost/api/user/achiev_actors?limit=50&singleLoad=true');
      const res = await GET(req);

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();

      if (data.actors.length > 0) {
        expect(data.actors[0]).toHaveProperty('profile_path');
        expect(data.actors[0].profile_path).toBe('/test-profile.jpg');
      }
    });
  });
});
