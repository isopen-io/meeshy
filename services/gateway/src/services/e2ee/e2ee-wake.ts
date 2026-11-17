/**
 * Le réveil d'un signal chiffré (#13142) : un push SILENCIEUX, le même pour tout
 * signal (`E2EE_WAKE_PUSH_TYPE`), vers les seuls appareils qui parlent libsignal
 * (iOS). Il ne nomme ni le signal, ni la conversation, ni l'expéditeur : l'appareil
 * réveillé relit ses enveloppes (`GET /e2ee/envelopes`). Un réveil perdu ne perd
 * rien, l'enveloppe attend sur le serveur.
 *
 * Il ne part que vers le jeton APNs : le jeton VoIP (PushKit) oblige l'iPhone à déclarer un appel, donc à
 * laisser un « appel manqué » sans nom dans l'historique à chaque signal (#18910).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getPushNotificationService } from '../PushNotificationService';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { E2EE_WAKE_PUSH_TYPE } from './E2EESignalRelay';

const logger = enhancedLogger.child({ module: 'E2EEWake' });

export const wakeE2EEDevices = (prisma: PrismaClient) => async (userIds: readonly string[]): Promise<void> => {
  const push = getPushNotificationService(prisma);
  await Promise.all(
    userIds.map((userId) =>
      push
        .sendToUser({ userId, platforms: ['ios'], types: ['apns'], payload: { title: '', body: '', silent: true, data: { type: E2EE_WAKE_PUSH_TYPE } } })
        .catch((error: unknown) => logger.warn('e2ee wake push failed', { error })),
    ),
  );
};
