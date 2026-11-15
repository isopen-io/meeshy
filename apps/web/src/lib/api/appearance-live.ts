import type { QueryClient } from '@tanstack/react-query';

import type { SocketClient } from '@/lib/net/socket';

/**
 * L'ÉCOUTE DE L'APPARENCE, MONTÉE AVEC LA CONNEXION (#10663) — `user:preferences-updated`
 * d'un autre appareil repaint la liste des conversations même quand aucun fil
 * n'est ouvert. Le module qui applique l'événement est chargé EN `import()` :
 * le chunk `realtime` est au plafond de `budgets.json`. Si le socket tombe avant
 * l'arrivée du module, l'abonnement n'a pas lieu (le disposer le sait).
 */
export function bindAppearanceLiveLazily(params: { readonly socket: SocketClient; readonly queryClient: QueryClient }): () => void {
  let live = true;
  let stop: (() => void) | null = null;
  void import('./conversation-appearance').then(
    ({ bindAppearanceLive }) => {
      if (live) stop = bindAppearanceLive(params);
    },
    () => undefined,
  );
  return () => {
    live = false;
    stop?.();
    stop = null;
  };
}
