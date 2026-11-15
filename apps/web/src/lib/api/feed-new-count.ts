import type { QueryClient } from '@tanstack/react-query';

/**
 * LE COMPTE DE CE QU'ON N'A PAS ENCORE VU (#7182) — miroir de `newPostsCount`
 * (`FeedViewModel.swift:63`), qui alimente la bannière « N nouvelles
 * publications ».
 *
 * **UN MODULE À PART, ET LA RAISON EST MESURÉE.** La clé et sa remise à zéro
 * sont ce dont l'ÉCRAN a besoin ; les LOIS du temps réel (réconciliation par
 * cmid, idempotence, insertion en tête) sont ce dont la SOCKET a besoin. Les
 * tenir ensemble faisait tirer les secondes par le premier : le chunk `feed`
 * est passé de 11,17 à 12,00 Ko — son plafond exact — pour une bannière de
 * cinquante lignes. Séparés, l'écran ne paie que la constante.
 *
 * Il vit dans le cache de requêtes plutôt que dans un store à lui : le
 * `QueryClient` est le canal que la socket et les écrans partagent DÉJÀ, et un
 * second canal pour un seul entier coûterait plus que le compte qu'il porte.
 * Aucune `queryFn` ne le sert — c'est un compte de SESSION, sans source
 * serveur : il naît à la première publication reçue et meurt avec l'onglet.
 */
export const FEED_NEW_COUNT_KEY = ['feed', 'new-count'] as const;

/** La bannière tapée : on repart de zéro (`FeedViewModel.swift:389`). */
export function clearNewPostCount(queryClient: QueryClient): void {
  queryClient.setQueryData<number>(FEED_NEW_COUNT_KEY, 0);
}

export function bumpNewPostCount(queryClient: QueryClient): void {
  queryClient.setQueryData<number>(FEED_NEW_COUNT_KEY, (held) => (held ?? 0) + 1);
}
