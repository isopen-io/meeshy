/**
 * Pagination primitives — SINGLE SOURCE OF TRUTH, zéro dépendance.
 *
 * Extrait de `api-responses.ts` (#4683) : `PaginationMeta` est une primitive
 * de vocabulaire que `user.ts` cite (`PaginatedUsersResponse`, l'alias
 * dépréciée `UserPaginationMeta`) alors que `api-responses.ts` cite
 * `ConversationStats` (`conversation.ts`), qui cite lui-même `UserRole`
 * (`user.ts`) — un cycle à trois. Faire vivre la primitive ICI, sans aucun
 * import, casse le cycle sans déplacer aucun consommateur : `api-responses.ts`
 * la RÉ-EXPORTE (adresse inchangée pour ses importeurs), et `user.ts` l'importe
 * directement d'ici plutôt que de repasser par `api-responses.ts`.
 */

/**
 * Standard pagination metadata - SINGLE SOURCE OF TRUTH
 * All pagination across the application should use this interface.
 *
 * @example Gateway response:
 * {
 *   success: true,
 *   data: [...],
 *   pagination: { total: 100, offset: 0, limit: 20, hasMore: true }
 * }
 */
export interface PaginationMeta {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}
