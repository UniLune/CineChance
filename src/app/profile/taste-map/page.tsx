import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { redirect } from 'next/navigation';
import { getTasteMap, computeTasteMap } from '@/lib/taste-map';
import TasteMapClient from './TasteMapClient';

export const dynamic = 'force-dynamic';
export const dynamicParams = true;

/**
 * TasteMapPage displays the user's taste map profile.
 *
 * Server component that:
 * - Checks authentication and redirects if not logged in
 * - Derives isAdmin flag by comparing user ID to ADMIN_USER_ID
 * - Fetches taste map data with automatic caching
 * - Renders TasteMapClient with required props
 *
 * @returns Taste map page UI
 */
export default async function TasteMapPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect('/');
  }

  const isAdmin = session.user.id === process.env.ADMIN_USER_ID; // Derive admin status from env

   // Fetch taste map with automatic caching
   const tasteMap = await getTasteMap(session.user.id, () => computeTasteMap(session.user.id));

   return (
     <div className="min-h-screen bg-gray-950 py-6 md:py-8">
       <div className="container mx-auto px-4 md:px-6 max-w-4xl">
         <h1 className="text-2xl md:text-3xl font-bold text-white mb-6 md:mb-8">
           Карта вкуса
         </h1>
         
          <TasteMapClient
            tasteMap={tasteMap}
            userId={session.user.id}
            isAdmin={isAdmin}
          />
       </div>
     </div>
   );
 }
