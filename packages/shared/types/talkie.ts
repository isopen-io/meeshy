/**
 * LE TALKIE — un Proche appuie et parle, sa voix sort chez l'autre sans décrocher
 * (#13935, décision porteur D-4 du 2026-10-31, #13946 ; conformité E10, #14408).
 *
 * UN contrat, lu par la passerelle et par les trois clients. Tout passe par la
 * socket authentifiée (noms : `socketio-events/talkie-event-names.ts`) :
 *
 * 1. `talkie:start` {@link TalkieStartPayload} → accusé {@link TalkieStartAck} ;
 *    le destinataire reçoit `talkie:incoming` ({@link TalkieIncomingEventData}).
 * 2. `talkie:send-chunk` {@link TalkieChunkPayload} (binaire) → relayé AUSSITÔT au
 *    destinataire en `talkie:chunk` ({@link TalkieChunkEventData}), sans upload, sans
 *    normalisation, sans transcription, sans rien stocker.
 * 3. `talkie:end` → `talkie:ended` ({@link TalkieEndedEventData}).
 *
 * La copie en message vocal se fait APRÈS, par le chemin vocal existant, hors du
 * chemin critique : c'est elle qui sert de repli (`TALKIE_FALLBACK_VOICE`).
 *
 * Règles que les clients ne recalculent pas : ouvert dès Proche (niveau effectif),
 * préférence de RÉCEPTION du destinataire (active par défaut, coupée par personne
 * — `talkieBlocked` — ou globalement — `notification.talkieEnabled`) ; jamais dans
 * une paire dont la conversation directe est chiffrée de bout en bout (hors E2EE
 * au MVP, l'interface le dit) ; coupé quand le destinataire est en appel ou en Ne
 * pas déranger (repli : message vocal) ; un blocage coupe immédiatement.
 */
import { z } from 'zod';

/** Une prise de parole dure au plus 30 s, comme la copie vocale qui la double. */
export const TALKIE_MAX_DURATION_MS = 30_000;
/** Un fragment de ~500 ms en AAC mono 64 kb/s pèse ~4 Ko : 16 Ko laissent de la marge sans ouvrir un tuyau. */
export const TALKIE_MAX_CHUNK_BYTES = 16_384;
/** Plafond d'une prise de parole entière : 30 s à 64 kb/s ≈ 240 Ko, doublés. */
export const TALKIE_MAX_TOTAL_BYTES = 512_000;
/** Plafond du NOMBRE de fragments d'une prise de parole : 30 s par fragments de 100 ms au plus court. */
export const TALKIE_MAX_CHUNKS = 300;
/** Le seul encodage relayé au MVP : celui du vocal (AAC mono, trames ADTS lisibles dès la première). */
export const TALKIE_CODECS = ['aac-adts'] as const;
export type TalkieCodec = (typeof TALKIE_CODECS)[number];

export const TALKIE_ERROR_CODES = {
  /** Pas de lien d'au moins Proche, blocage, compte inconnu ou désactivé — indistincts. */
  NOT_ALLOWED: 'TALKIE_NOT_ALLOWED',
  /** Le destinataire a coupé la réception directe (pour moi ou pour tous). */
  BLOCKED: 'TALKIE_BLOCKED',
  /** La conversation directe de la paire est chiffrée de bout en bout : aucun clair ne passe (E10). */
  E2EE_CONVERSATION: 'TALKIE_E2EE_CONVERSATION',
  /** Le destinataire est en appel ou en Ne pas déranger : envoyer un message vocal à la place. */
  FALLBACK_VOICE: 'TALKIE_FALLBACK_VOICE',
  /** Trop de prises de parole, ou un débit hors des bornes. */
  RATE_LIMITED: 'TALKIE_RATE_LIMITED',
  /** Charge illisible (identifiant, encodage, fragment trop gros, ordre). */
  INVALID: 'TALKIE_INVALID',
  /** La prise de parole n'existe pas (finie, coupée) ou n'est pas la mienne. */
  NOT_FOUND: 'TALKIE_NOT_FOUND',
  /** Le serveur ne peut pas juger (lecture en panne) : rien ne passe. */
  UNAVAILABLE: 'TALKIE_UNAVAILABLE',
} as const;
export type TalkieErrorCode = (typeof TALKIE_ERROR_CODES)[keyof typeof TALKIE_ERROR_CODES];

/** `sender` : bouton relâché · `limit` : 30 s ou plafond atteint · `cut` : coupée (blocage, réglage, déconnexion). */
export const TALKIE_END_REASONS = ['sender', 'limit', 'cut'] as const;
export type TalkieEndReason = (typeof TALKIE_END_REASONS)[number];

export const talkieStartPayloadSchema = z.object({
  toUserId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  codec: z.enum(TALKIE_CODECS),
});
export type TalkieStartPayload = z.infer<typeof talkieStartPayloadSchema>;

export type TalkieStartAck =
  | { readonly success: true; readonly data: { readonly talkieId: string; readonly maxDurationMs: number; readonly maxChunkBytes: number } }
  | { readonly success: false; readonly error: string; readonly code: TalkieErrorCode };

/** `data` : un `Buffer` / `ArrayBuffer` Socket.IO (binaire natif), jamais du base64. */
export const talkieChunkPayloadSchema = z.object({
  talkieId: z.string().regex(/^[0-9a-f]{24}$/),
  seq: z.number().int().nonnegative(),
  /** Horloge de l'émetteur à la capture (ms epoch) — pour mesurer la latence émission → premier son. */
  capturedAt: z.number().int().nonnegative().optional(),
  data: z.custom<Uint8Array>((v) => v instanceof Uint8Array || v instanceof ArrayBuffer),
});
export type TalkieChunkPayload = z.infer<typeof talkieChunkPayloadSchema>;

export const talkieEndPayloadSchema = z.object({ talkieId: z.string().regex(/^[0-9a-f]{24}$/) });
export type TalkieEndPayload = z.infer<typeof talkieEndPayloadSchema>;

export type TalkieIncomingEventData = {
  readonly talkieId: string;
  readonly fromUserId: string;
  readonly codec: TalkieCodec;
  readonly startedAt: string;
  readonly maxDurationMs: number;
};

export type TalkieChunkEventData = {
  readonly talkieId: string;
  readonly fromUserId: string;
  readonly seq: number;
  readonly data: Uint8Array;
  readonly capturedAt?: number;
  /** Horloge du serveur à la réception (ms epoch) : le client mesure capture → serveur → premier son. */
  readonly relayedAt: number;
};

export type TalkieEndedEventData = {
  readonly talkieId: string;
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly reason: TalkieEndReason;
  readonly endedAt: string;
};
