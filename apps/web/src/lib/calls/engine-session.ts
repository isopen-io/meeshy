import { createTelemetry, type Telemetry } from './call-analytics';
import type { CaptionsPort } from './call-captions-controller';
import type { QualityLoop } from './call-quality-loop';
import type { ActiveCall } from './call-store';
import type { StartCallRequest } from './engine';
import type { PeerLink } from './peer-link';

/**
 * **L'ÉTAT D'UN APPEL DANS LE MOTEUR** (#6382) — ce que `engine.ts` tient pour
 * l'appel en cours (liens, minuteries, télémétrie) et l'appel tel que l'écran
 * le lit à sa naissance. Sorti du moteur pour le garder sous son budget.
 */

export type Session = {
  iceServers: readonly RTCIceServer[];
  links: Map<string, PeerLink>;
  participantIds: Map<string, string>;
  ringTimer: unknown;
  heartbeat: unknown;
  qualityTimer: unknown;
  lastQualityReport: number;
  retry: StartCallRequest | null;
  cameraBeforeShare: boolean;
  loop: QualityLoop | null;
  telemetry: Telemetry;
  alertTimers: Map<string, unknown>;
  unwatchNetwork: (() => void) | null;
  /** L'appel a souffert (qualité mauvaise ou reprise) : sa note est toujours demandée (#8072). */
  troubled: boolean;
  captions: CaptionsPort | null;
  /** Le micro coupé pendant que l'appel sortant SONNE (#8480) : il se rouvre à la connexion. */
  mutedWhileRinging: boolean;
};

export const emptySession = (): Session => ({
  iceServers: [],
  links: new Map(),
  participantIds: new Map(),
  ringTimer: null,
  heartbeat: null,
  qualityTimer: null,
  lastQualityReport: 0,
  retry: null,
  cameraBeforeShare: false,
  loop: null,
  telemetry: createTelemetry(0),
  alertTimers: new Map(),
  unwatchNetwork: null,
  troubled: false,
  captions: null,
  mutedWhileRinging: false,
});

export function baseCall(request: StartCallRequest, direction: ActiveCall['direction'], phase: ActiveCall['phase']): ActiveCall {
  return {
    callId: null,
    conversationId: request.conversationId,
    media: request.media,
    direction,
    isGroup: request.isGroup,
    title: request.title,
    avatar: request.avatar,
    callerName: null,
    initiatorId: null,
    invitedBy: null,
    phase,
    connectedAt: null,
    endedDurationSec: null,
    micMuted: false,
    cameraOn: request.media === 'video',
    facing: 'user',
    screenSharing: false,
    members: {},
    display: 'full',
    localStream: null,
    remoteStreams: {},
    captions: [],
    captionsMode: 'off',
    captionPeers: [],
    transcription: 'idle',
    quality: null,
    preview: null,
    previewed: false,
  };
}
