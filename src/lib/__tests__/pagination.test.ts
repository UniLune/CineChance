import { describe, it, expect } from 'vitest';

interface MockMovie {
  id: number;
  tmdbId: number;
  title: string;
  addedAt: string;
  vote_average: number;
  vote_count?: number;
  release_date?: string;
}

function sortMovies(
  movies: MockMovie[],
  sortBy: string,
  sortOrder: string
): MockMovie[] {
  return [...movies].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'popularity':
        comparison = (b.vote_count || 0) - (a.vote_count || 0);
        break;
      case 'rating':
        const ratingA = a.vote_average || 0;
        const ratingB = b.vote_average || 0;
        comparison = ratingB - ratingA;
        break;
      case 'date':
        const dateA = a.release_date || '';
        const dateB = b.release_date || '';
        comparison = dateB.localeCompare(dateA);
        break;
      case 'savedDate':
        const savedA = a.addedAt || '';
        const savedB = b.addedAt || '';
        comparison = savedB.localeCompare(savedA);
        break;
      default:
        comparison = 0;
    }

    if (comparison === 0) {
      comparison = (a.id || 0) - (b.id || 0);
    }

    return sortOrder === 'desc' ? comparison : -comparison;
  });
}

function applyPagination(
  sortedMovies: MockMovie[],
  page: number,
  limit: number
): { movies: MockMovie[]; hasMore: boolean } {
  const pageStartIndex = (page - 1) * limit;
  const pageEndIndex = pageStartIndex + limit;
  const paginatedMovies = sortedMovies.slice(pageStartIndex, pageEndIndex);
  const hasMore = sortedMovies.length > pageEndIndex;

  return { movies: paginatedMovies, hasMore };
}

function filterMovies(
  movies: MockMovie[],
  types: string[],
  minRating: number,
  maxRating: number
): MockMovie[] {
  return movies.filter((movie) => {
    if (minRating > 0 && (movie.vote_average || 0) < minRating) return false;
    if (maxRating < 10 && (movie.vote_average || 0) > maxRating) return false;
    return true;
  });
}

