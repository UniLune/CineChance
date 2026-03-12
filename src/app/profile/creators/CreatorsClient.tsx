'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Clapperboard } from 'lucide-react';
 import ImageWithProxy from '@/app/components/ImageWithProxy';
 import '@/app/profile/components/AchievementCards.css';
 import { logger } from '@/lib/logger';

interface CreatorAchievement {
  id: number;
  name: string;
  profile_path: string | null;
  watched_movies: number;
  rewatched_movies: number;
  dropped_movies: number;
  total_movies: number;
  progress_percent: number;
  average_rating: number | null;
  creator_score: number;
}

interface CreatorsClientProps {
  userId: string;
}

const TOP_CREATORS_COUNT = 50;
const DISPLAY_COUNT = 50;

/**
 * Skeleton loader component for a single creator card.
 * Displayed while the creator data is loading.
 * 
 * @returns JSX element with animated placeholder for creator card
 */
function CreatorCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[2/3] rounded-lg bg-gray-800 border border-gray-700" />
      <div className="mt-2 h-4 bg-gray-800 rounded w-3/4" />
      <div className="mt-1 h-3 bg-gray-900 rounded w-1/2" />
    </div>
  );
}

/**
 * Skeleton loader for the entire creators page.
 * Displays a grid of placeholder cards while loading.
 * 
 * @returns JSX element with grid of animated creator card skeletons
 */
