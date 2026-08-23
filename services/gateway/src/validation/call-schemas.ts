/**
 * Call Validation Schemas - Zod validation for call-related inputs
 *
 * CVE-006 Fix: Comprehensive input validation to prevent injection attacks
 * and ensure data integrity for all call operations
 */

import { z } from 'zod';
import { isMsRangeOrdered, MS_RANGE_REFINEMENT } from '@meeshy/shared/utils/time-range';
import {
  callTypeEnum,
  CommonSchemas,
  type VCallType,
} from '@meeshy/shared/utils/validation';

/**
 * Validates MongoDB ObjectId format (24 hex characters)
 * Re-exported from shared CommonSchemas.mongoId
 */
const objectIdSchema = CommonSchemas.mongoId;

/**
 * Call type enum - re-exported from shared
 */
const callTypeSchema = callTypeEnum;

/**
 * Call settings schema
 */
const callSettingsSchema = z
  .object({
    audioEnabled: z.boolean().optional(),
    videoEnabled: z.boolean().optional(),
    screenShareEnabled: z.boolean().optional()
  })
  .optional();

/**
 * Join call settings schema
 */
const joinCallSettingsSchema = z
  .object({
    audioEnabled: z.boolean().optional(),
    videoEnabled: z.boolean().optional()
  })
  .optional();

/**
 * POST /api/calls - Initiate call
 */
export const initiateCallSchema = z.object({
  body: z.object({
    conversationId: objectIdSchema,
    type: callTypeSchema,
    settings: callSettingsSchema
  })
});

/**
 * GET /api/calls/:callId - Get call details
 */
export const getCallSchema = z.object({
  params: z.object({
    callId: objectIdSchema
  })
});

/**
 * DELETE /api/calls/:callId - End call
 */
export const endCallSchema = z.object({
  params: z.object({
    callId: objectIdSchema
  })
});

/**
 * POST /api/calls/:callId/participants - Join call
 */
export const joinCallSchema = z.object({
  params: z.object({
    callId: objectIdSchema
  }),
  body: z.object({
    settings: joinCallSettingsSchema
  }).optional()
});

/**
 * DELETE /api/calls/:callId/participants/:participantId - Leave call
 */
export const leaveCallSchema = z.object({
  params: z.object({
    callId: objectIdSchema,
    participantId: z.string().min(1, 'participantId is required')
  })
});

/**
 * GET /api/conversations/:conversationId/active-call
 */
export const getActiveCallSchema = z.object({
  params: z.object({
    conversationId: objectIdSchema
  })
});

/**
 * GET /api/calls/active - Get active call for user (crash recovery)
 * No params or query needed — uses authenticated userId
 */
export const getActiveCallForUserSchema = z.object({});

/**
 * GET /api/calls/history - Paginated call journal (query params)
 * Parsed in-handler (mirrors the feed route), so this is the query shape only.
 */
export const callHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(30),
  cursor: objectIdSchema.optional(),
  filter: z.enum(['all', 'missed']).default('all')
});
export type CallHistoryQueryInput = z.infer<typeof callHistoryQuerySchema>;

/**
 * Socket.IO Event: call:initiate
 */
export const socketInitiateCallSchema = z.object({
  conversationId: objectIdSchema,
  type: callTypeSchema,
  settings: callSettingsSchema
});

/**
 * Socket.IO Event: call:join
 */
export const socketJoinCallSchema = z.object({
  callId: objectIdSchema,
  settings: joinCallSettingsSchema
});

/**
 * Socket.IO Event: call:leave
 */
export const socketLeaveCallSchema = z.object({
  callId: objectIdSchema
});

/**
 * Socket.IO Event: call:signal
 *
 * Validates WebRTC signaling data with strict size limits
 */
/**
 * Champs communs aux deux formes de signal.
 *
 * Bounded (calling-stack audit 2026-08-15): `from`/`to` portent un userId
 * (24-char Mongo ObjectId en pratique, vérifié contre le `userId` authentifié
 * plus bas) — 128 est un plafond généreux qui ferme les deux seuls champs non
 * bornés de cette charge. La limite de trame de 1 Mo de Socket.IO est sinon le
 * seul plafond, ce qui laisse un client abusif mais dans les clous du
 * rate-limiter relayer des trames proches du mégaoctet 100×/10 s à travers
 * `io.to(targetSocketId).emit(...)`.
 *
 * §3.5 `negotiationId` — l'époque de négociation, déclarée pour que Zod ne la
 * retire pas de la charge relayée verbatim (le client récepteur s'en sert pour
 * écarter les offres/candidats périmés).
 */