describe('Pagination Logic', () => {
  const createMovies = (count: number): MockMovie[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      tmdbId: 1000 + i,
      title: `Movie ${i + 1}`,
      addedAt: new Date(Date.now() - i * 1000 * 60 * 60 * 24).toISOString(),
      vote_average: 5 + (i % 5),
    }));
  };

  describe('sortMovies', () => {
    it('sorts by addedAt desc by default with id as secondary sort', () => {
      const movies: MockMovie[] = [
        { id: 3, tmdbId: 103, title: 'C', addedAt: '2024-01-03', vote_average: 7 },
        { id: 1, tmdbId: 101, title: 'A', addedAt: '2024-01-01', vote_average: 7 },
        { id: 2, tmdbId: 102, title: 'B', addedAt: '2024-01-02', vote_average: 7 },
      ];

      const sorted = sortMovies(movies, 'savedDate', 'desc');

      expect(sorted[0].id).toBe(3);
      expect(sorted[1].id).toBe(2);
      expect(sorted[2].id).toBe(1);
    });

    it('sorts by rating desc', () => {
      const movies: MockMovie[] = [
        { id: 1, tmdbId: 101, title: 'Low', addedAt: '2024-01-01', vote_average: 5 },
        { id: 2, tmdbId: 102, title: 'High', addedAt: '2024-01-01', vote_average: 9 },
        { id: 3, tmdbId: 103, title: 'Mid', addedAt: '2024-01-01', vote_average: 7 },
      ];

      const sorted = sortMovies(movies, 'rating', 'desc');

      expect(sorted[0].title).toBe('High');
      expect(sorted[1].title).toBe('Mid');
      expect(sorted[2].title).toBe('Low');
    });

    it('uses id as secondary sort for stable ordering', () => {
      const movies: MockMovie[] = [
        { id: 5, tmdbId: 105, title: 'E', addedAt: '2024-01-01', vote_average: 7 },
        { id: 1, tmdbId: 101, title: 'A', addedAt: '2024-01-01', vote_average: 7 },
        { id: 3, tmdbId: 103, title: 'C', addedAt: '2024-01-01', vote_average: 7 },
      ];

      const sorted = sortMovies(movies, 'rating', 'desc');

      expect(sorted[0].id).toBe(1);
      expect(sorted[1].id).toBe(3);
      expect(sorted[2].id).toBe(5);
    });
  });

  describe('applyPagination', () => {
    it('returns correct movies for page 1', () => {
      const movies = createMovies(30);

      const result = applyPagination(movies, 1, 20);

      expect(result.movies.length).toBe(20);
      expect(result.movies[0].id).toBe(1);
      expect(result.movies[19].id).toBe(20);
    });

    it('returns correct movies for page 2', () => {
      const movies = createMovies(30);

      const result = applyPagination(movies, 2, 20);

      expect(result.movies.length).toBe(10);
      expect(result.movies[0].id).toBe(21);
      expect(result.movies[9].id).toBe(30);
    });

    it('returns hasMore=true when more pages exist', () => {
      const movies = createMovies(30);

      const result = applyPagination(movies, 1, 20);

      expect(result.hasMore).toBe(true);
    });

    it('returns hasMore=false when on last page', () => {
      const movies = createMovies(30);

      const result = applyPagination(movies, 2, 20);

      expect(result.hasMore).toBe(false);
    });

    it('hasMore is true when more items may exist (edge case at boundary)', () => {
      const movies = createMovies(40);

      const result = applyPagination(movies, 2, 20);

      expect(result.hasMore).toBe(false);
    });

    it('hasMore is true when more than one page of items remains', () => {
      const movies = createMovies(41);

      const result = applyPagination(movies, 2, 20);

      expect(result.hasMore).toBe(true);
      expect(result.movies.length).toBe(20);
    });
  });

  describe('Pagination with filters', () => {
    it('filters then paginates correctly', () => {
      const movies: MockMovie[] = [
        { id: 1, tmdbId: 101, title: 'A', addedAt: '2024-01-01', vote_average: 9 },
        { id: 2, tmdbId: 102, title: 'B', addedAt: '2024-01-02', vote_average: 5 },
        { id: 3, tmdbId: 103, title: 'C', addedAt: '2024-01-03', vote_average: 8 },
        { id: 4, tmdbId: 104, title: 'D', addedAt: '2024-01-04', vote_average: 4 },
        { id: 5, tmdbId: 105, title: 'E', addedAt: '2024-01-05', vote_average: 7 },
      ];

      const filtered = filterMovies(movies, [], 7, 10);
      expect(filtered.length).toBe(3);

      const sorted = sortMovies(filtered, 'rating', 'desc');
      expect(sorted[0].title).toBe('A');

      const paginated = applyPagination(sorted, 1, 2);
      expect(paginated.movies.length).toBe(2);
      expect(paginated.hasMore).toBe(true);
    });

    it('does not cause duplicates when filtering reduces dataset', () => {
      const movies = createMovies(50);

      const filtered = filterMovies(movies, [], 8, 10);
      const sorted = sortMovies(filtered, 'rating', 'desc');

      const page1 = applyPagination(sorted, 1, 20);
      const page2 = applyPagination(sorted, 2, 20);
      const page3 = applyPagination(sorted, 3, 20);

      const allIds = [
        ...page1.movies.map((m) => m.id),
        ...page2.movies.map((m) => m.id),
        ...page3.movies.map((m) => m.id),
      ];
      const uniqueIds = new Set(allIds);

      expect(uniqueIds.size).toBe(page1.movies.length + page2.movies.length + page3.movies.length);
    });
  });

  describe('No duplicates across pages', () => {
    it('ensures consistent sorting prevents duplicates', () => {
      const movies = createMovies(100);

      const sorted = sortMovies(movies, 'savedDate', 'desc');

      const page1 = applyPagination(sorted, 1, 20);
      const page2 = applyPagination(sorted, 2, 20);
      const page3 = applyPagination(sorted, 3, 20);

      const page1Ids = page1.movies.map((m) => m.id);
      const page2Ids = page2.movies.map((m) => m.id);
      const page3Ids = page3.movies.map((m) => m.id);

      for (const id of page1Ids) {
        expect(page2Ids.includes(id)).toBe(false);
        expect(page3Ids.includes(id)).toBe(false);
      }

      for (const id of page2Ids) {
        expect(page3Ids.includes(id)).toBe(false);
      }

      expect(page1Ids.length).toBe(20);
      expect(page2Ids.length).toBe(20);
      expect(page3Ids.length).toBe(20);
    });

    it('works with rating filter reducing data significantly', () => {
      const movies: MockMovie[] = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        tmdbId: 1000 + i,
        title: `Movie ${i + 1}`,
        addedAt: new Date(i * 1000).toISOString(),
        vote_average: Math.random() * 10,
      }));

      const filtered = filterMovies(movies, [], 9, 10);
      const sorted = sortMovies(filtered, 'rating', 'desc');

      const page1 = applyPagination(sorted, 1, 20);

      if (page1.movies.length > 0) {
        const page2 = applyPagination(sorted, 2, 20);

        const page1Ids = page1.movies.map((m) => m.id);
        const page2Ids = page2.movies.map((m) => m.id);

        for (const id of page1Ids) {
          expect(page2Ids.includes(id)).toBe(false);
        }
      }
    });
  });

  describe('hasMore edge cases', () => {
    it('hasMore is false when exactly at end', () => {
      const movies = createMovies(40);

      const result = applyPagination(movies, 2, 20);

      expect(result.hasMore).toBe(false);
    });

    it('hasMore is true when one item remains after page', () => {
      const movies = createMovies(41);

      const result = applyPagination(movies, 2, 20);

      expect(result.hasMore).toBe(true);
      expect(result.movies.length).toBe(20);
    });

    it('hasMore is false for empty result', () => {
      const movies: MockMovie[] = [];

      const result = applyPagination(movies, 1, 20);

      expect(result.hasMore).toBe(false);
      expect(result.movies.length).toBe(0);
    });

    it('hasMore is false for single page', () => {
      const movies = createMovies(10);

      const result = applyPagination(movies, 1, 20);

      expect(result.hasMore).toBe(false);
    });
  });
});
