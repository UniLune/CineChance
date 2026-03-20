import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { redirect } from 'next/navigation';
import AdminTasteMap from './AdminTasteMap';

/**
 * Forces dynamic rendering for the admin taste map page.
 * This ensures fresh data on every request.
 */
export const dynamic = 'force-dynamic';

/**
 * Admin page component for managing taste map similarity scores.
 * Requires admin authentication.
 */
export default async function AdminTasteMapPage() {
  const session = await getServerSession(authOptions);
  const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

  if (!session?.user?.id || session.user.id !== ADMIN_USER_ID) {
    redirect('/');
  }

  return <AdminTasteMap />;
}
