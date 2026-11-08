import { CALL_SCREENSHOT_ALERT_TTL_MS, type CallScreenCaptureKind } from '@meeshy/shared/types/call-capture';
import { guardedTimeout } from '../utils/guarded-timer';
import { logger } from '../utils/logger';

/**
 * #16665 — rétrocompatibilité de `call:screen-capture-alert` (#9223, #9231).
 *
 * Une capture PONCTUELLE part `{ isCapturing: true, kind: 'screenshot' }` et
 * jamais suivie d'un `false`. Un client d'avant #16665 ignore `kind` et lit un
 * enregistrement d'écran COMMENCÉ, qu'aucune fin n'éteindrait : sa pastille
 * resterait allumée jusqu'à la fin de l'appel. La passerelle relaie donc, après
 * la durée de vie d'une capture ponctuelle, une fin synthétique — que les
 * clients récents ignorent (leur alerte de capture ponctuelle expire seule).
 *
 * Sauf si le même participant enregistre son écran à ce moment : chez un client
 * d'avant, ce `false` éteindrait une VRAIE alerte d'enregistrement.
 */
export type ScreenshotEndRelay = {
  readonly observe: (input: {
    readonly callId: string;
    readonly participantId: string;
    readonly kind: CallScreenCaptureKind;
    readonly isCapturing: boolean;
    readonly emitEnd: () => void;
  }) => void;
};

export function createScreenshotEndRelay(ttlMs: number = CALL_SCREENSHOT_ALERT_TTL_MS): ScreenshotEndRelay {
  const openRecordings = new Set<string>();
  return {
    observe: ({ callId, participantId, kind, isCapturing, emitEnd }) => {
      const key = `${callId}:${participantId}`;
      if (kind === 'recording') {
        if (isCapturing) openRecordings.add(key);
        else openRecordings.delete(key);
        return;
      }
      if (!isCapturing) return;
      guardedTimeout({
        name: 'call-screenshot-end',
        afterMs: ttlMs,
        logger,
        run: () => {
          if (openRecordings.has(key)) return;
          emitEnd();
        },
      }).unref();
    },
  };
}

/** Une instance par processus : l'état d'un participant suit l'appel, pas sa socket. */
export const screenshotEndRelay = createScreenshotEndRelay();
