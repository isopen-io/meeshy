/**
 * VIDEO CALLS - Types TypeScript Partagés
 * @package @meeshy/shared
 *
 * Types partagés entre frontend, gateway et translator
 * pour la feature d'appels vidéo avec traduction automatique
 */

// ===== CALL MODES & STATUS =====

/**
 * Mode d'appel: P2P (2 participants) ou SFU (3+ participants)
 */
export type CallMode = 'p2p' | 'sfu';

/**
 * Statut du call — synced with Prisma CallStatus enum
 * @see schema.prisma CallStatus
 */
export type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'connecting'
  | 'active'
  | 'reconnecting'
  | 'ended'
  | 'missed'
  | 'rejected'
  | 'failed';

/**
 * Statuts TERMINAUX — un call dans l'un de ces états est résolu : aucun
 * chemin (leave, disconnect-grace, force-end) ne doit plus réécrire son
 * statut/endReason/duration ni re-poster de summary.
 * Mirror runtime : `TERMINAL_STATUSES` dans services/gateway CallService
 * (typée sur l'enum Prisma) — garder les deux listes synchronisées.
 */
export const CALL_TERMINAL_STATUSES: readonly CallStatus[] = [
  'ended',
  'missed',
  'rejected',
  'failed',
] as const;

/**
 * Raison de fin d'appel — synced with Prisma CallEndReason enum
 * @see schema.prisma CallEndReason
 */
export type CallEndReason =
  | 'completed'
  | 'missed'
  | 'rejected'
  | 'failed'
  | 'connectionLost'
  | 'heartbeatTimeout'
  | 'garbageCollected';

/**
 * Rôle du participant
 */
export type ParticipantRole = 'initiator' | 'participant';

/**
 * Source de transcription
 */
export type CallTranscriptionSource = 'client' | 'server';

// ===== CALL SESSION =====

/**
 * Session d'appel vidéo/audio
 * Aligné avec le modèle Prisma CallSession
 */
export interface CallSession {
  readonly id: string;                    // MongoDB ObjectId
  readonly conversationId: string;
  readonly mode: CallMode;
  readonly status: CallStatus;
  readonly initiatorId: string;
  readonly startedAt: Date;
  readonly answeredAt?: Date;
  readonly endedAt?: Date;
  readonly duration?: number;             // Secondes
  readonly participants: CallParticipant[];
  readonly endReason?: CallEndReason;
  readonly transcriptionEnabled?: boolean;
  readonly metadata?: CallMetadata;
}

/**
 * Métadonnées optionnelles d'un appel
 */
export interface CallMetadata {
  /**
   * Nature audio/vidéo de l'appel — la SEULE source REST fiable (`mode`
   * transporte l'architecture WebRTC p2p|sfu, jamais le type). Whitelisté par
   * `callSessionSchema` (gateway) ; posé côté serveur à l'initiation
   * (@see CallService.initiateCall). Ne JAMAIS dériver le type d'appel de
   * `participants[].isVideoEnabled` côté client — cet état média change
   * pendant l'appel (mute caméra) sans rapport avec la nature de l'appel.
   */
  readonly type?: 'audio' | 'video';
  readonly maxParticipants?: number;
  readonly recordingEnabled?: boolean;
  readonly screenShareEnabled?: boolean;
  readonly transcriptionEnabled?: boolean;
  readonly translationEnabled?: boolean;
}

// ===== CALL PARTICIPANT =====

/**
 * Participant dans un appel
 * Aligné avec le modèle Prisma CallParticipant
 */
export interface CallParticipant {
  readonly id: string;
  readonly callSessionId: string;
  readonly userId?: string;               // null pour anonymes
  readonly participantId?: string;
  readonly role: ParticipantRole;
  readonly joinedAt: Date;
  readonly leftAt?: Date;
  readonly isAudioEnabled: boolean;
  readonly isVideoEnabled: boolean;

  // Champs populés (non dans Prisma)
  readonly username?: string;
  readonly displayName?: string;
  readonly avatar?: string;
}

// La qualité de connexion d'un participant N'EST PAS un champ de cette entité :
// elle est ÉPHÉMÈRE et transite par `call:quality-report` (client → serveur) puis
// `call:quality-alert` (serveur → pairs), qui la portent déjà par participant.
// Les statistiques instantanées ont leur type dédié : `ConnectionQualityStats`
// plus bas — à ne pas confondre avec l'ancien `ConnectionQuality`, retiré le
// 2026-08-13 : il décrivait un champ Prisma que rien n'a jamais écrit.

// ===== CALL CONTROLS =====

/**
 * État des contrôles média
 */
export interface CallControls {
  readonly audioEnabled: boolean;
  readonly videoEnabled: boolean;
  readonly screenShareEnabled: boolean;
}

// ===== AUDIO EFFECTS =====

/**
 * Types d'effets audio disponibles
 */
export type AudioEffectType = 'voice-coder' | 'baby-voice' | 'demon-voice' | 'back-sound';

/**
 * Mode de loop pour le back sound
 */
export type LoopMode = 'N_TIMES' | 'N_MINUTES';

/**
 * Paramètres pour l'effet Voice Coder (auto-tune)
 */
export interface VoiceCoderParams {
  readonly pitch: number;           // -12 à +12 semitones (transpose)
  readonly harmonization: boolean;  // Ajouter harmonies
  readonly strength: number;        // 0-100%, intensité correction (mix)
  readonly retuneSpeed: number;     // 0-100%, vitesse de correction (0=lent/naturel, 100=rapide/robotique)
  readonly scale: 'chromatic' | 'major' | 'minor' | 'pentatonic'; // Gamme musicale
  readonly key: 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B'; // Tonalité
  readonly naturalVibrato: number;  // 0-100%, préservation du vibrato naturel
}

