// src/app/profile/actors/ActorsClient.tsx
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Users } from 'lucide-react';
import ImageWithProxy from '@/app/components/ImageWithProxy';
import Loader from '@/app/components/Loader';
import '@/app/profile/components/AchievementCards.css';
import { logger } from '@/lib/logger';

interface ActorAchievement {
  id: number;
  name: string;
  profile_path: string | null;
  watched_movies: number;
  rewatched_movies: number;
  dropped_movies: number;
  total_movies: number;
  progress_percent: number;
  average_rating: number | null;
  actor_score: number;
}

interface ActorsClientProps {
  userId: string;
}

const TOP_ACTORS_COUNT = 50; // Оптимальное количество для балансировки производительности и сортировки
const DISPLAY_COUNT = 50; // Показываем все 50

// Skeleton для карточки актера
function ActorCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[2/3] rounded-lg bg-gray-800 border border-gray-700" />
      <div className="mt-2 h-4 bg-gray-800 rounded w-3/4" />
      <div className="mt-1 h-3 bg-gray-900 rounded w-1/2" />
    </div>
  );
}

// Skeleton для всей страницы
function PageSkeleton() {
  const skeletonCount = 12;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {Array.from({ length: skeletonCount }).map((_, i) => (
        <ActorCardSkeleton key={i} />
      ))}
    </div>
  );
}

