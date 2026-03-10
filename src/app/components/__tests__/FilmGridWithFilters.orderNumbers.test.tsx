import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import FilmGridWithFilters from '../FilmGridWithFilters';
import { Media } from '@/lib/tmdb';

// Mock IntersectionObserver for infinite scroll
beforeAll(() => {
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root: Element | null = null;
    readonly rootMargin: string = '';
    readonly thresholds: ReadonlyArray<number> = [];
    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit
    ) {}
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords(): IntersectionObserverEntry[] { return []; }
  }

  global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
});

// For integration tests, we'll use the real MovieCard but mock its child components
vi.mock('../MoviePosterProxy', () => ({
  default: ({ movie }: { movie: Media }) => (
    <div data-testid="movie-poster-proxy">{movie.title}</div>
  ),
}));

vi.mock('../StatusOverlay', () => ({
  default: ({ status }: { status: string }) => (
    <div data-testid="status-overlay">{status}</div>
  ),
}));

vi.mock('../RatingModal', () => ({
  default: ({ isOpen, onClose, title }: any) => 
    isOpen ? <div data-testid="rating-modal">{title}</div> : null,
}));

vi.mock('../RatingInfoModal', () => ({
  default: ({ isOpen, onClose, title }: any) => 
    isOpen ? <div data-testid="rating-info-modal">{title}</div> : null,
}));

vi.mock('../BlacklistContext', () => ({
  useBlacklist: () => ({
    checkBlacklist: vi.fn(() => false),
    isLoading: false,
  }),
}));

describe('FilmGridWithFilters - Order Numbers Integration', () => {
  const mockMovies: Media[] = [
    {
      id: 1,
      title: 'Movie 1',
      vote_average: 7.5,
      vote_count: 1000,
      media_type: 'movie',
      overview: 'Overview 1',
      poster_path: '/1.jpg',
    },
    {
      id: 2,
      title: 'Movie 2',
      vote_average: 8.0,
      vote_count: 2000,
      media_type: 'tv',
      overview: 'Overview 2',
      poster_path: '/2.jpg',
    },
    {
      id: 3,
      title: 'Movie 3',
      vote_average: 6.5,
      vote_count: 500,
      media_type: 'movie',
      overview: 'Overview 3',
      poster_path: '/3.jpg',
    },
  ];

  const mockFetchMovies = vi.fn().mockResolvedValue({
    movies: mockMovies,
    hasMore: false,
  });

  it('passes index prop to MovieCard components', async () => {
    // This test will FAIL in RED phase because FilmGridWithFilters does not pass index to MovieCard
    // In GREEN phase, it should pass index to each MovieCard
    render(
      <FilmGridWithFilters
        fetchMovies={mockFetchMovies}
        initialLoading={false}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Movie [1-3]/).length).toBeGreaterThan(0);
    });

    // Verify all 3 movies are rendered
    const movieCards = document.querySelectorAll('[data-testid="movie-poster-proxy"]');
    expect(movieCards.length).toBe(3);

    // In GREEN phase, order numbers 1, 2, 3 should appear
    const orderNumbers = screen.getAllByText(/^[1-3]$/);
    expect(orderNumbers.length).toBe(3);
  });

  it('displays correct sequential order numbers for multiple movies', async () => {
    // This test expects order numbers 1, 2, 3 to appear
    render(
      <FilmGridWithFilters
        fetchMovies={mockFetchMovies}
        initialLoading={false}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Movie [1-3]/).length).toBeGreaterThan(0);
    });

    // Check for order numbers 1, 2, 3
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('single movie displays order number 1', async () => {
    const singleMovieFetch = vi.fn().mockResolvedValue({
      movies: [mockMovies[0]],
      hasMore: false,
    });

    render(
      <FilmGridWithFilters
        fetchMovies={singleMovieFetch}
        initialLoading={false}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Movie 1/).length).toBeGreaterThan(0);
    });

    // Single movie should show order number 1
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders movies with index prop and displays order numbers', async () => {
    // After GREEN phase, FilmGridWithFilters passes index prop to MovieCard and order numbers appear
    render(
      <FilmGridWithFilters
        fetchMovies={mockFetchMovies}
        initialLoading={false}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Movie [1-3]/).length).toBeGreaterThan(0);
    });

    // All 3 movies should have order numbers 1, 2, 3
    const orderNumbers = screen.getAllByText(/^[1-3]$/);
    expect(orderNumbers.length).toBe(3);

    // Additionally, golden styling should be present
    const goldenElements = document.querySelectorAll('.bg-amber-900\\/40, .text-amber-100\\/90');
    expect(goldenElements.length).toBeGreaterThanOrEqual(3);
  });

  it('MovieCards receive index prop and display order numbers', async () => {
    // After implementation, MovieCards should have index prop and show order numbers
    render(
      <FilmGridWithFilters
        fetchMovies={mockFetchMovies}
        initialLoading={false}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Movie [1-3]/).length).toBeGreaterThan(0);
    });

    // Verify movies are rendered
    const movieCards = document.querySelectorAll('[data-testid="movie-poster-proxy"]');
    expect(movieCards.length).toBe(3);

    // Order numbers should be present (1, 2, 3)
    const orderNumbers = screen.getAllByText(/^[1-3]$/);
    expect(orderNumbers.length).toBe(3);
  });

  it('empty state works correctly', async () => {
    const emptyFetch = vi.fn().mockResolvedValue({
      movies: [],
      hasMore: false,
    });

    render(
      <FilmGridWithFilters
        fetchMovies={emptyFetch}
        initialLoading={false}
        emptyMessage="No movies found"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No movies found')).toBeInTheDocument();
    });

    // No movie cards should be present
    const movieCards = document.querySelectorAll('[data-testid="movie-poster-proxy"]');
    expect(movieCards.length).toBe(0);
  });

  it('single movie displays order number 1', async () => {
    const singleMovieFetch = vi.fn().mockResolvedValue({
      movies: [mockMovies[0]],
      hasMore: false,
    });

    render(
      <FilmGridWithFilters
        fetchMovies={singleMovieFetch}
        initialLoading={false}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Movie 1/).length).toBeGreaterThan(0);
    });

    // Single movie should show order number 1
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
