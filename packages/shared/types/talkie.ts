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
 * 4. (#17142) destinataire sans socket mais joignable par push : l'accusé dit `delivery: 'waking'`, un push de réveil
 *    part, et le destinataire émet `talkie:join` {@link TalkieJoinPayload} — il reçoit alors `talkie:incoming`, tous les
 *    fragments gardés dans l'ordre, puis le direct, puis `talkie:ended`.
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

import { TALKIE_CODECS, type TalkieCodec, type TalkieDelivery, type TalkieEndReason, type TalkieErrorCode } from './talkie-constants.js';

/** Les bornes, encodages, codes et raisons : `./talkie-constants.ts`, sans Zod, lisibles par un client léger. */
export * from './talkie-constants.js';

export const talkieStartPayloadSchema = z.object({
  toUserId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  codec: z.enum(TALKIE_CODECS),
});
export type TalkieStartPayload = z.infer<typeof talkieStartPayloadSchema>;

/**
 * `delivery` et `conversationId` sont OPTIONNELS (#17142) : un ancien client les ignore, un nouveau client lit
 * l'absence de `delivery` comme `live`. `conversationId` n'accompagne que `TALKIE_FALLBACK_VOICE` : la conversation la
 * plus récente que l'émetteur partage avec le destinataire, où partira la copie vocale (absent : aucune).
 */
export type TalkieStartAck =
  | {
      readonly success: true;
      readonly data: { readonly talkieId: string; readonly maxDurationMs: number; readonly maxChunkBytes: number; readonly delivery?: TalkieDelivery };
    }
  | { readonly success: false; readonly error: string; readonly code: TalkieErrorCode; readonly conversationId?: string };

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

/** `talkie:join` (#17142) : le destinataire réveillé rejoint une prise de parole `waking`, pendant ou jusqu'à 60 s après. */
export const talkieJoinPayloadSchema = z.object({ talkieId: z.string().regex(/^[0-9a-f]{24}$/) });
export type TalkieJoinPayload = z.infer<typeof talkieJoinPayloadSchema>;

/**
 * Le push de réveil (#17142), mêmes clés sur les deux canaux : APNs `pushtotalk` (topic `<bundle>.voip-ptt`) quand un
 * jeton PushToTalk est enregistré, sinon notification haute priorité. `fromName` est vide quand le destinataire masque le
 * nom de l'expéditeur ; `title` et `body` sont localisés à sa langue (Prisme de cadrage).
 */
export type TalkieWakePushData = {
  readonly type: 'talkie_incoming';
  readonly talkieId: string;
  readonly fromUserId: string;
  readonly fromName: string;
  readonly title: string;
  readonly body: string;
};

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
