import type { Query } from '@tanstack/react-query';

/**
 * Politique de persistance IndexedDB du cache React Query.
 *
 * Tout est persisté (ouverture instantanée de l'app) SAUF les listes de
 * messages : c'est la seule donnée qui devient fausse dès qu'un tiers écrit
 * dans la conversation. Persistées 24 h et combinées à `staleTime: Infinity`,
 * elles figeaient à l'écran une page dont un message pouvait manquer, sans
 * qu'aucun rechargement ne puisse la réparer.
 *
 * Les médias restent en cache : les pièces jointes sont servies par URL
 * (cache HTTP + service worker) et leurs métadonnées (`attachments`) continuent
 * d'être persistées ici.
 */
export function shouldDehydrateQuery(query: Query): boolean {
  if (query.state.status !== 'success') return false;
  return query.queryKey[0] !== 'messages';
}
