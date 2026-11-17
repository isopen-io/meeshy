import type { FastifyInstance } from 'fastify';
import { SERVER_EVENTS, type UserUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import { broadcastToUser } from '../../utils/socket-broadcast';
import { logError } from '../../utils/logger';

/**
 * La couleur d'accent de la vitrine vient de changer (#19201) : elle part par `user:updated`,
 * l'événement de profil existant, vers les pairs (qui repeignent la fiche en cache) ET vers les
 * autres appareils de la personne (qui repeignent sa propre vitrine). `null` = retour à l'accent
 * calculé. Signal temps réel seul, jamais une ligne `Notification` ; un échec n'annule pas
 * l'écriture déjà faite.
 */
export function announceProfileAccentChange(
  fastify: FastifyInstance,
  userId: string,
  profileAccentColor: string | null,
): void {
  const changes: UserUpdatedEventData['changes'] = { profileAccentColor };
  fastify.notificationService?.emitUserUpdated({ userId, changes })
    .catch((err: unknown) => logError(fastify.log, '[PROFILE_UPDATE] accent emitUserUpdated failed', err));
  broadcastToUser(fastify, userId, SERVER_EVENTS.USER_UPDATED, { userId, changes });
}
