import { QueryClient, QueryClientConfig } from '@tanstack/react-query';

/**
 * Configuration React Query pour messagerie temps réel
 *
 * Stratégie : données "toujours fraîches" mises à jour par :
 * 1. Socket.IO (source primaire) → met à jour le cache directement
 * 2. Mutations API → invalidation automatique après succès
 * 3. Reconnexion → refetch pour rattraper les events manqués
 *
 * Pas de polling ni de TTL court - Socket.IO gère le temps réel
 */

const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      // Données jamais considérées stale automatiquement
      // Seuls Socket.IO et mutations invalident le cache
      staleTime: Infinity,

      // Garder en cache 30 min pour navigation rapide
      gcTime: 30 * 60 * 1000,

      // Refetch au retour sur l'app (safety net si Socket.IO a raté des events)
      refetchOnWindowFocus: 'always',

      // Refetch après reconnexion réseau (rattrape les events manqués)
      refetchOnReconnect: 'always',

      // Pas de refetch automatique au montage si données en cache
      refetchOnMount: false,

      // Retry logic
      retry: (failureCount, error) => {
        // Don't retry on auth errors
        if (error instanceof Error && 'status' in error) {
          const status = (error as { status: number }).status;
          if (status === 401 || status === 403 || status === 404) {
            return false;
          }
        }
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: false,
    },
  },
};

export const createQueryClient = () => new QueryClient(queryClientConfig);