/**
 * Presets pour Perfect Voice
 */
export type VoiceCoderPreset =
  | 'voix-naturelle'
  | 'pop-star'
  | 'effet-robot'
  | 'correction-subtile'
  | 'custom';

/**
 * Paramètres pour l'effet Baby Voice
 */
export interface BabyVoiceParams {
  readonly pitch: number;           // +6 à +12 semitones
  readonly formant: number;         // 1.2-1.5x shift formantique
  readonly breathiness: number;     // 0-100%, ajout de souffle
}

/**
 * Paramètres pour l'effet Demon Voice
 */
export interface DemonVoiceParams {
  readonly pitch: number;           // -8 à -12 semitones
  readonly distortion: number;      // 0-100%, saturation
  readonly reverb: number;          // 0-100%, echo cathedral
}

/**
 * Paramètres pour l'effet Back Sound Code
 */
export interface BackSoundParams {
  readonly soundFile: string;       // Nom du fichier son
  readonly volume: number;          // 0-100%
  readonly loopMode: LoopMode;      // Mode de loop
  readonly loopValue: number;       // Nombre de fois ou minutes
}

/**
 * Union des paramètres d'effets audio
 */
export type AudioEffectParams =
  | VoiceCoderParams
  | BabyVoiceParams
  | DemonVoiceParams
  | BackSoundParams;

/**
 * Configuration d'un effet audio
 */
export interface AudioEffect {
  readonly type: AudioEffectType;
  readonly enabled: boolean;
  readonly params: AudioEffectParams;
}

/**
 * État des effets audio
 */
export interface AudioEffectsState {
  readonly voiceCoder: AudioEffect & { params: VoiceCoderParams };
  readonly babyVoice: AudioEffect & { params: BabyVoiceParams };
  readonly demonVoice: AudioEffect & { params: DemonVoiceParams };
  readonly backSound: AudioEffect & { params: BackSoundParams };
}

// ===== CONNECTION QUALITY =====

/**
 * Niveau de qualité de connexion
 */
export type ConnectionQualityLevel = 'excellent' | 'good' | 'fair' | 'poor';

/**
 * Statistiques de qualité de connexion en temps réel
 */
export interface ConnectionQualityStats {
  readonly level: ConnectionQualityLevel;
  readonly packetLoss: number;      // Pourcentage (0-100)
  readonly rtt: number;             // Round-trip time en ms
  readonly bitrate: {
    readonly audio: number;         // kbps
    readonly video: number;         // kbps
  };
  readonly jitter: number;          // ms
  readonly timestamp: Date;
  /**
   * Cumulative bytes sent/received on the peer connection since the call
   * started (WebRTC `outbound-rtp.bytesSent` / `inbound-rtp.bytesReceived`,
   * summed across audio+video). Optional and monotonic: the last report before
   * teardown carries the call totals, which the gateway persists on
   * `CallSession` to surface "data spent" in the call-summary message.
   */
  readonly bytesSent?: number;
  readonly bytesReceived?: number;
  /** TWCC GCC bandwidth estimate in bps. Present when Transport-CC is active. */
  readonly availableOutgoingBitrateBps?: number;
}

// ===== WEBRTC SIGNALING =====

/**
 * Base properties for all WebRTC signals
 */
interface WebRTCSignalBase {
  readonly from: string;                  // userId ou participantId
  readonly to: string;                    // userId ou participantId
  /**
   * Negotiation epoch (§3.5). Monotonic per peer connection; incremented on
   * every locally-initiated (re)negotiation. The receiver drops any SDP/ICE
   * whose `negotiationId` is older than the current one, so offers/candidates
   * left in flight by a churned socket become inert. Optional for backward
   * compatibility with older clients (absent ⇒ treated as epoch 0).
   */
  readonly negotiationId?: number;
}

/**
 * Types de signal SDP
 */
export type WebRTCSignalType = 'offer' | 'answer' | 'ice-restart';

/**
 * Signal WebRTC pour Offer/Answer/ICE-Restart (contient SDP)
 */
export interface WebRTCOfferAnswerSignal extends WebRTCSignalBase {
  readonly type: WebRTCSignalType;
  readonly sdp: string;                   // Session Description Protocol
}

/**
 * Signal WebRTC pour ICE Candidate
 */
export interface WebRTCIceCandidateSignal extends WebRTCSignalBase {
  readonly type: 'ice-candidate';
  readonly candidate: string;             // ICE candidate string
  readonly sdpMLineIndex?: number;        // Media line index
  readonly sdpMid?: string;               // Media stream ID
}

/**
 * Union type for all WebRTC signals
 */
export type WebRTCSignal = WebRTCOfferAnswerSignal | WebRTCIceCandidateSignal;

// ===== TRANSCRIPTION (Phase 2A/2B) =====

/**
 * Transcription d'audio en texte
 * Aligné avec le modèle Prisma Transcription
 */
export interface Transcription {
  readonly id: string;
  readonly callSessionId: string;
  readonly participantId: string;
  readonly source: CallTranscriptionSource;
  readonly text: string;
  readonly language: string;
  readonly confidence?: number;           // 0-1
  readonly timestamp: Date;
  readonly offsetMs?: number;             // Offset depuis début appel
}

// ===== TRANSLATION (Phase 3) =====

/**
 * Traduction d'une transcription
 * Aligné avec le modèle Prisma Translation
 */
export interface Translation {
  readonly id: string;
  readonly transcriptionId: string;
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly confidence?: number;           // 0-1
  readonly model?: string;                // ex: "gpt-4", "google-translate"
  readonly cached: boolean;
  readonly createdAt: Date;
}

