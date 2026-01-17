/**
 * Hook pour gérer l'état et les opérations des groupes/communautés
 * Suit les Vercel React Best Practices: rerender-lazy-state-init
 */

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Group } from '@meeshy/shared/types';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';
import { toast } from 'sonner';

export function useGroups() {
  // Lazy state initialization pour éviter les re-renders inutiles
  const [groups, setGroups] = useState<Group[]>(() => []);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Charger les groupes
  const loadGroups = useCallback(async () => {
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        return;
      }

      const response = await fetch(buildApiUrl(API_ENDPOINTS.GROUP.LIST), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const result = await response.json();
        const data = result.success ? result.data : result;
        setGroups(Array.isArray(data) ? data : []);
      } else if (response.status === 401) {
        authManager.clearAllSessions();
        router.push('/');
      } else {
        console.error('Groups API error:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Erreur chargement groupes:', error);
      toast.error('Erreur lors du chargement des groupes');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  // Charger les données au montage
  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  return {
    groups,
    setGroups,
    isLoading,
    loadGroups,
    refetch: loadGroups
  };
}
