/**
 * Le câblage du relais de la vérification d'inactivité (#18738), sur le modèle de
 * `phoneReachability/phoneReachabilityDeps.ts` : le même cache, le même téléphone suivi et sa
 * connexion ; la dernière position par la loi de la carte des Sangs (#19202) et la dernière
 * batterie par la loi de la batterie (#14147), jugées lecteur par lecteur.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { INACTIVITY_ALERT_NOTIFICATION_TYPE, WELLNESS_CHECK_NOTIFICATION_TYPE } from '@meeshy/shared/types/inactivity-check';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { batteryRelayDepsOf, isTrackedBatteryDeviceConnected, trackedBatterySession } from '../battery/batteryDeps';
import { batteryLastReadingFor } from '../battery/batteryRelay';
import { bloodLocationDepsOf } from '../bloodLocation/bloodLocationDeps';
import { bloodLastPointFor } from '../bloodLocation/bloodLocationMap';
import { isTrackedPhone, retractPairNotifications } from '../phoneReachability/phoneReachabilityDeps';
import { inactivityPusherOf, wellnessAskerOf } from './inactivityPush';
import { refreshInactivityServedOf, type InactivityPair, type InactivityRelayDeps } from './inactivityRelay';

export function inactivityRelayDepsOf(params: { readonly prisma: PrismaClient; readonly io: ServerEmitIO | undefined }): InactivityRelayDeps {
  const battery = batteryRelayDepsOf(params);
  const location = bloodLocationDepsOf(params);
  const announcer = () => getSharedNotificationService() ?? null;
  const retractAlerts = (pairs: readonly InactivityPair[]) => retractPairNotifications(params.prisma, announcer(), INACTIVITY_ALERT_NOTIFICATION_TYPE, pairs);
  const retractWellness = (userId: string) => retractPairNotifications(params.prisma, announcer(), WELLNESS_CHECK_NOTIFICATION_TYPE, [{ emitterId: userId, readerId: userId }]);
  return {
    prisma: params.prisma,
    cache: battery.cache,
    io: params.io,
    now: () => Date.now(),
    isTrackedDevice: ({ userId, sessionId }) => isTrackedPhone(params.prisma, { userId, sessionId, now: new Date() }),
    trackedSession: (userId) => trackedBatterySession(params.prisma, { userId, now: new Date() }),
    trackedDeviceConnected: (userId) => isTrackedBatteryDeviceConnected({ prisma: params.prisma, io: params.io, userId, now: new Date() }),
    askWellness: wellnessAskerOf({ prisma: params.prisma, notifications: announcer(), replacePrevious: retractWellness }),
    retractWellness,
    push: inactivityPusherOf({ prisma: params.prisma, notifications: announcer(), replacePrevious: (pair) => retractAlerts([pair]) }),
    retractAlerts,
    lastPositionFor: async (emitterId, readerId) => {
      const point = await bloodLastPointFor(location, emitterId, readerId);
      return point ? { latitude: point.latitude, longitude: point.longitude, ...(point.accuracy === undefined ? {} : { accuracy: point.accuracy }), recordedAt: point.recordedAt } : null;
    },
    lastBatteryFor: (emitterId, readerId) => batteryLastReadingFor(battery, { readerId, emitterId }),
  };
}

/**
 * Un partage qui accompagne l'alerte vient de changer (fantôme ou consentement de position,
 * historique effacé, batterie coupée) : l'alerte en cours se re-juge chez chaque Sang. Best-effort,
 * jamais levant : la route qui l'appelle a déjà fait son travail.
 */
export async function refreshInactivityServedAfter(
  params: { readonly prisma: PrismaClient; readonly io: ServerEmitIO | undefined; readonly report: (error: unknown) => void },
  emitterId: string,
): Promise<void> {
  try {
    await refreshInactivityServedOf(inactivityRelayDepsOf(params), emitterId);
  } catch (error) {
    params.report(error);
  }
}