// ===== API REQUEST/RESPONSE TYPES =====

/**
 * Requête pour initier un appel
 */
export interface InitiateCallRequest {
  readonly conversationId: string;
  readonly type: 'video' | 'audio';
  readonly settings?: {
    audioEnabled?: boolean;
    videoEnabled?: boolean;
    screenShareEnabled?: boolean;
  };
}

/**
 * Réponse d'initiation d'appel
 */
export interface InitiateCallResponse {
  readonly success: boolean;
  readonly data: CallSession;
}

/**
 * Requête pour rejoindre un appel
 */
export interface JoinCallRequest {
  readonly callId: string;
  readonly settings?: {
    audioEnabled?: boolean;
    videoEnabled?: boolean;
  };
}

/**
 * Réponse de join call
 */
export interface JoinCallResponse {
  readonly success: boolean;
  readonly data: {
    callSession: CallSession;
    iceServers: RTCIceServer[];
  };
}

// ===== SOCKET.IO EVENTS =====

/**
 * Event: call:initiate (Client → Server)
 */
export interface CallInitiateEvent {
  readonly conversationId: string;
  readonly type: 'video' | 'audio';
  readonly settings?: CallMetadata;
}

/**
 * Event: call:initiated (Server → Client)
 */
export interface CallInitiatedEvent {
  readonly callId: string;
  readonly conversationId: string;
  /** Architecture mode (`'p2p'` or `'sfu'`). NOT the media type — see `type`. */
  readonly mode: CallMode;
  /** Media type (`'audio'` or `'video'`). Drives CallKit `hasVideo` on iOS. */
  readonly type: 'audio' | 'video';
  readonly initiator: {
    readonly userId: string;
    readonly username: string;
    readonly displayName?: string;
    readonly avatar?: string;
  };
  readonly participants: CallParticipant[];
  /**
   * `'direct' | 'group'` (mirrors `Conversation.type`, restricted to the two
   * values `CallService.initiateCall` accepts). Optional — a rolling deploy
   * can put an older gateway build in front of a newer client, so clients
   * MUST fall back to today's single-caller presentation when absent, never
   * throw. Lets a callee's UI tell "Alice is calling you" (direct) apart
   * from "Alice is calling the Design Team" (group) without a separate
   * conversation lookup — see `CallHistoryItem.conversationType`
   * (`services/gateway/src/services/callHistory.ts`) for the same field on
   * the REST call-history contract.
   */
  readonly conversationType?: string;
  /**
   * Group display name — `null` for a direct call (no title exists) or an
   * untitled group. Mirrors `CallHistoryItem.conversationTitle`.
   */
  readonly conversationTitle?: string | null;
  /**
   * Les identifiants TURN/STUN du DESTINATAIRE de cette copie de l'événement.
   *
   * **Déclaré au cycle 107 ; il voyageait sans contrat depuis toujours.** Les
   * deux émetteurs de `call:initiated` l'attachent chacun par-dessus l'événement
   * de base (`{ ...event, iceServers }`), avec des identifiants calculés PAR
   * destinataire (`generateIceServers(memberId)`) — d'où l'attachement au moment
   * de l'émission plutôt que dans l'événement construit une fois pour tous.
   *
   * Le SDK iOS le décode (`CallOfferData.iceServers`) : c'est ce qui donne au
   * destinataire de quoi traverser un NAT dès la SONNERIE, sans attendre le
   * `call:ice-servers-refreshed` qui n'arrive qu'au renouvellement du TTL. Un
   * futur émetteur qui l'omettait ne cassait rien à la compilation et retirait
   * TURN à l'appelé — même famille que `_seq` et `location` (cycle 105) : un
   * champ que les clients lisent et qu'aucun contrat ne déclare ne tient qu'à la
   * lecture du code voisin.
   *
   * Optionnel, comme le décodeur iOS le suppose : un déploiement progressif peut
   * placer une passerelle plus ancienne devant un client plus récent.
   */
  readonly iceServers?: readonly RTCIceServer[];
}

/**
 * Event: call:join (Client → Server)
 */
export interface CallJoinEvent {
  readonly callId: string;
  readonly settings?: {
    audioEnabled?: boolean;
    videoEnabled?: boolean;
  };
}

/**
 * Event: call:participant-joined (Server → Client)
 */
export interface CallParticipantJoinedEvent {
  readonly callId: string;
  readonly participant: CallParticipant;
  readonly mode: CallMode;              // Peut changer (P2P→SFU)
  readonly iceServers?: RTCIceServer[]; // Pour le nouveau participant
}

/**
 * Event: call:participant-left (Server → Client)
 */
export interface CallParticipantLeftEvent {
  readonly callId: string;
  readonly participantId: string;         // Database participant ID
  readonly userId?: string;               // User ID (for removing WebRTC connections)
  readonly mode: CallMode;                // Peut changer (SFU→P2P)
}

/**
 * Event: call:signal (Client ↔ Server)
 */
export interface CallSignalEvent {
  readonly callId: string;
  readonly signal: WebRTCSignal;
}

/**
 * Event: call:ended (Server → Client)
 */
