'use client';

import { useState, useEffect } from 'react';

/**
 * API endpoints for AdminTasteMap component
 */
const API_ENDPOINTS = {
  COMPUTE_SIMILARITIES: '/api/admin/compute-similarities',
  CLEANUP_SIMILARITY: '/api/admin/cleanup/similarity',
} as const;

/**
 * Statistics data structure for taste map similarity scores.
 */
interface Stats {
  totalScores: number;
  uniqueUsers: number;
  averageMatch: number;
  lastComputed: string | null;
  schedulerLastRun: string | null;
}

/**
 * Props for StatCard component.
 */
interface StatCardProps {
  title: string;
  value: number | string;
  suffix?: string;
}

/**
 * AdminTasteMap component provides an interface for managing similarity scores.
 * Displays statistics and actions to cleanup orphaned/old scores or recompute all.
 */
export default function AdminTasteMap() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.COMPUTE_SIMILARITIES, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      } else {
        if (res.status === 401) {
          setMessage('Нет доступа');
        } else {
          try {
            const errData = await res.json();
            setMessage(errData.error || `Error ${res.status}`);
          } catch {
            setMessage(`HTTP error ${res.status}`);
          }
        }
      }
    } catch {
      setMessage('Ошибка при загрузке статистики');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleCleanupOrphans = async () => {
    setActionLoading('cleanup');
    try {
      const res = await fetch(`${API_ENDPOINTS.CLEANUP_SIMILARITY}?type=orphaned`, {
        method: 'POST',
        cache: 'no-store',
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Удалено ${data.deleted} сиротских записей`);
        await fetchStats();
      } else {
        setMessage(`Ошибка: ${data.error || 'неизвестно'}`);
      }
    } catch (e) {
      setMessage('Ошибка при очистке');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCleanupOld = async () => {
    setActionLoading('oldCleanup');
    try {
      const res = await fetch(`${API_ENDPOINTS.CLEANUP_SIMILARITY}?type=old&days=365`, {
        method: 'POST',
        cache: 'no-store',
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Удалено ${data.deleted} старых записей`);
        await fetchStats();
       } else {
         setMessage(`Ошибка: ${data.error || 'неизвестно'}`);
       }
     } catch {
       setMessage('Ошибка при очистке старых записей');
     } finally {
      setActionLoading(null);
    }
  };

  const handleComputeAll = async () => {
    setActionLoading('compute');
    try {
      const res = await fetch(API_ENDPOINTS.COMPUTE_SIMILARITIES, {
        method: 'POST',
        cache: 'no-store',
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        await fetchStats();
       } else {
         setMessage(`Ошибка: ${data.error || 'неизвестно'}`);
       }
     } catch {
       setMessage('Ошибка при пересчете');
     } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          <span className="ml-3 text-gray-400">Загрузка статистики...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Управление Similarity Scores</h1>
      {message && (
        <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded">
          {message}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard title="Всего scores" value={stats?.totalScores ?? 0} />
        <StatCard title="Уникальных пользователей" value={stats?.uniqueUsers ?? 0} />
        <StatCard title="Средний match (%)" value={stats?.averageMatch ?? 0} suffix="%" />
        <StatCard
          title="Последний расчет"
          value={stats?.lastComputed ? new Date(stats.lastComputed).toLocaleString() : '—'}
        />
        <StatCard
          title="Слейд жоб (scheduler)"
          value={stats?.schedulerLastRun ? new Date(stats.schedulerLastRun).toLocaleString() : '—'}
        />
      </div>
      <div className="flex gap-4">
        <button
          onClick={handleCleanupOrphans}
          disabled={actionLoading === 'cleanup'}
          className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded disabled:opacity-50"
        >
          {actionLoading === 'cleanup' ? 'Очистка...' : 'Очистить сиротские записи'}
        </button>
        <button
          onClick={handleCleanupOld}
          disabled={actionLoading === 'oldCleanup'}
          className="bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded disabled:opacity-50"
        >
          {actionLoading === 'oldCleanup' ? 'Очистка...' : 'Очистить старые записи (>365 дней)'}
        </button>
        <button
          onClick={handleComputeAll}
          disabled={actionLoading === 'compute'}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded disabled:opacity-50"
        >
          {actionLoading === 'compute' ? 'Запуск...' : 'Пересчитать все'}
        </button>
      </div>
    </div>
  );
}

/**
 * StatCard component displays a single statistic with title and optional suffix.
 *
 * @param title - The label for the statistic
 * @param value - The numeric or string value to display
 * @param suffix - Optional suffix to append (e.g., '%' for percentage)
 */
function StatCard({ title, value, suffix }: StatCardProps) {
  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="text-gray-400 text-sm">{title}</div>
      <div className="text-2xl font-bold text-white">
        {value}
        {suffix}
      </div>
    </div>
  );
}
