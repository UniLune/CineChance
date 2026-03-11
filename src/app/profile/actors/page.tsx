import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { redirect } from 'next/navigation';
import ActorsClient from './ActorsClient';
import { computeUserPersonProfile } from '@/lib/taste-map/person-profile-v2';

export const dynamic = 'force-dynamic';
export const dynamicParams = true;

export default async function ActorsPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect('/');
  }

  // Заполняем таблицу PersonProfile при заходе на страницу
  // Это обеспечивает актуальные данные для страницы taste-map
  await Promise.all([
    computeUserPersonProfile(session.user.id, 'actor'),
    computeUserPersonProfile(session.user.id, 'director'),
  ]);

  return (
    <div className="min-h-screen bg-gray-950 py-6 md:py-8">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <div className="mb-6">
          <a 
            href="/profile" 
            className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1 mb-4"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Вернуться в профиль
          </a>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            Мои любимые актеры
          </h1>
        </div>
        
        <ActorsClient userId={session.user.id} />
      </div>
    </div>
  );
}
