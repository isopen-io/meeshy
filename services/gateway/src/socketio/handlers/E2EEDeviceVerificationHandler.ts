/**
 * `e2ee:send-verification` (#19156) — le transport socket du relais de la confirmation d'un
 * appareil par code. Même juge (`E2EEDeviceVerificationRelay`) que
 * `POST /e2ee/devices/self/verifications` : un compte inscrit, la session (`sid` vérifié du
 * JWT) de l'appareil émetteur, une charge stricte. L'accusé rend `{ ids, recipients }`, ou le
 * refus et son code.
 */
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { DEVICE_VERIFICATION_ERROR_CODES, type DeviceVerificationSendAck } from '@meeshy/shared/types/e2ee-device-trust';
import { E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';
import { DeviceVerificationRefusedError, type E2EEDeviceVerificationRelay } from '../../services/e2ee/E2EEDeviceVerificationRelay';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { SOCKET_SESSION_ID } from '../disconnectSession';

const logger = enhancedLogger.child({ module: 'E2EEDeviceVerificationHandler' });

/** Ce que le transport sait de l'appelant : son compte (inscrit ou non). */
export type VerificationSocketCaller = { readonly userId: string; readonly isAnonymous: boolean } | null;

/**
 * La cadence de la socket, par compte, AVANT toute lecture de l'annuaire : les débits par
 * génération du relais (4 demandes, 30 messages par heure) bornent ce qui est déposé, celui-ci
 * borne ce qui est seulement tenté.
 */
export const E2EE_VERIFICATION_SOCKET_RATE_LIMIT = { maxRequests: 60, windowMs: 60_000, keyPrefix: 'socket:e2ee:verification' } as const;

export type E2EEDeviceVerificationHandlerDeps = {
  readonly relay: Pick<E2EEDeviceVerificationRelay, 'send'>;
  readonly callerOf: (socketId: string) => VerificationSocketCaller;
  readonly withinRate?: (userId: string) => Promise<boolean>;
};

type VerificationSocket = {
  readonly id: string;
  readonly data?: unknown;
  on(event: typeof CLIENT_EVENTS.E2EE_SEND_VERIFICATION, listener: (data: unknown, ack?: (response: DeviceVerificationSendAck) => void) => void): unknown;
};

const INTERNAL_ERROR = 'INTERNAL_ERROR';

const refused = (error: string, code: string): DeviceVerificationSendAck => ({ success: false, error, code });

const sessionOf = (socket: VerificationSocket): string | null => {
  const sessionId = (socket.data as Record<string, unknown> | undefined)?.[SOCKET_SESSION_ID];
  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null;
};

export async function handleE2EEDeviceVerification(
  socket: VerificationSocket,
  data: unknown,
  deps: E2EEDeviceVerificationHandlerDeps,
): Promise<DeviceVerificationSendAck> {
  const caller = deps.callerOf(socket.id);
  const sessionId = sessionOf(socket);
  if (!caller || caller.isAnonymous || !sessionId) return refused('Un compte inscrit et une session d’appareil sont requis', E2EE_ERROR_CODES.DEVICE_NOT_BOUND);
  if (deps.withinRate && !(await deps.withinRate(caller.userId))) {
    return refused('Trop de messages de comparaison. Patientez avant de réessayer.', DEVICE_VERIFICATION_ERROR_CODES.RATE_LIMITED);
  }
  try {
    return { success: true, data: await deps.relay.send({ caller: { userId: caller.userId, sessionId }, payload: data }) };
  } catch (error) {
    if (error instanceof DeviceVerificationRefusedError) return refused(error.message, error.code);
    logger.error('e2ee device verification relay failed', { error });
    return refused('Erreur interne du relais de confirmation', INTERNAL_ERROR);
  }
}

export function listenE2EEDeviceVerifications(socket: VerificationSocket, deps: E2EEDeviceVerificationHandlerDeps): void {
  socket.on(CLIENT_EVENTS.E2EE_SEND_VERIFICATION, (data, ack) => {
    handleE2EEDeviceVerification(socket, data, deps)
      .then((response) => ack?.(response))
      .catch((error: unknown) => {
        logger.error('[E2EE_SEND_VERIFICATION] Error:', error);
        ack?.(refused('Erreur interne du relais de confirmation', INTERNAL_ERROR));
      });
  });
}
