import { test, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/admin/cleanup/similarity/route';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { rateLimit } from '@/middleware/rateLimit';
import { cleanupOrphanedScores } from '@/lib/taste-map/similarity-storage';

// Mock dependencies
vi.mock('@/auth', () => ({
  authOptions: { /* mock */ },
}));
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));
vi.mock('@/middleware/rateLimit', () => ({
  rateLimit: vi.fn(),
}));
vi.mock('@/lib/taste-map/similarity-storage', () => ({
  cleanupOrphanedScores: vi.fn(),
}));

describe('POST /api/admin/cleanup/similarity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ADMIN_USER_ID = 'cmkbc7sn2000104k3xd3zyf2a';

  test('allows admin to trigger cleanup', async () => {
    const mockSession = { user: { id: ADMIN_USER_ID } };
    vi.mocked(getServerSession).mockResolvedValue(mockSession as any);
    vi.mocked(rateLimit).mockResolvedValue({ success: true, limit: 100, remaining: 100, reset: Date.now() });
    vi.mocked(cleanupOrphanedScores).mockResolvedValue({
      deleted: 5,
      orphans: ['deleted-user-1', 'deleted-user-2'],
    });

    const request = new Request('http://localhost:3000/api/admin/cleanup/similarity');
    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('deleted', 5);
    expect(data).toHaveProperty('orphans');
    expect(vi.mocked(cleanupOrphanedScores)).toHaveBeenCalledTimes(1);
  });

  test('rejects non-admin', async () => {
    const mockSession = { user: { id: 'non-admin-user' } };
    vi.mocked(getServerSession).mockResolvedValue(mockSession as any);
    vi.mocked(rateLimit).mockResolvedValue({ success: true, limit: 100, remaining: 100, reset: Date.now() });

    const request = new Request('http://localhost:3000/api/admin/cleanup/similarity');
    const response = await POST(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toHaveProperty('error', 'Unauthorized');
    expect(vi.mocked(cleanupOrphanedScores)).not.toHaveBeenCalled();
  });

  test('handles cleanup error', async () => {
    const mockSession = { user: { id: ADMIN_USER_ID } };
    vi.mocked(getServerSession).mockResolvedValue(mockSession as any);
    vi.mocked(rateLimit).mockResolvedValue({ success: true, limit: 100, remaining: 100, reset: Date.now() });
    vi.mocked(cleanupOrphanedScores).mockRejectedValue(new Error('Database error'));

    const request = new Request('http://localhost:3000/api/admin/cleanup/similarity');
    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toHaveProperty('error');
  });
});
