import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import type { ConversationStoreState } from '@/lib/conversation-store';
import type { SocketClient } from '@/lib/net/socket';

/**
 * L'ÉCOUTE DES PRÉFÉRENCES, MONTÉE AVEC LA CONNEXION (#10663, #18914) —
 * `user:preferences-updated` d'un autre appareil repeint la liste des
 * conversations même quand aucun fil n'est ouvert : fond et accent, épingle,
 * sourdine, archive, nom personnel, catégorie, favori, historique vidé, et
 * les réglages d'application. Le module qui applique l'événement est chargé
 * EN `import()` : le chunk `realtime` est au plafond de `budgets.json`. Si le
 * socket tombe avant l'arrivée du module, l'abonnement n'a pas lieu (le
 * disposer le sait).
 */
export function bindPreferencesLiveLazily(params: {
  readonly socket: SocketClient;
  readonly queryClient: QueryClient;
  readonly conversations: StoreApi<ConversationStoreState>;
}): () => void {
  let live = true;
  let stop: (() => void) | null = null;
  void import('./conversation-preferences-sync').then(
    ({ bindPreferencesLive }) => {
      if (live) stop = bindPreferencesLive(params);
    },
    () => undefined,
  );
  return () => {
    live = false;
    stop?.();
    stop = null;
  };
}
