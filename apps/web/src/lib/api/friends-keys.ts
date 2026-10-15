/**
 * **LA FAMILLE DES CLÉS D'AMITIÉ** (#6363, #6321) — le préfixe que partagent
 * les trois paniers de demandes (`friend-requests.ts`) et les bloqués
 * (`blocks.ts`). Module SANS dépendance : le temps réel (`socket.ts`)
 * l'importe pour invalider la famille sans emporter le port, ses décodeurs ni
 * `zod` dans son chunk (`budgets.json › realtime`, `dynamic_only`).
 */
export const FRIENDS_QUERY_PREFIX = ['friends'] as const;

/**
 * Le panier des BLOQUÉS et la fenêtre de fraîcheur de la famille, ici pour la
 * même raison (#10593) : la liste des conversations lit le panier (le menu
 * d'une ligne dit « Bloquer » ou « Débloquer ») sans emporter le port ni
 * `zod` dans son chunk — elle charge le port à la demande. `blocks.ts` et
 * `friend-requests.ts` les réexportent ; le raisonnement des cinq minutes est
 * écrit chez `friend-requests.ts`.
 */
export const BLOCKED_USERS_QUERY_KEY = [...FRIENDS_QUERY_PREFIX, 'blocked'] as const;

export const FRIENDS_STALE_TIME = 5 * 60_000;
