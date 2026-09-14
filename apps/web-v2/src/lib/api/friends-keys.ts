/**
 * **LA FAMILLE DES CLÉS D'AMITIÉ** (#6363, #6321) — le préfixe que partagent
 * les trois paniers de demandes (`friend-requests.ts`) et les bloqués
 * (`blocks.ts`). Module SANS dépendance : le temps réel (`socket.ts`)
 * l'importe pour invalider la famille sans emporter le port, ses décodeurs ni
 * `zod` dans son chunk (`budgets.json › realtime`, `dynamic_only`).
 */
export const FRIENDS_QUERY_PREFIX = ['friends'] as const;
