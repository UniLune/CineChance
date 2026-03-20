import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TwinTasters from '../../../../src/app/profile/taste-map/TwinTasters';
import { useRouter } from 'next/navigation';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  })),
}));

describe('TwinTasters (Acceptance Code 27-02-03)', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  it('renders cleanup button for admin users', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        similarUsers: [
          {
            userId: 'u1',
            overallMatch: 0.5,
            watchCount: 5,
            memberSince: new Date().toISOString(),
          },
        ],
      }),
    });

    render(<TwinTasters userId="test-user" isAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Очистить кеш близнецов/i })).toBeTruthy();
    });
  });

  it('does not render cleanup button for non-admin users', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        similarUsers: [
          {
            userId: 'u1',
            overallMatch: 0.5,
            watchCount: 5,
            memberSince: new Date().toISOString(),
          },
        ],
      }),
    });

    render(<TwinTasters userId="test-user" isAdmin={false} />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Очистить кеш близнецов/i })).toBeNull();
    });
  });
});
