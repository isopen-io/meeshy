import type { QueryClient } from '@tanstack/react-query';

import type { SocketClient } from '@/lib/net/socket';

/**
 * L'ÉCOUTE DES COMMUNAUTÉS, MONTÉE AVEC LA CONNEXION (#18435) — `community:updated`
 * met à jour le détail et la liste même quand aucun écran de communauté n'est
 * ouvert. Le module qui applique l'événement est chargé EN `import()` : le chunk
 * `realtime` est au plafond de `budgets.json` (motif `bindAppearanceLiveLazily`).
 */
export function bindCommunityLiveLazily(params: { readonly socket: SocketClient; readonly queryClient: QueryClient }): () => void {
  let live = true;
  let stop: (() => void) | null = null;
  void import('./community-live').then(
    ({ bindCommunityLive }) => {
      if (live) stop = bindCommunityLive(params);
    },
    () => undefined,
  );
  return () => {
    live = false;
    stop?.();
    stop = null;
  };
}
