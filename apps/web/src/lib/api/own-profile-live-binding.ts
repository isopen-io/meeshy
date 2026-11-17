import type { QueryClient } from '@tanstack/react-query';

import type { SocketClient } from '@/lib/net/socket';

/**
 * L'ÉCOUTE DE MON PROFIL, MONTÉE AVEC LA CONNEXION (#18924) — le module qui
 * décode et applique `profile:updated` est chargé EN `import()` : le chunk
 * `realtime` est au plafond de `budgets.json`, et le schéma du contrat n'a rien
 * à y faire (motif `bindPreferencesLiveLazily`). Un événement arrivé avant le
 * module est rattrapé par la relecture de `GET /me` à l'authentification
 * (`CATCH_UP_PERSONAL_FAMILIES`). Si le socket tombe avant l'arrivée du module,
 * l'abonnement n'a pas lieu (le disposer le sait).
 */
export function bindOwnProfileLiveLazily(params: { readonly socket: SocketClient; readonly queryClient: QueryClient }): () => void {
  let live = true;
  let stop: (() => void) | null = null;
  void import('./own-profile-live').then(
    ({ bindOwnProfileLive }) => {
      if (live) stop = bindOwnProfileLive(params);
    },
    () => undefined,
  );
  return () => {
    live = false;
    stop?.();
    stop = null;
  };
}