const webRTCSignalBaseShape = {
  from: z.string().min(1, 'from field is required').max(128, 'from field exceeds maximum length'),
  to: z.string().min(1, 'to field is required').max(128, 'to field exceeds maximum length'),
  negotiationId: z.number().int().min(0).optional()
};

/**
 * Offer / answer / ice-restart — porte un SDP, obligatoirement.
 *
 * Structurellement validé : tout SDP WebRTC conforme à la RFC 4566 contient
 * « v=0 » (champ de version, toujours en tête) et au moins une ligne « m= »
 * (description de média). Une chaîne qui passe le plafond de 50 Ko sans ces
 * champs est soit malformée, soit une charge fabriquée pour le parseur SDP du
 * pair.
 */
const webRTCOfferAnswerSignalSchema = z.object({
  type: z.literal(['offer', 'answer', 'ice-restart']),
  ...webRTCSignalBaseShape,
  sdp: z.string()
    .min(1, 'SDP is required for offer/answer/ice-restart signals')
    .max(50000, 'SDP data exceeds maximum size of 50KB')
    .refine(
      (s) => s.includes('v=0') && s.includes('m='),
      'SDP must contain a version field (v=0) and at least one media line (m=) per RFC 4566'
    )
});

/**
 * Ice-candidate — porte un candidat, obligatoirement.
 *
 * Validé contre le format candidate-attribute de la RFC 8445. La chaîne VIDE
 * est acceptée : c'est le marqueur de fin de candidats (§8.2.1). Refuser les
 * chaînes non conformes évite de relayer au pair des charges fabriquées pour
 * son implémentation WebRTC.
 */
const webRTCIceCandidateSignalSchema = z.object({
  type: z.literal('ice-candidate'),
  ...webRTCSignalBaseShape,
  candidate: z.string()
    .max(1000, 'ICE candidate exceeds maximum size of 1KB')
    .refine(
      (s) => s === '' || /^candidate:\S+/i.test(s),
      'ICE candidate must start with "candidate:" (RFC 8445) or be empty (end-of-candidates marker)'
    ),
  sdpMLineIndex: z.number().optional(),
  // Borné pour la même raison que from/to — les vraies valeurs sont de courts
  // identifiants de flux média ("0", "audio", "video", "sdparta_0").
  sdpMid: z.string().max(256, 'sdpMid exceeds maximum length').optional()
});

/**
 * Socket.IO Event: call:signal
 *
 * **Une union DISCRIMINÉE, et non un objet plat gardé par un `.refine`**
 * (cycle 107). Les deux expriment exactement les mêmes contraintes à
 * l'exécution — le `.refine` qu'elle remplace exigeait déjà un `sdp` non vide
 * sur offer/answer/ice-restart et un `candidate` sur ice-candidate. Ce qui
 * change est le TYPE INFÉRÉ : `.refine` ne restreint pas `z.infer`, si bien que
 * `SocketSignalInput.signal` sortait PLAT — `type` en union des quatre valeurs,
 * `sdp` et `candidate` tous deux optionnels — alors que le contrat partagé
 * déclare `WebRTCSignal`, une vraie union discriminée où chaque membre exige
 * son champ.
 *
 * Tant que le relais émettait sur un `Server` non typé (le cast retiré au
 * cycle 107), l'écart ne se voyait pas. Il devenait, dès la porte posée, la
 * seule chose qui empêchait `validation.data` d'être émis tel quel — et le
 * corriger ICI plutôt qu'au site d'émission évite d'y écrire un cast, c'est-à-
 * dire de rouvrir la porte qu'on vient de fermer.
 *
 * Bénéfice de bord : Zod RETIRE désormais les champs de l'autre membre (un
 * `sdp` accroché à un `ice-candidate`, un `candidate` accroché à une offre) au
 * lieu de les relayer. Le relais dépend déjà de ce retrait pour sa sécurité —
 * il émet `validation.data`, jamais `data`, précisément pour qu'un client ne
 * puisse pas passer de champs arbitraires au pair.
 */
export const socketSignalSchema = z.object({
  callId: objectIdSchema,
  signal: z.discriminatedUnion('type', [
    webRTCOfferAnswerSignalSchema,
    webRTCIceCandidateSignalSchema
  ])
});

/**
 * Socket.IO Event: call:toggle-audio / call:toggle-video
 */
export const socketMediaToggleSchema = z.object({
  callId: objectIdSchema,
  enabled: z.boolean(),
  mediaType: z.enum(['audio', 'video']).optional(),
  participantId: z.string().optional()
});

/**
 * Socket.IO Event: call:end
 */