export interface CallEndedEvent {
  readonly callId: string;
  readonly duration: number;
  /**
   * userId ou participantId de qui a raccroché.
   *
   * **Optionnel depuis le cycle 107, parce que l'émetteur l'a toujours été.**
   * `broadcastCallEnded` déclare sa charge
   * `Omit<CallEndedEvent, 'endedBy'> & { endedBy?: string }` — un élargissement
   * DÉLIBÉRÉ : les fins d'appel d'origine serveur (ramassage de zombies,
   * expiration de heartbeat, arrêt gracieux) n'ont personne à nommer.
   *
   * Le contrat promettait pourtant une chaîne. L'écart ne se voyait pas tant que
   * la diffusion passait par un `Server` non typé ; la porte du cycle 107 l'a
   * fait tomber en une ligne. C'est la règle « un contrat doit porter autant
   * d'états que l'émetteur a de choses à dire » : ici l'émetteur a deux choses à
   * dire — « untel a raccroché » et « personne, c'est le serveur » — et le
   * contrat n'en portait qu'une.
   */
  readonly endedBy?: string;
  readonly reason: CallEndReason;
}

export interface CallTranslationRequestEvent {
  readonly callId: string
  readonly sourceLanguage?: string
  readonly disable?: boolean
}

export interface CallTranslationResponseEvent {
  readonly callId: string
  readonly accepted: boolean
}

export interface CallAudioChunkEvent {
  readonly callId: string
  readonly chunk: ArrayBuffer
  readonly chunkIndex: number
}

export interface CallQualityFeedbackEvent {
  readonly callId: string
  readonly rating: 1 | 2 | 3 | 4 | 5
  readonly issues?: readonly ('audio_quality' | 'video_quality' | 'dropped' | 'echo' | 'sync' | 'other')[]
  readonly comment?: string
}

export interface CallScreenCaptureEvent {
  readonly callId: string
  readonly participantId: string      // Database Participant ID (legacy)
  /**
   * The reporting participant's User ID — falls back to `participantId` for
   * an anonymous guest (no User row). Added Vague 132: a call-wide roster
   * entry's own identity (`CallParticipant.userId`, see
   * `toCallParticipantResponse`) is keyed by `userId`, never by
   * `participantId` alone for a registered user — without this field a
   * client resolving "who is this alert about" against its roster can never
   * match a registered peer.
   */
  readonly userId?: string
  readonly isCapturing: boolean
}

export interface CallTranslationRequestedEvent {
  readonly callId: string
  readonly requesterId: string
  readonly sourceLanguage?: string
}

export interface CallTranslationEnabledEvent {
  readonly callId: string
}

export interface CallTranscriptionResultEvent {
  readonly callId: string
  readonly text: string
  readonly language: string
  readonly confidence: number
}

export interface CallAlreadyAnsweredEvent {
  readonly callId: string
}

export interface CallQualityFeedback {
  readonly rating: 1 | 2 | 3 | 4 | 5
  readonly issues?: readonly ('audio_quality' | 'video_quality' | 'dropped' | 'echo' | 'sync' | 'other')[]
  readonly comment?: string
}

export interface CallAnalytics {
  readonly setupTimeMs: number
  /**
   * answer/join → connected : la négociation WebRTC seule, SANS le temps de
   * sonnerie humain inclus dans `setupTimeMs`. Optionnel (absent des builds
   * iOS < 2026-07-03) ; -1 = jamais connecté / ancrage manquant.
   */
  readonly negotiationTimeMs?: number
  readonly iceMethod: 'direct' | 'stun' | 'turn'
  readonly codec: { readonly audio: string; readonly video: string }
  readonly averageRtt: number
  readonly averagePacketLoss: number
  readonly maxPacketLoss: number
  readonly averageBitrate: { readonly audio: number; readonly video: number }
  readonly reconnectionCount: number
  readonly networkTransitions: number
  readonly effectsUsed: readonly AudioEffectType[]
  readonly filtersUsed: boolean
  readonly transcriptionEnabled: boolean
  readonly translationEnabled: boolean
  readonly qualityDistribution: { readonly excellent: number; readonly good: number; readonly fair: number; readonly poor: number }
  readonly platform: 'ios' | 'web'
  readonly deviceModel?: string
}

/**
 * Event: call:mode-changed (Server → Client)
 */
export interface CallModeChangedEvent {
  readonly callId: string;
  readonly oldMode: CallMode;
  readonly newMode: CallMode;
  readonly reason: string;
}

/**
 * Event: call:media-toggled (Server → Client)
 */
/**
 * Client → Server: `call:toggle-audio` / `call:toggle-video`.
 *
 * À ne pas confondre avec `CallMediaToggleEvent`, qui est la DIFFUSION
 * serveur→client du même geste. Le listener de la passerelle a déclaré le type
 * de diffusion pour ce qu'il RECEVAIT jusqu'au cycle 107, ce qui faisait trois
 * sources en désaccord :
 *
 * | source | forme | ack |
 * |---|---|---|
 * | `ClientToServerEvents` | `{ callId, enabled }` | REQUIS |
 * | le listener | `CallMediaToggleEvent` — `participantId`/`mediaType` REQUIS | aucun |
 * | `socketMediaToggleSchema` (Zod, autorité d'exécution) | `{ callId, enabled, mediaType?, participantId? }` | — |
 * | les trois clients, sur le fil | `{ callId, enabled }` | aucun |
 *
 * Ce type est réconcilié sur les deux seules sources qui décident vraiment :
 * ce que les clients ENVOIENT, et ce que Zod ACCEPTE.
 *
 * **`participantId` et `mediaType` sont OPTIONNELS et ne sont lus par personne.**
 * La passerelle résout le participant elle-même
 * (`resolveActiveCallParticipant`) et connaît le média par le NOM de
 * l'événement. Les déclarer requis était un piège armé, pas une panne : sous
 * `strict: false`, `data.participantId` se lit `string` non-optionnel là où le
 * fil ne porte jamais rien.
 *
 * **L'ack a été retiré** plutôt que rendu optionnel : aucun client ne l'envoie,
 * la passerelle ne l'appelle jamais. Un client écrit contre l'ancien contrat
 * l'aurait attendu indéfiniment — déclarer un ack qui n'existe pas est une
 * promesse, pas une tolérance.
 */
