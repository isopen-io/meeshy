/**
 * Les canaux socket d'un APPAREIL chiffré, branchés d'un geste par le gestionnaire de
 * connexion : les signaux d'une conversation e2ee (`e2ee:send-signal`, #13142) et le relais
 * de la confirmation d'un appareil par code (`e2ee:send-verification`, #19156). Un seul site
 * d'appel dans `MeeshySocketIOManager`, qui ne grossit plus à chaque canal.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { deviceTrustRuntime } from '../../services/e2ee/device-trust-runtime';
import { e2eeSignalHandlerDeps, listenE2EESignals } from './E2EESignalHandler';
import { E2EE_VERIFICATION_SOCKET_RATE_LIMIT, listenE2EEDeviceVerifications } from './E2EEDeviceVerificationHandler';
import { getSocketRateLimiter } from '../../utils/socket-rate-limiter';

type ChannelSocket = Parameters<typeof listenE2EESignals>[0] & Parameters<typeof listenE2EEDeviceVerifications>[0];

export function listenE2EEDeviceChannels(
  socket: ChannelSocket,
  params: {
    readonly prisma: PrismaClient;
    readonly socketToUser: ReadonlyMap<string, string>;
    readonly connectedUsers: ReadonlyMap<string, { readonly isAnonymous: boolean }>;
  },
): void {
  listenE2EESignals(socket, e2eeSignalHandlerDeps(params));
  listenE2EEDeviceVerifications(socket, {
    // Résolu au premier message seulement : une connexion ne construit ni magasin de compteurs ni relais.
    relay: { send: (input) => deviceTrustRuntime(params.prisma).relay.send(input) },
    callerOf: (socketId) => {
      const userId = params.socketToUser.get(socketId);
      const user = userId ? params.connectedUsers.get(userId) : undefined;
      return userId && user ? { userId, isAnonymous: user.isAnonymous } : null;
    },
    withinRate: (userId) => getSocketRateLimiter().checkLimit(userId, E2EE_VERIFICATION_SOCKET_RATE_LIMIT),
  });
}
