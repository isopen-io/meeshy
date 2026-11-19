/**
 * Le câblage du relais de la chute (#18748), sur le modèle de `inactivityCheck/inactivityDeps.ts` :
 * le même cache, la dernière position par la loi de la carte des Sangs (#19202) et la dernière
 * batterie par la loi de la batterie (#14147), jugées lecteur par lecteur ; le push part SEUL, par
 * le service de push, sans ligne `Notification`.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { getPushNotificationService } from '../PushNotificationService';
import { batteryRelayDepsOf } from '../battery/batteryDeps';
import { batteryLastReadingFor } from '../battery/batteryRelay';
import { bloodLocationDepsOf } from '../bloodLocation/bloodLocationDeps';
import { bloodLastPointFor } from '../bloodLocation/bloodLocationMap';
import { fallPusherOf } from './fallPush';
import { refreshFallServedOf, type FallRelayDeps } from './fallRelay';

export function fallRelayDepsOf(params: { readonly prisma: PrismaClient; readonly io: ServerEmitIO | undefined }): FallRelayDeps {
  const battery = batteryRelayDepsOf(params);
  const location = bloodLocationDepsOf(params);
  return {
    prisma: params.prisma,
    cache: battery.cache,
    io: params.io,
    now: () => Date.now(),
    push: fallPusherOf({ prisma: params.prisma, send: (options) => getPushNotificationService(params.prisma).sendToUser(options) }),
    lastPositionFor: async (emitterId, readerId) => {
      const point = await bloodLastPointFor(location, emitterId, readerId);
      return point ? { latitude: point.latitude, longitude: point.longitude, ...(point.accuracy === undefined ? {} : { accuracy: point.accuracy }), recordedAt: point.recordedAt } : null;
    },
    lastBatteryFor: (emitterId, readerId) => batteryLastReadingFor(battery, { readerId, emitterId }),
  };
}

/** Un partage qui accompagne l'alerte vient de changer : l'épisode en cours se re-juge. Best-effort, jamais levant. */
export async function refreshFallServedAfter(
  params: { readonly prisma: PrismaClient; readonly io: ServerEmitIO | undefined; readonly report: (error: unknown) => void },
  emitterId: string,
): Promise<void> {
  try {
    await refreshFallServedOf(fallRelayDepsOf(params), emitterId);
  } catch (error) {
    params.report(error);
  }
}
