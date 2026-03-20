import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/middleware/rateLimit';
import { cleanupOrphanedScores, deleteOldSimilarityScores } from '@/lib/taste-map/similarity-storage';

/**
 * Admin user ID for authentication.
 * Falls back to a default if environment variable is not set.
 */
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || 'cmkbc7sn2000104k3xd3zyf2a';

/**
 * API route handler for cleaning up similarity scores.
 * Supports two cleanup types: 'orphaned' (default) and 'old'.
 *
 * @param request - The NextRequest object containing the HTTP request
 * @returns JSON response with cleanup results or error details
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Rate limiting
  const { success } = await rateLimit(request, '/api/admin/cleanup/similarity');
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    // Auth - admin only
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.id !== ADMIN_USER_ID) {
      logger.warn('Unauthorized admin cleanup attempt', {
        userId: session?.user?.id,
        context: 'AdminCleanupSimilarity',
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const type = searchParams.get('type') || 'orphaned';
    if (type !== 'orphaned' && type !== 'old') {
      return NextResponse.json({ error: 'Invalid cleanup type' }, { status: 400 });
    }

    if (type === 'orphaned') {
      logger.info('Admin triggered orphan cleanup', {
        adminId: session.user.id,
        context: 'AdminCleanupSimilarity',
      });

      const result = await cleanupOrphanedScores();

      logger.info('Orphan cleanup completed', {
        deleted: result.deleted,
        orphansCount: result.orphans.length,
        context: 'AdminCleanupSimilarity',
      });

      return NextResponse.json({
        success: true,
        message: `Deleted ${result.deleted} orphaned similarity scores`,
        deleted: result.deleted,
        orphans: result.orphans,
      });
    } else if (type === 'old') {
      const days = parseInt(searchParams.get('days') || '365', 10);
      logger.info('Admin triggered old similarity cleanup', {
        adminId: session.user.id,
        days,
        context: 'AdminCleanupSimilarity',
      });

      const deleted = await deleteOldSimilarityScores(days);

      logger.info('Old similarity cleanup completed', {
        deleted,
        days,
        context: 'AdminCleanupSimilarity',
      });

      return NextResponse.json({
        success: true,
        message: `Deleted ${deleted} old similarity scores (older than ${days} days)`,
        deleted,
      });
    }

    // Fallback (should not be reached)
    return NextResponse.json({ error: 'Invalid cleanup type' }, { status: 400 });
  } catch (error) {
    logger.error('Cleanup failed', {
      error: error instanceof Error ? error.message : String(error),
      context: 'AdminCleanupSimilarity',
    });
    return NextResponse.json(
      { error: 'Cleanup failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
