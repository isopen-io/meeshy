/**
 * Diffusion des préférences user-level (scope « catégorie »).
 *
 * Point d'entrée UNIQUE de `user:preferences-updated` pour ce scope, à côté du
 * résolveur (`privacy-storage`) et de la mémoïsation (`privacy-cache`) : la
 * règle « qui apprend quoi » vit à la portée de la donnée, pas à celle de son
 * écrivain. Les quatre verbes du facteur de catégories et la remise à zéro
 * globale l'importent — aucun câblage, aucune instance.
 *
 * Le contrat client est PAR CATÉGORIE : `use-socket-cache-sync` invalide
 * `queryKeys.preferences.category(data.category)`. Une remise à zéro globale
 * émet donc une fois par catégorie effacée plutôt qu'un événement « tout » que
 * le client laisserait tomber (il ne discrimine que sur `conversationId`,
 * `communityId` et `category`).
 */

import type { FastifyInstance } from 'fastify';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { broadcastToUser } from '../../utils/socket-broadcast';

export type PreferenceCategory =
  | 'privacy'
  | 'audio'
  | 'message'
  | 'notification'
  | 'video'
  | 'document'
  | 'application';

/** Les sept catégories du modèle `UserPreferences`, dans l'ordre du schéma. */
export const PREFERENCE_CATEGORIES: readonly PreferenceCategory[] = [
  'privacy',
  'audio',
  'message',
  'notification',
  'video',
  'document',
  'application',
] as const;

/**
 * Annonce à tous les appareils de `userId` que la catégorie nommée a changé.
 *
 * Best-effort : `broadcastToUser` journalise et rend `false` quand la couche
 * Socket.IO n'est pas disponible — une écriture REST ne doit pas échouer pour
 * un canal latéral.
 */
export function emitPreferenceCategoryUpdated(
  fastify: FastifyInstance,
  userId: string,
  category: PreferenceCategory,
): void {
  broadcastToUser(fastify, userId, SERVER_EVENTS.USER_PREFERENCES_UPDATED, { userId, category });
}