export interface CallMediaToggleClientEvent {
  readonly callId: string;
  readonly enabled: boolean;
  /** Toléré par le schéma, jamais lu : le NOM de l'événement porte le média. */
  readonly mediaType?: 'audio' | 'video';
  /** Toléré par le schéma, jamais lu : la passerelle résout le participant. */
  readonly participantId?: string;
}

export interface CallMediaToggleEvent {
  readonly callId: string;
  readonly participantId: string;      // Database Participant ID (legacy) — the FK
  // `CallParticipant.participantId`, NEVER the roster entry's own
  // `CallParticipant.id`. A client matching a roster entry by `.id` (the
  // primary key `call-store.ts`'s `updateParticipant` keys on) never finds
  // this value — only `.userId`/`.participantId` roster lookups do.
  /** See `CallScreenCaptureEvent.userId` — same rationale, added Vague 140. */
  readonly userId?: string;
  readonly mediaType: 'audio' | 'video';
  readonly enabled: boolean;
}

/**
 * Event: call:transcription (Client/Server → Server/Client)
 */
export interface CallTranscriptionEvent {
  readonly callId: string;
  readonly transcription: Transcription;
}

/**
 * Event: call:translation (Server → Client)
 */
export interface CallTranslationEvent {
  readonly callId: string;
  readonly translation: Translation;
}

// ===== NEW CALL EVENTS (Phase 1 Spec) =====

/**
 * Event: call:heartbeat (Client → Server, fire-and-forget)
 */
export interface CallHeartbeatEvent {
  readonly callId: string;
}

/**
 * Event: call:quality-report (Client → Server, fire-and-forget)
 */
export interface CallQualityReportEvent {
  readonly callId: string;
  readonly stats: ConnectionQualityStats;
}

/**
 * Event: call:reconnecting (Client → Server, fire-and-forget)
 */
export interface CallReconnectingEvent {
  readonly callId: string;
  readonly participantId: string;
  readonly attempt: number;
}

/**
 * Event: call:reconnected (Client → Server, fire-and-forget)
 */
export interface CallReconnectedEvent {
  readonly callId: string;
  readonly participantId: string;
}

/**
 * Event: call:missed (Server → Client)
 */
export interface CallMissedEvent {
  readonly callId: string;
  readonly conversationId: string;
  readonly callerId: string;
  readonly callerName: string;
}

/**
 * Event: call:quality-alert (Server → Client)
 */
export interface CallQualityAlertEvent {
  readonly callId: string;
  readonly participantId: string;     // Database Participant ID (legacy)
  /** See `CallScreenCaptureEvent.userId` — same rationale, added Vague 132. */
  readonly userId?: string;
  readonly metric: 'rtt' | 'packetLoss' | 'bitrate' | 'jitter';
  readonly value: number;
  readonly threshold: number;
}

/**
 * ACK pour call:initiate
 *
 * `iceServers` est inclus pour que l'initiateur configure son RTCPeerConnection
 * avec les TURN credentials AVANT de créer le SDP offer. Sans ça, l'offer
 * ne contient que des candidats STUN et la connexion échoue derrière NAT
 * symétrique.
 */
export interface CallInitiateAck {
  readonly success: boolean;
  readonly data?: { callId: string; mode: CallMode; iceServers: RTCIceServer[]; ttl?: number };
  readonly error?: { code: string; message: string };
}

/**
 * ACK pour call:join
 */
export interface CallJoinAck {
  readonly success: boolean;
  readonly data?: { callSession: CallSession; iceServers: RTCIceServer[] };
  /**
   * `endReason` is populated only when `code === 'CALL_ENDED'` — the real
   * reason the call already ended server-side (Prisma `CallSession.endReason`),
   * so a caller rejoining after a reconnect can distinguish a benign hangup
   * from a transient failure (`connectionLost`/`heartbeatTimeout`) instead of
   * assuming `completed`. @see CallService.joinCallAttempt
   */
  readonly error?: { code: string; message: string; endReason?: CallEndReason };
}

/**
 * Configuration ICE server (STUN/TURN)
 */
export interface RTCIceServerConfig {
  readonly urls: string[];
  readonly username?: string;
  readonly credential?: string;
}

// ===== CALL TRANSCRIPTION CAPABILITY NEGOTIATION =====

/**
 * Transcription capability level — higher is better.
 * During call setup, each peer declares its capability.
 * The most capable peer becomes the transcription leader.
 */
export type TranscriptionCapabilityLevel =
  | 'none'           // Device cannot transcribe (no Speech framework, old device)
  | 'basic'          // On-device, limited languages, older model
  | 'standard'       // On-device, SFSpeechRecognizer, good accuracy
  | 'advanced';      // On-device, SpeechAnalyzer (iOS 26+) or WhisperKit, best accuracy

/**
 * Event: call:transcription-capability (Client → Client via Server relay)
 * Each peer declares its transcription capability at call start.
 * Server relays to the other peer. Peers negotiate: best capability wins.
 */
export interface CallTranscriptionCapabilityEvent {
  readonly callId: string;
  readonly participantId: string;
  readonly capability: TranscriptionCapabilityLevel;
  readonly supportedLanguages: readonly string[];
  readonly onDeviceOnly: boolean;
}

/**
 * Event: call:transcription-role (Client → Client via Server relay)
 * After capability exchange, the leader announces its role.
 * Leader transcribes BOTH streams and shares segments to peer.
 */
