import type { Query } from '@tanstack/react-query';

/**
 * Politique de persistance IndexedDB du cache React Query.
 *
 * Tout est persisté (ouverture instantanée de l'app) SAUF ce qu'un tiers peut
 * rendre faux pendant que l'app est fermée — messages et notifications. Le
 * socket ne pousse rien hors ligne ; persistées 24 h et combinées à
 * `staleTime: Infinity`, ces listes figeaient à l'écran un état auquel il
 * manquait des entrées, qu'aucun rechargement ne réparait.
 *
 * Les médias restent en cache : les pièces jointes sont servies par URL
 * (cache HTTP + service worker) et leurs métadonnées (`attachments`) continuent
 * d'être persistées ici.
 */
const VOLATILE_ROOTS = new Set(['messages', 'notifications']);

export function shouldDehydrateQuery(query: Query): boolean {
  if (query.state.status !== 'success') return false;
  return !VOLATILE_ROOTS.has(query.queryKey[0] as string);
}
