import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/user/achiev_creators/route';
// Re-export from vitest.setup
import { testUtils } from '../../../../../vitest.setup';

const { mockMovieCreditsMap, mockMediaDetailsMap, setMockPersonCredits, clearMockData, mockFetch } = testUtils;

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

vi.mock('@/lib/prisma', () => ({
  prisma: {
    watchList: {
      findMany: (...args: unknown[]) => mockWatchListFindMany(...args),
    },
    personProfile: {
      upsert: vi.fn(),
    },
  },
}));

// Mock redis - withCache should just call the fetcher directly
vi.mock('@/lib/redis', () => ({
  withCache: vi.fn(async (_key: string, fetcher: () => Promise<any>) => {
    return fetcher();
  }),
}));

// Import prisma after mocking
import { prisma } from '@/lib/prisma';

describe('AchievCreators API - Anime/Cartoon filtering consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockData();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createRequest = (url: string): NextRequest => {
    return new Request(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } }) as unknown as NextRequest;
  };

  /**
   * Setup mock data for TMDB responses
   */
  function setupMocksForDirector({
    directorId,
    directorName,
    allMovies,
    watchedMovies,
  }: {
    directorId: number;
    directorName: string;
    allMovies: Array<{ id: number; title: string; isAnime: boolean; isCartoon: boolean }>;
    watchedMovies: Array<{ id: number; title: string; isAnime: boolean; isCartoon: boolean }>;
  }) {
    // 1. Mock watchlist
    mockWatchListFindMany
      .mockResolvedValueOnce(
        watchedMovies.map((m) => ({
          tmdbId: m.id,
          mediaType: 'movie',
          userRating: 8,
        }))
      )
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    // 2. Setup mock data for TMDB calls
    mockMovieCreditsMap.clear();
    mockMediaDetailsMap.clear();

    allMovies.forEach((movie) => {
      // Credits: this movie has the director
      mockMovieCreditsMap.set(movie.id, {
        id: movie.id,
        crew: [
          {
            id: directorId,
            name: directorName,
            profile_path: null,
            job: 'Director',
            department: 'Directing',
          },
        ],
      });

      // Media details for filtering
      mockMediaDetailsMap.set(movie.id, {
        id: movie.id,
        title: movie.title,
        genres: movie.isAnime || movie.isCartoon ? [{ id: 16, name: 'Animation' }] : [{ id: 28, name: 'Action' }],
        original_language: movie.isAnime ? 'ja' : 'en',
      });
    });

    // Person combined_credits - full filmography
    setMockPersonCredits({
      crew: allMovies.map((movie) => ({
        id: movie.id,
        title: movie.title,
        job: 'Director',
        department: 'Directing',
        media_type: 'movie',
        release_date: '2020-01-01',
      })),
    });
  }

  it('should filter both total_movies and watched_movies from anime/cartoons (singleLoad=true)', async () => {
    // ARRANGE: Director with ONLY anime in filmography
    const directorId = 123;
    const directorName = 'Anime Director';

    const filmography = [
      { id: 101, title: 'Anime Movie 1', isAnime: true, isCartoon: false },
      { id: 102, title: 'Anime Movie 2', isAnime: true, isCartoon: false },
      { id: 103, title: 'Anime Movie 3', isAnime: true, isCartoon: false },
    ];

    // User watched ALL three anime movies
    const watchedMovies = [
      { id: 101, title: 'Anime Movie 1', isAnime: true, isCartoon: false },
      { id: 102, title: 'Anime Movie 2', isAnime: true, isCartoon: false },
      { id: 103, title: 'Anime Movie 3', isAnime: true, isCartoon: false },
    ];

    setupMocksForDirector({
      directorId,
      directorName,
      allMovies: filmography,
      watchedMovies,
    });

    // ACT
    const req = createRequest('http://localhost/api/user/achiev_creators?limit=50&singleLoad=true');
    const res = await GET(req);

    // ASSERT
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.creators).toHaveLength(1);
    const director = data.creators[0];

    expect(director.id).toBe(directorId);
    expect(director.name).toBe(directorName);

    // After filtering out anime, total_movies should be 0 (since all are anime)
    expect(director.total_movies).toBe(0);

    // CRITICAL: watched_movies should also be 0, because the watched set should be intersected with the filtered filmography
    // Currently (bug): director.watched_movies = 3 (from baseCreatorsData, before filtering)
    // After fix: should be 0
    expect(director.watched_movies).toBe(0);

    // Progress should be 0%
    expect(director.progress_percent).toBe(0);
  });

  it('should correctly count when filmography has mixed anime and live-action', async () => {
    // ARRANGE: Director with 2 live-action + 1 anime in filmography
    const directorId = 456;
    const directorName = 'Mixed Director';

    const filmography = [
      { id: 201, title: 'Live Action 1', isAnime: false, isCartoon: false },
      { id: 202, title: 'Anime Movie', isAnime: true, isCartoon: false },
      { id: 203, title: 'Live Action 2', isAnime: false, isCartoon: false },
    ];

    // User watched: 1 live-action + 1 anime
    const watchedMovies = [
      { id: 201, title: 'Live Action 1', isAnime: false, isCartoon: false },
      { id: 202, title: 'Anime Movie', isAnime: true, isCartoon: false },
    ];

    setupMocksForDirector({
      directorId,
      directorName,
      allMovies: filmography,
      watchedMovies,
    });

    // ACT
    const req = createRequest('http://localhost/api/user/achiev_creators?limit=50&singleLoad=true');
    const res = await GET(req);
    const data = await res.json();

    // ASSERT
    expect(data.creators).toHaveLength(1);
    const director = data.creators[0];

    expect(director.id).toBe(directorId);

    // After filtering: only 2 live-action movies remain in filmography
    expect(director.total_movies).toBe(2);

    // Watched movies among those 2 should be 1 (only the live-action one)
    expect(director.watched_movies).toBe(1);

    // Progress: 50%
    expect(director.progress_percent).toBe(50);
  });

  it('should filter cartoons as well', async () => {
    // ARRANGE: Director with only cartoons (Animation genre but not Japanese)
    const directorId = 789;
    const directorName = 'Cartoon Director';

    const filmography = [
      { id: 301, title: 'Cartoon 1', isAnime: false, isCartoon: true },
    ];

    const watchedMovies = [
      { id: 301, title: 'Cartoon 1', isAnime: false, isCartoon: true },
    ];

    setupMocksForDirector({
      directorId,
      directorName,
      allMovies: filmography,
      watchedMovies,
    });

    // ACT
    const req = createRequest('http://localhost/api/user/achiev_creators?limit=50&singleLoad=true');
    const res = await GET(req);
    const data = await res.json();

    // ASSERT
    expect(data.creators).toHaveLength(1);
    const director = data.creators[0];

    expect(director.total_movies).toBe(0);
    expect(director.watched_movies).toBe(0);
    expect(director.progress_percent).toBe(0);
  });

  it('should filter average_rating to only include non-anime/cartoon movies', async () => {
    // ARRANGE: Director with mixed filmography
    // - 1 live-action movie rated 8
    // - 1 anime movie rated 10
    const directorId = 999;
    const directorName = 'Mixed Rating Director';

    const filmography = [
      { id: 401, title: 'Live Action Movie', isAnime: false, isCartoon: false },
      { id: 402, title: 'Anime Movie', isAnime: true, isCartoon: false },
    ];

    // User watched both movies with different ratings
    // Need to modify the setup to include different ratings
    const watchedMovies = [
      { id: 401, title: 'Live Action Movie', isAnime: false, isCartoon: false },
      { id: 402, title: 'Anime Movie', isAnime: true, isCartoon: false },
    ];

    // Setup mocks - but we need custom ratings
    mockWatchListFindMany
      .mockResolvedValueOnce([
        { tmdbId: 401, mediaType: 'movie', userRating: 8 }, // Live-action rated 8
        { tmdbId: 402, mediaType: 'movie', userRating: 10 }, // Anime rated 10
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockMovieCreditsMap.clear();
    mockMediaDetailsMap.clear();

    filmography.forEach((movie) => {
      mockMovieCreditsMap.set(movie.id, {
        id: movie.id,
        crew: [
          {
            id: directorId,
            name: directorName,
            profile_path: null,
            job: 'Director',
            department: 'Directing',
          },
        ],
      });

      mockMediaDetailsMap.set(movie.id, {
        id: movie.id,
        title: movie.title,
        genres: movie.isAnime || movie.isCartoon ? [{ id: 16, name: 'Animation' }] : [{ id: 28, name: 'Action' }],
        original_language: movie.isAnime ? 'ja' : 'en',
      });
    });

    setMockPersonCredits({
      crew: filmography.map((movie) => ({
        id: movie.id,
        title: movie.title,
        job: 'Director',
        department: 'Directing',
        media_type: 'movie',
        release_date: '2020-01-01',
      })),
    });

    mockFetch.mockClear();

    // ACT
    const req = createRequest('http://localhost/api/user/achiev_creators?limit=50&singleLoad=true');
    const res = await GET(req);
    const data = await res.json();

    // ASSERT
    expect(data.creators).toHaveLength(1);
    const director = data.creators[0];

    // total_movies should be 1 (only live-action after filter)
    expect(director.total_movies).toBe(1);
    
    // watched_movies should be 1 (only live-action)
    expect(director.watched_movies).toBe(1);
    
    // average_rating should be 8 (only from live-action, NOT 9 from (8+10)/2)
    expect(director.average_rating).toBe(8);
    
    // progress should be 100%
    expect(director.progress_percent).toBe(100);
  });
});
