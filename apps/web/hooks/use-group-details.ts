/**
 * Hook pour gérer les détails d'un groupe sélectionné
 * Suit les Vercel React Best Practices: separation of concerns
 */

import { useState, useCallback } from 'react';
import type { Group } from '@meeshy/shared/types';
import { buildApiUrl } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';
import { isValidJWTFormat } from '@/utils/auth';
import { toast } from 'sonner';

export function useGroupDetails() {
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Charger les détails d'un groupe
  const loadGroupDetails = useCallback(async (identifier: string, isMobile: boolean = false) => {
    try {
      setIsLoadingDetails(true);
      const token = authManager.getAuthToken();
      if (!token) {
        toast.error('Token d\'authentification manquant. Veuillez vous reconnecter.');
        return;
      }

      // Vérifier que le token n'est pas corrompu
      if (!isValidJWTFormat(token)) {
        console.error('[DEBUG] Invalid JWT token format:', token);
        toast.error('Token d\'authentification invalide. Veuillez vous reconnecter.');
        authManager.clearAllSessions();
        return;
      }

      const response = await fetch(buildApiUrl(`/communities/${identifier}`), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const result = await response.json();
        const data = result.success ? result.data : result;
        setSelectedGroup(data);
      } else {
        console.error('Erreur chargement détails groupe:', response.status, response.statusText);

        // Gérer les erreurs d'authentification spécifiquement
        if (response.status === 401 || response.status === 403) {
          authManager.clearAllSessions();
          toast.error('Session expirée. Veuillez vous reconnecter.');
          window.location.href = '/login';
          return;
        }

        const errorText = await response.text();
        console.error('[DEBUG] Error response body:', errorText);
        toast.error(`Erreur lors du chargement du groupe (${response.status})`);
      }
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur de connexion lors du chargement du groupe');
    } finally {
      setIsLoadingDetails(false);
    }
  }, []);

  return {
    selectedGroup,
    setSelectedGroup,
    isLoadingDetails,
    loadGroupDetails
  };
}