export const socketEndCallSchema = z.object({
  callId: objectIdSchema,
  // Whitelist: only lowercase letters and underscores. Prevents XSS payloads
  // from being stored in call session metadata if the client later renders the
  // raw reason string. The service maps it to a known CallEndReason enum anyway,
  // but the gate here stops malicious payloads from reaching the DB or logs.
  reason: z.string().max(50).regex(/^[a-z_]+$/, 'End reason must contain only lowercase letters and underscores').optional()
});

/**
 * Socket.IO Event: call:heartbeat (fire-and-forget)
 */
export const socketHeartbeatSchema = z.object({
  callId: objectIdSchema
});

/**
 * Socket.IO Event: call:quality-report (fire-and-forget)
 */
export const socketQualityReportSchema = z.object({
  callId: objectIdSchema,
  stats: z.object({
    level: z.enum(['excellent', 'good', 'fair', 'poor']).optional(),
    packetLoss: z.number().min(0).max(100),
    rtt: z.number().min(0),
    bitrate: z.object({
      audio: z.number().min(0),
      video: z.number().min(0)
    }).optional(),
    jitter: z.number().min(0).optional(),
    timestamp: z.iso.datetime().or(z.date()).optional(),
    // Cumulative WebRTC byte counters (monotonic). The last report before
    // teardown carries the call totals, persisted to surface "data spent".
    bytesSent: z.number().min(0).optional(),
    bytesReceived: z.number().min(0).optional(),
    // TWCC GCC bandwidth estimate (bps). 0 or absent = TWCC not yet active.
    availableOutgoingBitrateBps: z.number().min(0).optional()
  })
});

/**
 * Socket.IO Event: call:reconnecting (fire-and-forget)
 */
export const socketReconnectingSchema = z.object({
  callId: objectIdSchema,
  participantId: z.string().min(1),
  attempt: z.number().int().min(1).max(10)
});

/**
 * Socket.IO Event: call:reconnected (fire-and-forget)
 */
export const socketReconnectedSchema = z.object({
  callId: objectIdSchema,
  participantId: z.string().min(1)
});

/**
 * Socket.IO Event: call:force-leave
 */
export const socketForceLeaveSchema = z.object({
  conversationId: objectIdSchema
});

/**
 * Socket.IO Event: call:transcription-segment (fire-and-forget)
 */
/**
 * Socket.IO Event: call:transcription-active (fire-and-forget)
 * Signal de présence : le participant a activé/fermé son panneau de
 * transcription. L'identité de l'émetteur est estampillée côté serveur —
 * aucun champ speaker accepté du client.
 */
export const socketTranscriptionActiveSchema = z.object({
  callId: objectIdSchema,
  active: z.boolean()
});

export const socketTranscriptionSegmentSchema = z.object({
  callId: objectIdSchema,
  segment: z
    .object({
      id: z.string().min(1).max(64).optional(),
      text: z.string().min(1).max(5000),
      speakerId: z.string().min(1),
      startMs: z.number().min(0),
      endMs: z.number().min(0),
      isFinal: z.boolean(),
      confidence: z.number().min(0).max(1),
      language: z.string().min(2).max(10),
      capturedAtMs: z.number().int().min(0).optional()
    })
    // Un segment temporel ne peut PAS finir avant d'avoir commencé — même
    // classe de sanité numérique que `min(0)` sur les bornes. Bornes égales
    // (segment ponctuel) admises. Invariant partagé par tous les couples
    // `startMs/endMs`, déclaré une seule fois dans
    // `@meeshy/shared/utils/time-range` (itération 238, ex-miroir manuel de
    // `transcriptionSegmentSchema`, durci itération 234/236) : sans ce
    // `refine`, un `startMs=1500, endMs=500` traverse le gate et se PROPAGE —
    // ce chemin persiste le segment (`Transcription`), l'envoie au traducteur
    // (ZMQ) et le diffuse à TOUS les participants de l'appel, qui l'inscrivent
    // dans leur overlay de sous-titres puis dans le replay
    // `GET /calls/:callId/transcript`, sans indice d'origine.
    .refine(isMsRangeOrdered, MS_RANGE_REFINEMENT)
});

/**
 * Type exports for TypeScript
 */
