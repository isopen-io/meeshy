/**
 * Le refus d'un envoi libsignal, porté jusqu'au transport. Son `code` est
 * stable (`E2EE_ERROR_CODES`), son `status` est celui que REST sert, et le
 * refus Sesame porte en plus l'écart à résoudre (`mismatch`).
 */
import {
  E2EE_CLIENT_OUTDATED_MESSAGE,
  E2EE_ERROR_CODES,
  type E2EEDevicesMismatch,
  type E2EEErrorCode,
} from '@meeshy/shared/types/e2ee-directory';

export class E2eeRelayRefusedError extends Error {
  constructor(
    readonly code: E2EEErrorCode,
    readonly status: 400 | 403 | 409,
    message: string,
    readonly mismatch?: E2EEDevicesMismatch,
  ) {
    super(message);
    this.name = 'E2eeRelayRefusedError';
  }
}

export const isE2eeRelayRefusal = (error: unknown): error is E2eeRelayRefusedError => error instanceof E2eeRelayRefusedError;

/** Un client qui envoie dans une conversation chiffrée sans parler libsignal (#9223). */
export const clientOutdated = (): E2eeRelayRefusedError =>
  new E2eeRelayRefusedError(E2EE_ERROR_CODES.CLIENT_OUTDATED, 400, E2EE_CLIENT_OUTDATED_MESSAGE);

/** Le statut REST d'un code du relais ; `undefined` pour un code qui n'en est pas un. */
export function relayRefusalStatus(code: string | undefined): 400 | 403 | 409 | undefined {
  switch (code) {
    case E2EE_ERROR_CODES.DEVICES_MISMATCH:
    case E2EE_ERROR_CODES.REGIME_CHANGED:
      return 409;
    case E2EE_ERROR_CODES.DEVICE_NOT_BOUND:
      return 403;
    case E2EE_ERROR_CODES.CLIENT_OUTDATED:
    case E2EE_ERROR_CODES.ENVELOPES_INVALID:
      return 400;
    default:
      return undefined;
  }
}