export interface CallTranscriptionRoleEvent {
  readonly callId: string;
  readonly leaderId: string;
  readonly reason: 'higher-capability' | 'tie-initiator-wins' | 'only-one-capable';
}

// ===== CALL TRANSCRIPTION SEGMENT EVENTS =====

/**
 * Event: call:transcription-segment (Client → Server)
 * Real-time transcription segment from a call participant.
 *
 * `id` (UUID côté émetteur) et `capturedAtMs` (horloge murale de capture)
 * portent la journalisation `displayName (heure): message` : l'`id` est la clé
 * de fusion inter-transports (le même segment peut arriver au pair via le data
 * channel WebRTC P2P puis via le relais serveur traduit), `capturedAtMs` la clé
 * d'ordre du journal. Optionnels pour compatibilité avec les anciens clients.
 * `language` est le tag automatique de la langue de transcription — le futur
 * pipeline traduction live + resynthèse TTS s'appuie dessus.
 */
export interface CallTranscriptionSegmentEvent {
  readonly callId: string;
  readonly segment: {
    readonly id?: string;
    readonly text: string;
    readonly speakerId: string;
    readonly startMs: number;
    readonly endMs: number;
    readonly isFinal: boolean;
    readonly confidence: number;
    readonly language: string;
    readonly capturedAtMs?: number;
  };
}

/**
 * Event: call:translated-segment (Server → Client)
 * Transcription segment (with optional translation) broadcast to call participants.
 * `translatedText` is omitted when ZMQ translation is not enabled or unavailable;
 * consumers should fall back to displaying `text` in that case.
 *
 * `speakerDisplayName` est estampillé CÔTÉ SERVEUR depuis le participant
 * authentifié (même principe anti-usurpation que `speakerId`, fix 2026-08-13) —
 * jamais repris d'un champ client. `id`/`capturedAtMs` sont relayés depuis le
 * segment source (fallback serveur : réception) pour la fusion et l'ordre du
 * journal côté clients.
 */
export interface CallTranslatedSegmentEvent {
  readonly callId: string;
  readonly segment: {
    readonly id?: string;
    readonly text: string;
    readonly translatedText?: string;
    readonly speakerId: string;
    readonly speakerDisplayName?: string;
    readonly startMs: number;
    readonly endMs: number;
    readonly isFinal: boolean;
    readonly sourceLanguage: string;
    readonly targetLanguage: string;
    readonly confidence: number;
    readonly capturedAtMs?: number;
  };
}

/**
 * Event: call:transcription-active (Client → Server, fire-and-forget)
 * Un participant vient d'activer (`active: true`) ou de fermer
 * (`active: false`) son panneau de transcription. Le gateway authentifie,
 * estampille l'émetteur et rediffuse à la room — voir le broadcast ci-dessous.
 * Signal de présence, PAS de contenu : il n'est jamais gâté par la visibilité
 * du panneau du récepteur (c'est précisément l'invitation à l'ouvrir).
 */
export interface CallTranscriptionActiveEvent {
  readonly callId: string;
  readonly active: boolean;
}

/**
 * Event: call:transcription-active (Server → Clients de la room, émetteur exclu)
 * `speakerId` est estampillé CÔTÉ SERVEUR depuis le participant authentifié
 * (même principe anti-usurpation que les segments). Les clients affichent un
 * indicateur discret sur leur icône de transcription pour inviter à activer
 * aussi — et le retirent quand `active: false` ou à la fin de l'appel.
 */
export interface CallTranscriptionActiveBroadcast {
  readonly callId: string;
  readonly speakerId: string;
  readonly active: boolean;
}

// ===== CALL TRANSCRIPT — DATA CHANNEL P2P =====

/**
 * Entrée de journal de transcription transportée en P2P sur le data channel
 * WebRTC `"transcription"` quand il est ouvert (latence minimale, pas de
 * serveur). Le relais serveur `call:transcription-segment` reste émis en
 * parallèle : il porte le fallback (data channel absent/fermé — ex. pair web
 * offreur qui ne crée pas de canal) et la traduction ZMQ. Le récepteur
 * fusionne les deux arrivées par `id`.
 *
 * Contrairement au chemin socket, aucun serveur ne peut estampiller
 * `speakerDisplayName` ici : les récepteurs DOIVENT préférer le nom résolu
 * localement depuis leur roster de participants (par `speakerId`) et ne
 * retenir ce champ qu'en fallback d'affichage.
 */
export interface CallTranscriptEntryPayload {
  readonly id: string;
  readonly callId: string;
  readonly speakerId: string;
  readonly speakerDisplayName: string;
  readonly text: string;
  /** Tag automatique de la langue de transcription. */
  readonly language: string;
  readonly capturedAtMs: number;
  readonly isFinal: boolean;
  readonly confidence: number;
}

/** Enveloppe JSON du data channel (discriminée par `type`, comme `bye`/`ping`). */
export interface CallTranscriptDataChannelMessage {
  readonly type: 'transcript-entry';
  readonly entry: CallTranscriptEntryPayload;
}

// ===== FRONTEND STATE (pour Zustand store) =====

/**
 * État complet du call store (frontend)
 */
export interface CallState {
  // Current call
  currentCall: CallSession | null;

  // WebRTC connections
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;

  // Peer connections (P2P mode)
  peerConnections: Map<string, RTCPeerConnection>;

  // SFU state (Phase 1B)
  sfuDevice: unknown;                    // mediasoup-client Device
  sfuTransport: unknown;                // mediasoup Transport

  // UI state
  controls: CallControls;
  isConnecting: boolean;
  isInCall: boolean;
  error: string | null;