export type InitiateCallInput = z.infer<typeof initiateCallSchema>;
export type GetCallInput = z.infer<typeof getCallSchema>;
export type EndCallInput = z.infer<typeof endCallSchema>;
export type JoinCallInput = z.infer<typeof joinCallSchema>;
export type LeaveCallInput = z.infer<typeof leaveCallSchema>;
export type GetActiveCallInput = z.infer<typeof getActiveCallSchema>;
export type GetActiveCallForUserInput = z.infer<typeof getActiveCallForUserSchema>;
export type SocketInitiateCallInput = z.infer<typeof socketInitiateCallSchema>;
export type SocketJoinCallInput = z.infer<typeof socketJoinCallSchema>;
export type SocketLeaveCallInput = z.infer<typeof socketLeaveCallSchema>;
export type SocketSignalInput = z.infer<typeof socketSignalSchema>;
export type SocketMediaToggleInput = z.infer<typeof socketMediaToggleSchema>;
export type SocketEndCallInput = z.infer<typeof socketEndCallSchema>;
export type SocketHeartbeatInput = z.infer<typeof socketHeartbeatSchema>;
export type SocketQualityReportInput = z.infer<typeof socketQualityReportSchema>;
export type SocketReconnectingInput = z.infer<typeof socketReconnectingSchema>;
export type SocketReconnectedInput = z.infer<typeof socketReconnectedSchema>;
export type SocketForceLeaveInput = z.infer<typeof socketForceLeaveSchema>;
export type SocketTranscriptionSegmentInput = z.infer<typeof socketTranscriptionSegmentSchema>;

/**
 * Socket.IO Event: call:request-ice-servers (fire-and-forget, Client → Server)
 * Sent by the client near credential expiry to obtain fresh TURN credentials.
 */
export const socketRequestIceServersSchema = z.object({
  callId: objectIdSchema,
});
export type SocketRequestIceServersInput = z.infer<typeof socketRequestIceServersSchema>;

/**
 * Socket.IO Event: call:backgrounded (fire-and-forget, Client → Server)
 * Emitted when the app enters background while a call is active so the gateway
 * can extend heartbeat tolerance and skip socket-delivery for ringing.
 */
export const socketCallBackgroundedSchema = z.object({
  callId: objectIdSchema,
  participantId: z.string().min(1),
});
export type SocketCallBackgroundedInput = z.infer<typeof socketCallBackgroundedSchema>;

/**
 * Socket.IO Event: call:foregrounded (fire-and-forget, Client → Server)
 * Emitted when the app returns to foreground so the gateway can reset heartbeat
 * tolerance and resume normal socket delivery for incoming calls.
 */
export const socketCallForegroundedSchema = z.object({
  callId: objectIdSchema,
  participantId: z.string().min(1),
});
export type SocketCallForegroundedInput = z.infer<typeof socketCallForegroundedSchema>;

/**
 * Socket.IO Event: call:screen-capture-detected (fire-and-forget, Client → Server)
 * Emitted when UIScreen.isCaptured changes so the gateway can alert other
 * participants via call:screen-capture-alert.
 */
export const socketCallScreenCaptureDetectedSchema = z.object({
  callId: objectIdSchema,
  participantId: z.string().min(1),
  isCapturing: z.boolean(),
});
export type SocketCallScreenCaptureDetectedInput = z.infer<typeof socketCallScreenCaptureDetectedSchema>;

/**
 * Socket.IO Event: call:analytics (fire-and-forget, Client → Server)
 * Emitted once at call end with lifecycle telemetry. Gateway logs and
 * optionally persists the payload for quality dashboards.
 */
export const socketCallAnalyticsSchema = z.object({
  callId: objectIdSchema,
  setupTimeMs: z.number().int(),
  // answer/join → connected : la négociation WebRTC seule, SANS le temps de
  // sonnerie humain que setupTimeMs inclut (23 s observés — métrique
  // inutilisable pour détecter une régression de setup). Optionnel : absent
  // des builds iOS < 2026-07-03 ; -1 = jamais connecté / ancrage manquant.
  negotiationTimeMs: z.number().int().optional(),
  durationSeconds: z.number().nonnegative(),
  reconnectionCount: z.number().int().nonnegative(),
  networkTransitions: z.number().int().nonnegative(),
  averageRtt: z.number().nonnegative(),
  averagePacketLoss: z.number().nonnegative(),
  maxPacketLoss: z.number().nonnegative(),
  codec: z.string().max(50),
  effectsUsed: z.array(z.string().max(50)).max(50),
  filtersUsed: z.boolean(),
  transcriptionUsed: z.boolean(),
  qualityDistribution: z.object({
    excellent: z.number().min(0).max(1),
    good: z.number().min(0).max(1),
    fair: z.number().min(0).max(1),
    poor: z.number().min(0).max(1),
  }),
  platform: z.string().max(50),
  deviceModel: z.string().max(100),
  isVideo: z.boolean(),
  endReason: z.string().max(50),
});
export type SocketCallAnalyticsInput = z.infer<typeof socketCallAnalyticsSchema>;
