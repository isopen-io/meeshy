/**
 * `e2ee:send-signal` (#13142) — le transport socket de la route unique des
 * signaux chiffrés. Même juge (`E2EESignalRelay`) que
 * `POST /e2ee/conversations/:id/signals` : un compte inscrit, la session (`sid`
 * vérifié du JWT) de l'appareil émetteur, une charge qui ne porte que des
 * enveloppes. L'accusé rend `signalId`, ou le refus et, pour Sesame, l'écart à
 * plat comme celui de `message:send`.
 */
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { containsPrivateKeyField, E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';
import { e2eeSignalSocketPayloadSchema, type E2EESignalAck } from '@meeshy/shared/types/e2ee-signals';
import { E2eeRelayRefusedError } from '../../services/e2ee/e2ee-relay-errors';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { createE2EESignalRelay, type E2EESignalRelay } from '../../services/e2ee/E2EESignalRelay';
import { wakeE2EEDevices } from '../../services/e2ee/e2ee-wake';
import { getSocketRateLimiter } from '../../utils/socket-rate-limiter';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { SOCKET_SESSION_ID } from '../disconnectSession';

const logger = enhancedLogger.child({ module: 'E2EESignalHandler' });

/** Ce que le transport sait de l'appelant : son compte (inscrit) et la session de sa socket. */
export type SignalCaller = { readonly userId: string; readonly isAnonymous: boolean } | null;

/** La même cadence que la route : 240 signaux par minute et par compte. */
export const E2EE_SIGNAL_SOCKET_RATE_LIMIT = { maxRequests: 240, windowMs: 60_000, keyPrefix: 'socket:e2ee:signal' } as const;

export type E2EESignalHandlerDeps = {
  readonly signals: E2EESignalRelay;
  readonly callerOf: (socketId: string) => SignalCaller;
  readonly withinRate?: (userId: string) => Promise<boolean>;
};

type SignalSocket = {
  readonly id: string;
  readonly data?: unknown;
  on(event: typeof CLIENT_EVENTS.E2EE_SEND_SIGNAL, listener: (data: unknown, ack?: (response: E2EESignalAck) => void) => void): unknown;
};

const refused = (error: string, code: string): E2EESignalAck => ({ success: false, error, code });

const sessionOf = (socket: SignalSocket): string | null => {
  const sessionId = (socket.data as Record<string, unknown> | undefined)?.[SOCKET_SESSION_ID];
  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null;
};

export async function handleE2EESignal(socket: SignalSocket, data: unknown, deps: E2EESignalHandlerDeps): Promise<E2EESignalAck> {
  const caller = deps.callerOf(socket.id);
  if (!caller || caller.isAnonymous) return refused('Un compte inscrit est requis', E2EE_ERROR_CODES.DEVICE_NOT_BOUND);
  if (deps.withinRate && !(await deps.withinRate(caller.userId))) {
    return refused('Trop de signaux chiffrés. Patientez avant de réessayer.', 'RATE_LIMIT_EXCEEDED');
  }
  if (containsPrivateKeyField(data)) return refused('Le serveur ne reçoit jamais de clé privée', E2EE_ERROR_CODES.ENVELOPES_INVALID);
  const payload = e2eeSignalSocketPayloadSchema.safeParse(data);
  if (!payload.success) return refused('Signal chiffré invalide', E2EE_ERROR_CODES.ENVELOPES_INVALID);
  const { conversationId, ...request } = payload.data;
  try {
    const relayed = await deps.signals.relay({ conversationId, senderUserId: caller.userId, sessionId: sessionOf(socket), request });
    return { success: true, data: relayed };
  } catch (error) {
    if (error instanceof E2eeRelayRefusedError) return { ...refused(error.message, error.code), ...(error.mismatch ?? {}) };
    logger.error('e2ee signal relay failed', { error });
    return refused('Erreur interne du relais chiffré', 'INTERNAL_ERROR');
  }
}

export function listenE2EESignals(socket: SignalSocket, deps: E2EESignalHandlerDeps): void {
  socket.on(CLIENT_EVENTS.E2EE_SEND_SIGNAL, (data, ack) => {
    handleE2EESignal(socket, data, deps)
      .then((response) => ack?.(response))
      .catch((error: unknown) => {
        logger.error('[E2EE_SEND_SIGNAL] Error:', error);
        ack?.(refused('Erreur interne du relais chiffré', 'INTERNAL_ERROR'));
      });
  });
}

/** Les dépendances de production : le relais, l'appelant résolu par la socket, la cadence partagée. */
export function e2eeSignalHandlerDeps(params: {
  readonly prisma: PrismaClient;
  readonly socketToUser: ReadonlyMap<string, string>;
  readonly connectedUsers: ReadonlyMap<string, { readonly isAnonymous: boolean }>;
}): E2EESignalHandlerDeps {
  const signals = createE2EESignalRelay({ prisma: params.prisma, wake: wakeE2EEDevices(params.prisma) });
  return {
    signals,
    callerOf: (socketId) => {
      const userId = params.socketToUser.get(socketId);
      const user = userId ? params.connectedUsers.get(userId) : undefined;
      return userId && user ? { userId, isAnonymous: user.isAnonymous } : null;
    },
    withinRate: (userId) => getSocketRateLimiter().checkLimit(userId, E2EE_SIGNAL_SOCKET_RATE_LIMIT),
  };
}