  // Transcription state (Phase 2A/2B)
  transcriptions: Transcription[];
  isTranscribing: boolean;

  // Translation state (Phase 3)
  translations: Map<string, Translation[]>;  // transcriptionId → translations
}

/**
 * Server → Client: fresh ICE servers after TTL refresh.
 */
export interface CallIceServersRefreshedEvent {
  readonly callId: string;
  readonly iceServers: RTCIceServer[];
  readonly ttl: number;
}

/**
 * Client → Server: force-leave a conversation's active call.
 * Sent as a preflight before `call:initiate` to clean up zombie call sessions
 * left by a previous client crash or disconnect without graceful teardown.
 */
export interface CallForceLeaveClientEvent {
  readonly conversationId: string;
}

/**
 * Server → Client: the gateway has force-ended the call.
 * Emitted when a server-side cleanup (GC, admin action, heartbeat timeout)
 * terminates a call. iOS/web clients subscribe to this on their personal
 * user room so the call UI is dismissed cleanly without waiting for a WebRTC
 * connection failure.
 */
export interface CallForceLeaveServerEvent {
  readonly callId: string;
  readonly reason?: string;
}

/**
 * Client → Server: request fresh TURN credentials before TTL expiry.
 * Clients send this at ~80% of the credential TTL so long calls always
 * have valid TURN credentials available for ICE restarts.
 * Gateway responds with `call:ice-servers-refreshed`.
 */
export interface CallRequestIceServersEvent {
  readonly callId: string;
}

/**
 * Répartition du temps d'appel entre les quatre paliers de qualité, en
 * FRACTIONS sommant à 1 — jamais en secondes (`socketCallAnalyticsSchema` borne
 * chaque membre à `[0, 1]`).
 */
export interface CallQualityDistribution {
  readonly excellent: number;
  readonly good: number;
  readonly fair: number;
  readonly poor: number;
}

/**
 * Client → Server: le rapport de télémétrie terminal d'un appel, émis UNE fois
 * au raccrochage (« fire-and-forget », sans ack).
 *
 * Déclaré au cycle 107. Il ne l'était nulle part jusque-là : ni dans
 * `CLIENT_EVENTS`, ni dans `ClientToServerEvents`. Il ne vivait que dans
 * `CALL_EVENTS.ANALYTICS` et dans la signature en ligne de son listener — dix-neuf
 * champs transcrits à la main — pendant que les TROIS clients l'émettaient,
 * chacun contre sa propre transcription de la forme.
 *
 * C'est `conversation:join-error` (cycle 99) dans l'autre sens : là, huit
 * émetteurs serveur sans déclaration ; ici, un listener sans déclaration. La
 * réception est le sens le plus cher des deux — la forme y vient du réseau, donc
 * d'un émetteur que le dépôt ne contrôle pas.
 *
 * **L'autorité d'exécution reste `socketCallAnalyticsSchema`** (Zod, côté
 * passerelle) : cette interface en est la transcription au type, pas une seconde
 * source. Les deux se modifient ensemble — c'est le schéma qui REFUSE, ce type ne
 * fait que dire ce qui est attendu.
 */
export interface CallAnalyticsEvent {
  readonly callId: string;
  /** Sonnerie humaine INCLUSE. `-1` = jamais connecté (manqué, rejeté, échec). */
  readonly setupTimeMs: number;
  /**
   * Négociation WebRTC SEULE (answer/join → connected), sans le temps de
   * sonnerie. Optionnel : absent des builds iOS antérieurs au 2026-07-03.
   */
  readonly negotiationTimeMs?: number;
  readonly durationSeconds: number;
  readonly reconnectionCount: number;
  readonly networkTransitions: number;
  readonly averageRtt: number;
  readonly averagePacketLoss: number;
  readonly maxPacketLoss: number;
  readonly codec: string;
  readonly effectsUsed: readonly string[];
  readonly filtersUsed: boolean;
  readonly transcriptionUsed: boolean;
  readonly qualityDistribution: CallQualityDistribution;
  readonly platform: string;
  readonly deviceModel: string;
  readonly isVideo: boolean;
  readonly endReason: string;
}

// ===== SOCKET.IO EVENT NAMES =====

/**
 * Noms des événements Socket.IO pour les appels
 */
