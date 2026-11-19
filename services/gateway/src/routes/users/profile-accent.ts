import type { FastifyInstance } from 'fastify';
import type { UserUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import { logError } from '../../utils/logger';

/**
 * La couleur d'accent de la vitrine vient de changer (#19201) : elle part par `user:updated`,
 * l'événement de profil PUBLIC, vers les pairs, qui repeignent la fiche en cache. `null` = retour
 * à l'accent calculé. Les AUTRES appareils de la personne la reçoivent dans l'instantané propre de
 * `profile:updated` (`own-profile-sync.ts`, #18924) — jamais par `user:updated` sur sa room : deux
 * audiences, deux charges. Signal temps réel seul, jamais une ligne `Notification` ; un échec
 * n'annule pas l'écriture déjà faite.
 */
export function announceProfileAccentToPartners(
  fastify: FastifyInstance,
  userId: string,
  profileAccentColor: string | null,
): void {
  const changes: UserUpdatedEventData['changes'] = { profileAccentColor };
  fastify.notificationService?.emitUserUpdated({ userId, changes })
    .catch((err: unknown) => logError(fastify.log, '[PROFILE_UPDATE] accent emitUserUpdated failed', err));
}