function PageSkeleton() {
  const skeletonCount = 12;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {Array.from({ length: skeletonCount }).map((_, i) => (
        <CreatorCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Client component for displaying user's favorite directors (creators).
 * 
 * Fetches director achievement data from the API and displays it in a responsive grid.
 * Features:
 * - Animated loading progress bar with stage messages
 * - Lazy loading of images with blur-up effect
 * - Dynamic grayscale/saturation based on progress percentage
 * - Average rating display with CineChance logo
 * - Progress bar showing how much of director's filmography has been watched
 * 
 * **Visual Effects:**
 * - Progress 0-25%: High grayscale (100%), low saturation (0.1-0.6)
 * - Progress 25-50%: Reducing grayscale, increasing saturation
 * - Progress 50-75%: Moderate grayscale (50-20%), full saturation
 * - Progress 75-90%: Low grayscale (20-10%), full saturation  
 * - Progress 90-100%: Full color, enhanced presentation
 * 
 * **Edge Cases:**
 * - Empty state: Displays message when no creators found
 * - Error state: Shows error message with retry button
 * - Timeout: Handles 120-second timeout with custom message for large watchlists
 * - Missing profile: Shows clapperboard icon as fallback
 * 
 * @param props - Component props
 * @param props.userId - The current user's ID for fetching their data
 * @returns JSX element with creator grid or loading/error states
 * 
 * @example
 * <CreatorsClient userId="user-123" />
 */
export default function CreatorsClient({ userId }: CreatorsClientProps) {
  const [creators, setCreators] = useState<CreatorAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchCreators = async () => {
      try {
        setLoading(true);
        setError(null);
        setProgress(0);

        progressIntervalRef.current = setInterval(() => {
          setProgress(prev => {
            if (prev < 70) {
              return Math.min(prev + Math.random() * 3 + 1, 70);
            } else if (prev < 85) {
              return Math.min(prev + Math.random() * 1 + 0.5, 85);
            } else {
              return prev;
            }
          });
        }, 200);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        const response = await fetch(`/api/user/achiev_creators?limit=${TOP_CREATORS_COUNT}&singleLoad=true`, {
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }

         const data = await response.json() as { creators: CreatorAchievement[] };
         
         logger.debug('Creators API response', { data });

         if (progressIntervalRef.current) {
           clearInterval(progressIntervalRef.current);
         }

         const creatorsData = data.creators || [];
         logger.debug('Creators data received', { count: creatorsData.length });

         // Log each creator's progress for debugging
         creatorsData.forEach((creator: CreatorAchievement, index: number) => {
           logger.debug('Creator progress', { index: index + 1, name: creator.name, watched: creator.watched_movies, total: creator.total_movies, progress: creator.progress_percent });
         });

         setCreators(creatorsData);
         setProgress(100);
        
        setTimeout(() => setLoading(false), 300);
        
      } catch (err) {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
        
        let errorMessage = 'Не удалось загрузить создателей. Попробуйте позже.';
        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            errorMessage = 'Загрузка занимает слишком много времени. У вас много просмотренных фильмов, поэтому требуется больше времени. Попробуйте обновить страницу.';
          } else if (err.message.includes('API Error')) {
            errorMessage = 'Ошибка сервера при загрузке создателей. Попробуйте позже.';
          } else if (err.message.includes('Failed to fetch')) {
            errorMessage = 'Проблемы с соединением. Проверьте интернет-соединение.';
          }
        }
        
        setError(errorMessage);
        setProgress(100);
        setLoading(false);
      }
    };

    fetchCreators();

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [userId]);

  /**
   * Returns a progress message based on the current loading percentage.
   * Messages are in Russian and describe the current processing stage.
   * 
   * Progress stages:
   * - 0-20%: Collecting creator information
   * - 20-40%: Analyzing filmographies
   * - 40-60%: Forming ratings
   * - 60-80%: Preparing top lists
   * - 80-95%: Loading photos
   * - 95-100%: Finalizing
   * 
   * @returns Russian string describing current loading stage
   */
  const getProgressMessage = () => {
    if (progress < 20) return '🎬 Собираем информацию о создателях...';
    if (progress < 40) return '📊 Анализируем фильмографии...';
    if (progress < 60) return '⭐ Формируем рейтинги...';
    if (progress < 80) return '🎭 Готовим списки лучших...';
    if (progress < 95) return '📸 Загружаем фотографии...';
    return '✨ Почти готово...';
  };

  /**
   * Returns a detailed subtext message explaining what processing is happening.
   * Provides users with context about the lengthy calculation process.
   * 
   * Subtext stages mirror getProgressMessage but with more detail:
   * - 0-20%: Learning movie preferences
   * - 20-40%: Counting watched movies per creator
   * - 40-60%: Ordering by ratings
   * - 60-80%: Selecting favorite filmmakers
   * - 80-95%: Preparing posters
   * - 95-100%: Finalizing results
   * 
   * @returns Russian string with detailed progress explanation
   */
  const getProgressSubtext = () => {
    if (progress < 20) return 'Изучаем ваши предпочтения в кино';
    if (progress < 40) return 'Считаем просмотренные фильмы каждого создателя';
    if (progress < 60) return 'Упорядочиваем по вашим оценкам';
    if (progress < 80) return 'Отбираем самых любимых кинематографистов';
    if (progress < 95) return 'Подготавливаем постеры для отображения';
    return 'Скоро покажем результат!';
  };

  /**
   * Callback handler for when a creator image finishes loading.
   * Adds the creator ID to the set of loaded images to trigger
   * the opacity transition from transparent to visible.
   * 
   * @param creatorId - TMDB ID of the creator whose image loaded
   */
  const handleImageLoad = useCallback((creatorId: number) => {
    setLoadedImages(prev => new Set(prev).add(creatorId));
  }, []);

  /**
   * Determines if an image should be prioritized for loading.
   * First 12 images are prioritized (preload) for better UX.
   * 
   * Uses Next.js Image priority prop for LCP optimization.
   * Only the first 12 images in the grid get priority loading.
   * 
   * @param index - Position of the creator card in the grid (0-indexed)
   * @returns true if image should be prioritized, false otherwise
   * @example
   * // First 12 cards get priority loading
   * const priority = getImagePriority(0);  // true
   * const priority = getImagePriority(11); // true
   * const priority = getImagePriority(12); // false
   */
  const getImagePriority = (index: number) => {
    return index < 12;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 bg-gray-800 rounded animate-pulse" />
        
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <div className="w-full max-w-xs">
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-150 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-gray-400 text-xs text-center">{Math.round(progress)}%</p>
          </div>
          
          <div className="text-center mt-4">
            <p className="text-gray-500 text-sm mb-2">
              {getProgressMessage()}
            </p>
            <p className="text-gray-600 text-xs">
              {getProgressSubtext()}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-700 rounded-lg p-6">
        <p className="text-red-300 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  if (creators.length === 0) {
    return (
      <div className="bg-gray-900 rounded-lg md:rounded-xl p-6 border border-gray-800">
        <p className="text-gray-400 text-center py-10">
          У вас пока нет любимых создателей
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Любимые режиссеры</h2>
        <p className="text-gray-400 text-sm">
          Показано {creators.length} создателей
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {creators.map((creator, index) => {
          const progress = creator.progress_percent || 0;
          
          let grayscale, saturate;
          
          if (progress <= 25) {
            grayscale = 100 - (progress * 0.4);
            saturate = 0.1 + (progress * 0.02);
          } else if (progress <= 50) {
            grayscale = 90 - ((progress - 25) * 1.6);
            saturate = 0.6 + ((progress - 25) * 0.016);
          } else if (progress <= 75) {
            grayscale = 50 - ((progress - 50) * 1.2);
            saturate = 1.0;
          } else if (progress <= 90) {
            grayscale = 20 - ((progress - 75) * 0.8);
            saturate = 1.0;
          } else {
            grayscale = Math.max(0, 10 - ((progress - 90) * 1));
            saturate = 1.0;
          }
          
          grayscale = Math.max(0, Math.min(100, grayscale));
          saturate = Math.max(0.1, Math.min(2.5, saturate));
          
          const isImageLoaded = loadedImages.has(creator.id);
          
          return (
            <Link
              key={`${creator.id}-${index}`}
              href={`/person/${creator.id}`}
              className="group relative"
            >
              <div className="relative">
                <div className="aspect-[2/3] rounded-lg overflow-hidden bg-gray-800 border border-gray-700 group-hover:border-blue-500/50 transition-all relative">
                  {creator.profile_path ? (
                    <div className="w-full h-full relative">
                      <ImageWithProxy
                        src={`https://image.tmdb.org/t/p/w342${creator.profile_path}`}
                        alt={creator.name}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
                        className={`object-cover transition-all duration-300 group-hover:grayscale-0 group-hover:saturate-100 achievement-poster ${
                          isImageLoaded ? 'opacity-100' : 'opacity-0'
                        }`}
                        style={{ 
                          filter: `grayscale(${grayscale}%) saturate(${saturate})`
                        }}
                        priority={getImagePriority(index)}
                        quality={80}
                        onLoad={() => handleImageLoad(creator.id)}
                      />
                      
                      {!isImageLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                          <Clapperboard className="w-10 h-10 text-gray-600" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                      <Clapperboard className="w-10 h-10" />
                    </div>
                  )}
                  
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gray-800">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ 
                        width: `${progress}%`,
                        opacity: progress === 0 ? 0.3 : 1
                      }}
                    />
                  </div>
                  
                  <div className="absolute top-2 right-2 bg-blue-600/90 text-white text-xs font-medium px-2 py-1 rounded">
                    {progress}%
                  </div>
                </div>
                
                <h3 className="mt-2 text-gray-300 text-sm truncate group-hover:text-blue-400 transition-colors">
                  {creator.name}
                </h3>
                
                <div className="flex items-center justify-between mt-1">
                  <p className="text-gray-500 text-xs">
                    <span className="text-green-400">{creator.watched_movies}</span>
                    {' / '}
                    <span>{creator.total_movies}</span>
                    {' фильмов'}
                  </p>
                   {creator.average_rating !== null && (
                     <div className="flex items-center bg-gray-800/50 rounded text-sm flex-shrink-0">
                       <div className="w-5 h-5 relative mx-1">
                         <Image
                           src="/images/logo_mini_lgt.png"
                           alt="CineChance Logo"
                           fill
                           className="object-contain"
                         />
                       </div>
                       <span className="text-gray-200 font-medium pr-2">
                         {creator.average_rating.toFixed(1)}
                       </span>
                     </div>
                   )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
