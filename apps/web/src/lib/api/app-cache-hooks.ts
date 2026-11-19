import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import type { EndToEndRegimeState } from '@/lib/end-to-end-regime-ledger';

import { watchEndToEndConversations } from './end-to-end-cache-watch';
import { installLiveCacheJournal } from './live-cache-journal';

/**
 * **LES CROCHETS DU CACHE DE L'APPLICATION, POSÉS AVEC LUI ET HORS DE LA
 * PREMIÈRE PEINTURE** — la surveillance du bout en bout (#12949, #12986) et le
 * journal des écritures vives (#18914).
 *
 * `query-client.ts` les demande dans UN seul petit morceau, juste après avoir
 * créé le client : chaque `import()` écrit dans le socle se paie avant le
 * premier pixel (`budgets.json` › `first_paint.kb`, au plafond). Le journal se
 * pose avant toute requête de la liste, d'une fiche ou d'un fil : elles naissent
 * dans des modules chargés à la demande (`conversations.ts`, `messages.ts`),
 * après cette demande.
 */
export function installAppCacheHooks(queryClient: QueryClient, ledger: StoreApi<EndToEndRegimeState>): void {
  installLiveCacheJournal(queryClient);
  watchEndToEndConversations(queryClient, ledger);
}
