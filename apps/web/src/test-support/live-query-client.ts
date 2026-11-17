import { QueryClient, type QueryClientConfig } from '@tanstack/react-query';

import { installLiveCacheJournal } from '@/lib/api/live-cache-journal';

/**
 * UN `QueryClient` CONFIGURÉ COMME CELUI DE L'APPLICATION POUR LE TEMPS RÉEL
 * (#18914) — le journal des écritures vives posé dès la création, comme le fait
 * `createAppQueryClient`. Un témoin qui mesure qu'une écriture temps réel
 * SURVIT à une relecture en vol le construit ainsi : la survie est une
 * propriété du client, pas de l'écrivain.
 */
export function liveQueryClient(config?: QueryClientConfig): QueryClient {
  const queryClient = new QueryClient(config);
  installLiveCacheJournal(queryClient);
  return queryClient;
}
