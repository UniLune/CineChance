import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { redirect } from 'next/navigation';
import { getTasteMap, computeTasteMap } from '@/lib/taste-map';
import { prisma } from '@/lib/prisma';
import type { PersonData } from '@/lib/taste-map/person-profile-v2';
import TasteMapClient from './TasteMapClient';

export const dynamic = 'force-dynamic';
export const dynamicParams = true;

export default async function TasteMapPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect('/');
  }

  // Fetch taste map with automatic caching
  const tasteMap = await getTasteMap(session.user.id, () => computeTasteMap(session.user.id));

  // Read PersonProfile from DB directly (no compute, no TMDB)
  const [actorProfile, directorProfile] = await Promise.all([
    prisma.personProfile.findUnique({
      where: { userId_personType: { userId: session.user.id, personType: 'actor' } },
    }),
    prisma.personProfile.findUnique({
      where: { userId_personType: { userId: session.user.id, personType: 'director' } },
    }),
  ]);

  // Transform to client format: Array<[name, score]>
  const topActors: Array<[string, number]> = ((actorProfile?.topPersons as unknown) as PersonData[] || [])
    .slice(0, 10)
    .map(p => [p.name, p.avgWeightedRating] as [string, number]);

  const topDirectors: Array<[string, number]> = ((directorProfile?.topPersons as unknown) as PersonData[] || [])
    .slice(0, 10)
    .map(p => [p.name, p.avgWeightedRating] as [string, number]);

  return (
    <div className="min-h-screen bg-gray-950 py-6 md:py-8">
      <div className="container mx-auto px-4 md:px-6 max-w-4xl">
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-6 md:mb-8">
          Карта вкуса
        </h1>
        
        <TasteMapClient
          tasteMap={tasteMap}
          userId={session.user.id}
          topActors={topActors}
          topDirectors={topDirectors}
        />
      </div>
    </div>
  );
}
