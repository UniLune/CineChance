import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import AdminTasteMap from '../AdminTasteMap';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AdminTasteMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('shows stats on load', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        stats: {
          totalScores: 1234,
          uniqueUsers: 56,
          averageMatch: 7,
          lastComputed: '2024-01-15T10:30:00Z',
          schedulerLastRun: null,
        },
      }),
    });

    render(<AdminTasteMap />);

    await waitFor(() => {
      expect(screen.getByText('1234')).toBeInTheDocument();
      expect(screen.getByText('56')).toBeInTheDocument();
      expect(screen.getByText('7%')).toBeInTheDocument();
    });
  });

  it('cleanup orphan button triggers cleanup and refreshes stats', async () => {
    const initialStats = { totalScores: 100, uniqueUsers: 5, averageMatch: 2, lastComputed: null, schedulerLastRun: null };
    const cleanedStats = { totalScores: 100, uniqueUsers: 5, averageMatch: 0, lastComputed: '2024-01-15T10:30:00Z', schedulerLastRun: null };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ stats: initialStats }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, deleted: 2 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ stats: cleanedStats }) });

    render(<AdminTasteMap />);

    await waitFor(() => {
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    const cleanupBtn = screen.getByRole('button', { name: 'Очистить сиротские записи' });
    fireEvent.click(cleanupBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenNthCalledWith(2,
        expect.stringContaining('/api/admin/cleanup/similarity'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });

  it('compute all button triggers compute and refreshes stats', async () => {
    const initialStats = { totalScores: 100, uniqueUsers: 5, averageMatch: 1, lastComputed: null, schedulerLastRun: null };
    const computedStats = { totalScores: 100, uniqueUsers: 5, averageMatch: 1, lastComputed: '2024-01-15T10:30:00Z', schedulerLastRun: null };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ stats: initialStats }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, computed: 100 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ stats: computedStats }) });

    render(<AdminTasteMap />);

    await waitFor(() => {
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    const computeBtn = screen.getByRole('button', { name: 'Пересчитать все' });
    fireEvent.click(computeBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenNthCalledWith(2,
        expect.stringContaining('/api/admin/compute-similarities'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/\b2024\b/)).toBeInTheDocument();
    });
  });

  it('handles errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<AdminTasteMap />);

    await waitFor(() => {
      expect(screen.getByText(/Ошибка/i)).toBeInTheDocument();
    });
  });

  it('handles unauthorized response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    render(<AdminTasteMap />);

    await waitFor(() => {
      expect(screen.getByText(/Нет доступа/i)).toBeInTheDocument();
    });
  });

  it('cleanup old button triggers cleanup with correct query', async () => {
    const initialStats = { totalScores: 50, uniqueUsers: 3, averageMatch: 5, lastComputed: null, schedulerLastRun: null };
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ stats: initialStats }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, deleted: 5 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ stats: initialStats }) });

    render(<AdminTasteMap />);

    await waitFor(() => {
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    const oldCleanupBtn = screen.getByRole('button', { name: 'Очистить старые записи (>365 дней)' });
    fireEvent.click(oldCleanupBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenNthCalledWith(2,
        expect.stringContaining('/api/admin/cleanup/similarity?type=old&days=365'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Удалено 5 старых записей/i)).toBeInTheDocument();
    });
  });
});
