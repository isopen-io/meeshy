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
 */

export const QUALITY_ALERT_TTL_MS = 15_000;

export type PeerAlert = {
  readonly callId: string;
  readonly userId: string;
  readonly patch: Partial<Pick<CallMember, 'weakNetwork' | 'capturing'>>;
  readonly clearAfterMs: number | null;
};

type Json = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const METRICS: ReadonlySet<unknown> = new Set(['rtt', 'packetLoss', 'bitrate', 'jitter']);

export function peerAlert(event: string, payload: unknown, resolve: (userId: string | null, participantId: string | null) => string | null): PeerAlert | null {
  if (!isRecord(payload)) return null;
  const callId = str(payload.callId);
  const userId = resolve(str(payload.userId), str(payload.participantId));
  if (callId === null || userId === null) return null;
  if (event === SERVER_EVENTS.CALL_QUALITY_ALERT) return METRICS.has(payload.metric) ? { callId, userId, patch: { weakNetwork: true }, clearAfterMs: QUALITY_ALERT_TTL_MS } : null;
  if (event === SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT) return typeof payload.isCapturing === 'boolean' ? { callId, userId, patch: { capturing: payload.isCapturing }, clearAfterMs: null } : null;
  return null;
}
