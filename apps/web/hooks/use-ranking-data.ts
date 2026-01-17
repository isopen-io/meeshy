import { useState, useEffect, useCallback } from 'react';
import { adminService } from '@/services/admin.service';

interface RankingMetadata {
  username?: string;
  type?: string;
  identifier?: string;
  shortCode?: string;
  originalUrl?: string;
  totalClicks?: number;
  uniqueClicks?: number;
  currentUses?: number;
  maxUses?: number;
  messageType?: string;
  createdAt?: string;
  creator?: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };
  sender?: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };
  conversation?: {
    id: string;
    identifier: string;
    title?: string;
    type?: string;
  };
  [key: string]: unknown;
}

export interface RankingItem {
  id: string;
  username?: string;
  displayName?: string;
  avatar?: string;
  identifier?: string;
  title?: string;
  type?: string;
  image?: string;
  count?: number;
  lastActivity?: string;
  rank?: number;
  name?: string;
  value?: number;
  metadata?: RankingMetadata;
  content?: string;
  contentPreview?: string;
  createdAt?: string;
  messageType?: string;
  sender?: {
    id: string;
    username: string;
    displayName: string;
    avatar?: string;
  };
  conversation?: {
    id: string;
    identifier: string;
    title?: string;
    type: string;
  };
  shortCode?: string;
  originalUrl?: string;
  totalClicks?: number;
  uniqueClicks?: number;
  currentUses?: number;
  maxUses?: number;
  currentUniqueSessions?: number;
  expiresAt?: string;
  creator?: {
    id: string;
    username: string;
    displayName: string;
    avatar?: string;
  };
}

interface UseRankingDataParams {
  entityType: 'users' | 'conversations' | 'messages' | 'links';
  criterion: string;
  period: string;
  limit: number;
}

export function useRankingData({ entityType, criterion, period, limit }: UseRankingDataParams) {
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRankings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('[Ranking] Fetching with params:', { entityType, criterion, period, limit });
      const response = await adminService.getRankings(entityType, criterion, period, limit);
      console.log('[Ranking] Response received:', response);

      if (response.success && response.data) {
        const responseData = response.data as { rankings?: unknown[] };
        const rankings = responseData.rankings;

        if (Array.isArray(rankings)) {
          const rankedData = rankings.map((item: any, index: number) => ({
            id: item.id,
            name: item.displayName || item.username || item.title || item.name || 'Sans nom',
            avatar: item.avatar || item.image,
            value: item.count || 0,
            rank: index + 1,
            metadata: item
          }));
          console.log('[Ranking] Processed rankings:', rankedData.length, 'items');
          setRankings(rankedData);
        } else {
          const errorMsg = 'Format de réponse invalide: rankings n\'est pas un tableau';
          console.error('[Ranking] Invalid format:', response.data);
          setError(errorMsg);
        }
      } else {
        const errorMsg = response.message || 'Erreur lors du chargement des classements';
        console.error('[Ranking] Response error:', errorMsg, response);
        setError(errorMsg);
      }
    } catch (err: any) {
      let errorMessage = err.message || 'Erreur lors du chargement des classements';

      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Network')) {
        errorMessage = 'Impossible de se connecter au serveur backend. Vérifiez que le gateway est démarré.';
      }

      console.error('[Ranking] Fetch error:', errorMessage, err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [entityType, criterion, period, limit]);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  return {
    rankings,
    loading,
    error,
    refetch: fetchRankings
  };
}