export const CALL_EVENTS = {
  // Client → Server (with ACK)
  INITIATE: 'call:initiate',
  JOIN: 'call:join',
  LEAVE: 'call:leave',
  SIGNAL: 'call:signal',
  TOGGLE_AUDIO: 'call:toggle-audio',
  TOGGLE_VIDEO: 'call:toggle-video',
  END: 'call:end',

  // Client → Server (fire-and-forget)
  HEARTBEAT: 'call:heartbeat',
  QUALITY_REPORT: 'call:quality-report',
  RECONNECTING: 'call:reconnecting',
  RECONNECTED: 'call:reconnected',
  REQUEST_ICE_SERVERS: 'call:request-ice-servers',

  // Client → Server (fire-and-forget, lifecycle telemetry)
  BACKGROUNDED: 'call:backgrounded',
  FOREGROUNDED: 'call:foregrounded',
  SCREEN_CAPTURE_DETECTED: 'call:screen-capture-detected',
  ANALYTICS: 'call:analytics',

  // Server → Client (peer notification)
  SCREEN_CAPTURE_ALERT: 'call:screen-capture-alert',

  // Server → Client
  INITIATED: 'call:initiated',
  PARTICIPANT_JOINED: 'call:participant-joined',
  PARTICIPANT_LEFT: 'call:participant-left',
  SIGNAL_RECEIVED: 'call:signal',
  /**
   * @deprecated Jamais émis par le gateway (audit appels 2026-07-11 #4) —
   * le mode `sfu` est renvoyé dans les ACKs sans média SFU derrière. Ne pas
   * s'y abonner ; sera supprimé si le mode SFU est formellement abandonné.
   */
  MODE_CHANGED: 'call:mode-changed',
  MEDIA_TOGGLED: 'call:media-toggled',
  ENDED: 'call:ended',
  ERROR: 'call:error',
  MISSED: 'call:missed',
  /// Audit P1-27 — emitted to the joining user's OTHER sockets when one of
  /// their devices answers a call, so the rest dismiss their ringing UI.
  ALREADY_ANSWERED: 'call:already-answered',
  QUALITY_ALERT: 'call:quality-alert',
  ICE_SERVERS_REFRESHED: 'call:ice-servers-refreshed',

  // Transcription & Translation (Phase 2/3)
  // Seuls TRANSCRIPTION_SEGMENT (client → serveur) et TRANSLATED_SEGMENT
  // (serveur → clients) sont câblés dans CallEventsHandler. Les 4 autres
  // sont un contrat déclaré jamais émis (audit appels 2026-07-11 #4) —
  // conservés uniquement parce que le design leader/follower est suspendu,
  // pas abandonné. Ne pas s'y abonner tant qu'un émetteur n'existe pas.
  /** @deprecated Jamais émis par le gateway — voir bloc ci-dessus. */
  TRANSCRIPTION: 'call:transcription',
  /** @deprecated Jamais émis par le gateway — voir bloc ci-dessus. */
  TRANSLATION: 'call:translation',
  TRANSCRIPTION_SEGMENT: 'call:transcription-segment',
  TRANSLATED_SEGMENT: 'call:translated-segment',
  TRANSCRIPTION_ACTIVE: 'call:transcription-active',
  /** @deprecated Jamais émis par le gateway — voir bloc ci-dessus. */
  TRANSCRIPTION_CAPABILITY: 'call:transcription-capability',
  /** @deprecated Jamais émis par le gateway — voir bloc ci-dessus. */
  TRANSCRIPTION_ROLE: 'call:transcription-role',
} as const;

export type CallEventName = typeof CALL_EVENTS[keyof typeof CALL_EVENTS];

// ===== ERROR TYPES =====

/**
 * Erreur d'appel vidéo
 */
export interface CallError {
  readonly code: CallErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  /**
   * The call this error pertains to, when known. Clients with an active call
   * MUST ignore any `call:error` whose `callId` is present and does not match
   * their current call — an error for call A must never tear down an
   * unrelated, healthy call B on the same device. Absent only for errors that
   * occur before a call context exists (auth failures, generic rate limits).
   */
  readonly callId?: string;
}

/**
 * Codes d'erreur pour les appels vidéo
 */
export const CALL_ERROR_CODES = {
  // Authentication errors
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',

  // Connection errors
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  PEER_CONNECTION_FAILED: 'PEER_CONNECTION_FAILED',
  ICE_CONNECTION_FAILED: 'ICE_CONNECTION_FAILED',
  SIGNAL_FAILED: 'SIGNAL_FAILED',

  // Permission errors
  MEDIA_PERMISSION_DENIED: 'MEDIA_PERMISSION_DENIED',
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  NOT_A_PARTICIPANT: 'NOT_A_PARTICIPANT',
  /**
   * Le fil est TERMINÉ (`Conversation.isActive === false` ou `closedAt` posé) —
   * « no one can write », et un appel écrit : bulle d'appel en cours puis résumé
   * terminal, plus l'éventail de sonnerie. Refusé à l'OUVERTURE seulement ; un
   * appel déjà en cours va à son terme. Cf. `CallService.initiateCall`.
   */
  CONVERSATION_CLOSED: 'CONVERSATION_CLOSED',

  // Call state errors
  CALL_NOT_FOUND: 'CALL_NOT_FOUND',
  CALL_ALREADY_ACTIVE: 'CALL_ALREADY_ACTIVE',
  CALL_ENDED: 'CALL_ENDED',
  MAX_PARTICIPANTS_REACHED: 'MAX_PARTICIPANTS_REACHED',
  FORCE_LEAVE_ERROR: 'FORCE_LEAVE_ERROR',
  INVALID_CALL_MODE: 'INVALID_CALL_MODE',
  UNSUPPORTED_CALL_TYPE: 'UNSUPPORTED_CALL_TYPE',
  ALREADY_IN_CALL: 'ALREADY_IN_CALL',
  NOT_IN_CALL: 'NOT_IN_CALL',
  /** Optimistic-locking conflict on CallSession.version persisted after retry (see CallService.joinCall). */
  CALL_STATE_CONFLICT: 'CALL_STATE_CONFLICT',

  // Media control errors
  MEDIA_TOGGLE_FAILED: 'MEDIA_TOGGLE_FAILED',

  // Feature errors
  VIDEO_CALLS_NOT_SUPPORTED: 'VIDEO_CALLS_NOT_SUPPORTED',  // PUBLIC/GLOBAL conversations
  BROWSER_NOT_SUPPORTED: 'BROWSER_NOT_SUPPORTED',

  // Security errors (CVE fixes)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_SIGNAL: 'INVALID_SIGNAL',
  SIGNAL_SENDER_MISMATCH: 'SIGNAL_SENDER_MISMATCH',
  SIGNAL_TOO_LARGE: 'SIGNAL_TOO_LARGE',
  TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
} as const;

export type CallErrorCode = typeof CALL_ERROR_CODES[keyof typeof CALL_ERROR_CODES];
