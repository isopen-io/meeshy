/**
 * Le câblage du relais « en appel » (#18753) : le cache, le contexte « en conversation » et le
 * téléphone suivi de la batterie — c'est le MÊME téléphone.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { isViewingConversation } from '../../socketio/conversationViewingProbe';
import { batteryContextReaderOf } from '../battery/batteryContext';
import { batteryRelayDepsOf } from '../battery/batteryDeps';
import { isTrackedPhone } from '../phoneReachability/phoneReachabilityDeps';
import type { PhoneCallRelayDeps } from './phoneCallRelay';

export function phoneCallRelayDepsOf(params: { readonly prisma: PrismaClient; readonly io: ServerEmitIO | undefined }): PhoneCallRelayDeps {
  return {
    prisma: params.prisma,
    cache: batteryRelayDepsOf(params).cache,
    io: params.io,
    now: () => Date.now(),
    context: batteryContextReaderOf({ prisma: params.prisma, isViewing: isViewingConversation }),
    isTrackedDevice: ({ userId, sessionId }) => isTrackedPhone(params.prisma, { userId, sessionId, now: new Date() }),
  };
}
