import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TwinTasters from '../../profile/taste-map/TwinTasters';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock router
const mockPush = vi.fn();
const mockRouter = {
  push: mockPush,
};

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

const mockTwinsData = {
  similarUsers: [
    {
      userId: 'user123',
      overallMatch: 85.5,
      watchCount: 150,
      memberSince: '2024-01-15T10:30:00Z',
    },
    {
      userId: 'user456',
      overallMatch: 72.3,
      watchCount: 89,
      memberSince: '2024-02-20T14:45:00Z',
    },
  ],
};

describe('TwinTasters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockTwinsData,
    });
  });

  describe('Admin cleanup button', () => {
    it('shows cleanup button for admin', async () => {
      render(<TwinTasters userId="testuser" isAdmin={true} />);

      await waitFor(() => {
        expect(screen.getByText('Очистить кеш близнецов')).toBeInTheDocument();
      });
    });

    it('hides button for non-admin', async () => {
      render(<TwinTasters userId="testuser" isAdmin={false} />);

      await waitFor(() => {
        expect(screen.queryByText('Очистить кеш близнецов')).not.toBeInTheDocument();
      });
    });

    it('clicking button triggers cleanup API call', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      render(<TwinTasters userId="testuser" isAdmin={true} />);

      await waitFor(() => {
        expect(screen.getByText('Очистить кеш близнецов')).toBeInTheDocument();
      });

      const cleanupButton = screen.getByText('Очистить кеш близнецов');
      await user.click(cleanupButton);

      expect(mockFetch).toHaveBeenCalledWith('/api/admin/cleanup/similarity?type=orphaned', {
        method: 'POST',
        cache: 'no-store',
      });
    });

    it('clicking button shows success toast', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      // Mock window.alert
      const mockAlert = vi.spyOn(window, 'alert').mockImplementation(() => {});

      render(<TwinTasters userId="testuser" isAdmin={true} />);

      await waitFor(() => {
        expect(screen.getByText('Очистить кеш близнецов')).toBeInTheDocument();
      });

      const cleanupButton = screen.getByText('Очистить кеш близнецов');
      await user.click(cleanupButton);

      await waitFor(() => {
        expect(mockAlert).toHaveBeenCalledWith('Кеш успешно очищен');
      });

      mockAlert.mockRestore();
    });

    it('shows error toast on API failure', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Unauthorized' }),
      });

      const mockAlert = vi.spyOn(window, 'alert').mockImplementation(() => {});

      render(<TwinTasters userId="testuser" isAdmin={true} />);

      await waitFor(() => {
        expect(screen.getByText('Очистить кеш близнецов')).toBeInTheDocument();
      });

      const cleanupButton = screen.getByText('Очистить кеш близнецов');
      await user.click(cleanupButton);

      await waitFor(() => {
        expect(mockAlert).toHaveBeenCalledWith('Ошибка при очистке кеша');
      });

      mockAlert.mockRestore();
    });

    it('button is disabled during loading state', async () => {
      const user = userEvent.setup();
      let resolvePromise: (value: unknown) => void;
      const loadingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockImplementationOnce(() => loadingPromise);

      const { rerender } = render(<TwinTasters userId="testuser" isAdmin={true} />);

      await waitFor(() => {
        const button = screen.queryByText('Очистить кеш близнецов');
        if (button) {
          expect(button).toBeDisabled();
        }
      });

      // Resolve the loading
      resolvePromise?.({
        ok: true,
        json: async () => mockTwinsData,
      });

      // Wait for rerender with data
      await waitFor(() => {
        const button = screen.getByText('Очистить кеш близнецов');
        expect(button).not.toBeDisabled();
      });
    });
  });

  describe('Component rendering', () => {
    it('renders twins list when data loads', async () => {
      render(<TwinTasters userId="testuser" isAdmin={false} />);

      await waitFor(() => {
        expect(screen.getByText('Ваши близнецы вкуса')).toBeInTheDocument();
      });

       expect(screen.getByText('Киномана user123')).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('shows error state on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      render(<TwinTasters userId="testuser" isAdmin={false} />);

      await waitFor(() => {
        expect(screen.getByText('Ошибка при загрузке похожих пользователей')).toBeInTheDocument();
      });
    });

    it('shows error message when no twins found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ similarUsers: [] }),
      });

      render(<TwinTasters userId="testuser" isAdmin={false} />);

      await waitFor(() => {
        expect(screen.getByText('Похожих пользователей не найдено')).toBeInTheDocument();
      });
    });
  });
});
