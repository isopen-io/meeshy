import { useState, useCallback, useRef, useEffect } from 'react';
import type { DashboardData } from '@/services/dashboard.service';
import { dashboardService } from '@/services/dashboard.service';
import { useUser } from '@/stores';

const CACHE_DURATION = 30000; // 30 seconds

export function useDashboardData() {
  const user = useUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  const cacheRef = useRef({ data, timestamp: lastFetchTime });

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const now = Date.now();

    // Use cache if not forcing refresh and cache is valid
    if (!forceRefresh && cacheRef.current.data && (now - cacheRef.current.timestamp) < CACHE_DURATION) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await dashboardService.getDashboardData();
      if (response.data) {
        setData(response.data);
        setLastFetchTime(now);
        cacheRef.current = { data: response.data, timestamp: now };
      } else {
        throw new Error('Failed to load dashboard data');
      }
    } catch (err) {
      console.error('Error loading dashboard:', err);
      setError(err instanceof Error ? err : new Error('Unknown error occurred'));
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    error,
    refetch: useCallback(() => fetchData(true), [fetchData]),
  };
}
