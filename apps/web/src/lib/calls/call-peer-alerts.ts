import { screenCaptureKindOf, type CallScreenCaptureKind } from '@meeshy/shared/types/call-capture';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { CallMember } from './call-store';

/**
 * **CE QUE LA PASSERELLE DIT D'UN PAIR** (#8047) — `call:quality-alert`
 * (`CallQualityAlertEvent` : son lien reste dégradé deux rapports de suite) et
 * `call:screen-capture-alert` (`CallScreenCaptureEvent` : il capture l'écran de
 * l'appel, iOS le détecte), décodés contre leurs contrats et rendus en retouche
 * du membre. L'alerte de qualité s'éteint seule : la passerelle la redit à
 * chaque rapport dégradé tant que le lien reste mauvais
 * (`CallEventsHandler.ts`, « 15 s auto-clear »).
 *
 * #16665 — la capture porte sa sorte (`kind`, absent ⇒ `recording`). Une
 * capture PONCTUELLE (`screenshot`) n'a pas de fin : sa puce s'éteint seule.
 * Chaque DÉBUT de capture entre au journal de l'appel (`capture`). La fin
 * d'une capture ponctuelle que la passerelle relaie pour les clients d'avant
 * est ignorée : elle éteindrait un enregistrement en cours.
 */

export const QUALITY_ALERT_TTL_MS = 15_000;

export const SCREENSHOT_ALERT_TTL_MS = 5_000;

type AlertPatch = Partial<Pick<CallMember, 'weakNetwork' | 'capturing'>>;

export type PeerAlert = {
  readonly callId: string;
  readonly userId: string;
  readonly patch: AlertPatch;
  readonly clearAfterMs: number | null;
  /** Ce que la minuterie remet à son terme. */
  readonly reset: AlertPatch;
  /** La sorte d'une capture qui COMMENCE, à inscrire au journal ; `null` sinon. */
  readonly capture: CallScreenCaptureKind | null;
  /** Un enregistrement d'écran qui commence (`true`) ou finit (`false`) ; `null` hors enregistrement. */
  readonly recording: boolean | null;
};

type Json = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const METRICS: ReadonlySet<unknown> = new Set(['rtt', 'packetLoss', 'bitrate', 'jitter']);

function captureAlert(callId: string, userId: string, payload: Json): PeerAlert | null {
  if (typeof payload.isCapturing !== 'boolean') return null;
  const kind = screenCaptureKindOf(payload.kind);
  const starts = payload.isCapturing;
  if (!starts && kind === 'screenshot') return null;
  return {
    callId,
    userId,
    patch: { capturing: starts },
    clearAfterMs: starts && kind === 'screenshot' ? SCREENSHOT_ALERT_TTL_MS : null,
    reset: { capturing: false },
    capture: starts ? kind : null,
    recording: kind === 'recording' ? starts : null,
  };
}

export function peerAlert(event: string, payload: unknown, resolve: (userId: string | null, participantId: string | null) => string | null): PeerAlert | null {
  if (!isRecord(payload)) return null;
  const callId = str(payload.callId);
  const userId = resolve(str(payload.userId), str(payload.participantId));
  if (callId === null || userId === null) return null;
  if (event === SERVER_EVENTS.CALL_QUALITY_ALERT) return METRICS.has(payload.metric) ? { callId, userId, patch: { weakNetwork: true }, clearAfterMs: QUALITY_ALERT_TTL_MS, reset: { weakNetwork: false }, capture: null, recording: null } : null;
  if (event === SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT) return captureAlert(callId, userId, payload);
  return null;
}
