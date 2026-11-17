/**
 * Le relais de la confirmation d'un appareil et ses annonces, UNE instance par processus
 * (#19156) : les routes REST, la socket et l'enrôlement comptent dans les MÊMES fenêtres —
 * Redis quand il est là (`getCacheStore().getNativeClient()`), sinon la mémoire du processus,
 * partagée par les trois chemins.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { getCacheStore } from '../CacheStore';
import { getPushNotificationService } from '../PushNotificationService';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { deviceRoomOf } from './device-room';
import { currentE2EEIO } from './envelope-delivery';
import { createE2EEDeviceVerificationRelay, type E2EEDeviceVerificationRelay, type VerificationDelivery } from './E2EEDeviceVerificationRelay';
import { createOwnDeviceAnnouncements, type OwnDeviceAnnouncements } from './own-device-announcements';
import { createSlidingWindow } from './sliding-window';

const logger = enhancedLogger.child({ module: 'E2EEDeviceTrustRuntime' });

export type DeviceTrustRuntime = {
  readonly relay: E2EEDeviceVerificationRelay;
  readonly announcements: OwnDeviceAnnouncements;
};

/** La distribution en temps réel : `e2ee:verification` vers la room de la GÉNÉRATION destinataire. */
export function deliverVerifications(deliveries: readonly VerificationDelivery[]): void {
  const io = currentE2EEIO();
  if (!io) return;
  deliveries.forEach(({ recipient, served }) => io.to(deviceRoomOf(recipient)).emit(SERVER_EVENTS.E2EE_VERIFICATION, served));
}

let shared: DeviceTrustRuntime | null = null;

export function deviceTrustRuntime(prisma: PrismaClient): DeviceTrustRuntime {
  if (shared) return shared;
  const counters = createSlidingWindow(getCacheStore().getNativeClient());
  const announcements = createOwnDeviceAnnouncements({
    prisma,
    counters,
    // Le fournisseur (APNs, FCM) ne retient jamais la réponse d'un enrôlement ni d'un dépôt : le push part détaché.
    push: async ({ userId, payload }) => {
      getPushNotificationService(prisma)
        .sendToUser({ userId, payload })
        .catch((error: unknown) => logger.warn('e2ee device verification push failed', { error }));
    },
  });
  const relay = createE2EEDeviceVerificationRelay({
    prisma,
    counters,
    deliver: deliverVerifications,
    onRequest: (sender) => announcements.requested(sender),
  });
  shared = { relay, announcements };
  return shared;
}