export default function ActorsClient({ userId }: ActorsClientProps) {
  const [actors, setActors] = useState<ActorAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Загрузка актеров с прогресс-баром
  useEffect(() => {
    const fetchActors = async () => {
      try {
        setLoading(true);
        setError(null);
        setProgress(0);

        // Запускаем анимацию прогресса с информативными сообщениями
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

        // Добавляем таймаут для предотвращения зависания
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 секунд таймаут

        const response = await fetch(`/api/user/achiev_actors?limit=${TOP_ACTORS_COUNT}&singleLoad=true`, {
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json() as { actors: ActorAchievement[] };
        
        logger.debug('Actors API response', { data });
        
        // Останавливаем анимацию прогресса
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }

        const actorsData = data.actors || [];
        logger.debug('Actors data received', { count: actorsData.length });
        
        // Выводим информацию о прогрессе для отладки
        actorsData.forEach((actor, index: number) => {
          logger.debug('Actor progress', { index: index + 1, name: actor.name, watched: actor.watched_movies, total: actor.total_movies, progress: actor.progress_percent });
        });

        setActors(actorsData.slice(0, DISPLAY_COUNT));
        setProgress(100);
        
        // Небольшая задержка для визуала
        setTimeout(() => setLoading(false), 300);
        
      } catch (err) {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
        
        // Детальная обработка ошибок
        let errorMessage = 'Не удалось загрузить актеров. Попробуйте позже.';
        if (err instanceof Error) {
          logger.error('Actors loading error', { error: err instanceof Error ? err.message : String(err) });
          if (err.name === 'AbortError') {
            errorMessage = 'Загрузка занимает слишком много времени. У вас много просмотренных фильмов, поэтому требуется больше времени. Попробуйте обновить страницу.';
          } else if (err.message.includes('API Error')) {
            errorMessage = 'Ошибка сервера при загрузке актеров. Попробуйте позже.';
          } else if (err.message.includes('Failed to fetch')) {
            errorMessage = 'Проблемы с соединением. Проверьте интернет-соединение.';
          }
        }
        
        setError(errorMessage);
        setProgress(100);
        setLoading(false);
      }
    };

    fetchActors();

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [userId]);

  // Получаем информативное сообщение на основе прогресса
  const getProgressMessage = () => {
    if (progress < 20) return '🎬 Собираем информацию об актерах...';
    if (progress < 40) return '📊 Анализируем фильмографии...';
    if (progress < 60) return '⭐ Формируем рейтинги...';
    if (progress < 80) return '🎭 Готовим списки лучших...';
    if (progress < 95) return '📸 Загружаем фотографии...';
    return '✨ Почти готово...';
  };

  const getProgressSubtext = () => {
    if (progress < 20) return 'Изучаем ваши предпочтения в кино';
    if (progress < 40) return 'Считаем просмотренные фильмы каждого актера';
    if (progress < 60) return 'Упорядочиваем по вашим оценкам';
    if (progress < 80) return 'Отбираем самых любимых исполнителей';
    if (progress < 95) return 'Подготавливаем постеры для отображения';
    return 'Скоро покажем результат!';
  };

  // Обработчик загрузки изображения
  const handleImageLoad = useCallback((actorId: number) => {
    setLoadedImages(prev => new Set(prev).add(actorId));
  }, []);

  // Определяем приоритет загрузки
  const getImagePriority = (index: number) => {
    return index < 12; // Первые 12 изображений с приоритетом
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Skeleton заголовка */}
        <div className="h-6 w-48 bg-gray-800 rounded animate-pulse" />
        
        {/* Прогресс-бар с информативными сообщениями */}
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <div className="w-full max-w-xs">
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-150 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-gray-400 text-xs text-center">{Math.round(progress)}%</p>
          </div>
          
          {/* Информативные сообщения */}
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

  if (actors.length === 0) {
    return (
      <div className="bg-gray-900 rounded-lg md:rounded-xl p-6 border border-gray-800">
        <p className="text-gray-400 text-center py-10">
          У вас пока нет любимых актеров
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Заголовок с количеством */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Любимые актеры</h2>
        <p className="text-gray-400 text-sm">
          Показано {actors.length} актеров
        </p>
      </div>

      {/* Сетка актеров */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {actors.map((actor, index) => {
            const progress = actor.progress_percent || 0;
            
            // Исправленная формула контраста с правильной насыщенностью
            let grayscale, saturate;
            
            if (progress <= 25) {
              // Очень низкий прогресс - почти полностью бесцветные
              grayscale = 100 - (progress * 0.4); // 100% -> 90%
              saturate = 0.1 + (progress * 0.02); // 0.1 -> 0.6
            } else if (progress <= 50) {
              // Низкий прогресс - заметная бесцветность
              grayscale = 90 - ((progress - 25) * 1.6); // 90% -> 50%
              saturate = 0.6 + ((progress - 25) * 0.016); // 0.6 -> 1.0
            } else if (progress <= 75) {
              // Средний прогресс - умеренная бесцветность (самая заметная разница)
              grayscale = 50 - ((progress - 50) * 1.2); // 50% -> 20%
              saturate = 1.0; // Нормальная насыщенность
            } else if (progress <= 90) {
              // Высокий прогресс - легкая бесцветность
              grayscale = 20 - ((progress - 75) * 0.8); // 20% -> 0%
              saturate = 1.0; // Нормальная насыщенность
            } else {
              // Почти завершено - минимальная бесцветность
              grayscale = Math.max(0, 10 - ((progress - 90) * 1)); // 10% -> 0%
              saturate = 1.0; // Нормальная насыщенность
            }
            
            // Ограничиваем значения
            grayscale = Math.max(0, Math.min(100, grayscale));
            saturate = Math.max(0.1, Math.min(2.5, saturate));
            
            const isImageLoaded = loadedImages.has(actor.id);
            
            return (
              <Link
                key={actor.id}
                href={`/person/${actor.id}`}
                className="group relative"
              >
                <div className="relative">
                  <div className="aspect-[2/3] rounded-lg overflow-hidden bg-gray-800 border border-gray-700 group-hover:border-amber-500/50 transition-all relative">
                    {actor.profile_path ? (
                      <div className="w-full h-full relative">
                        <ImageWithProxy
                          src={`https://image.tmdb.org/t/p/w342${actor.profile_path}`}
                          alt={actor.name}
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
                          onLoad={() => handleImageLoad(actor.id)}
                        />
                        
                        {/* Placeholder пока изображение загружается */}
                        {!isImageLoaded && (
                          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                            <Users className="w-10 h-10 text-gray-600" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600">
                        <Users className="w-10 h-10" />
                      </div>
                    )}
                    
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gray-800">
                      <div 
                        className="h-full bg-amber-500 transition-all duration-300"
                        style={{ 
                          width: `${progress}%`,
                          opacity: progress === 0 ? 0.3 : 1
                        }}
                      />
                    </div>
                    
                    <div className="absolute top-2 right-2 bg-amber-600/90 text-white text-xs font-medium px-2 py-1 rounded">
                      {progress}%
                    </div>
                  </div>
                  
                  <h3 className="mt-2 text-gray-300 text-sm truncate group-hover:text-amber-400 transition-colors">
                    {actor.name}
                  </h3>
                  
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-gray-500 text-xs">
                      <span className="text-green-400">{actor.watched_movies}</span>
                      {' / '}
                      <span>{actor.total_movies}</span>
                      {' фильмов'}
                    </p>
                    {actor.average_rating !== null && (
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
                          {actor.average_rating.toFixed(1)}
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
