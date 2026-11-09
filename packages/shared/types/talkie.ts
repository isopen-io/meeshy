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
 * une paire dont la conversation directe est chiffrée de bout en bout, SAUF voix
 * scellée sur l'appareil (`sealed`, #13949 : fragments opaques pour le serveur) ; coupé quand le destinataire est en appel ou en Ne
 * pas déranger (repli : message vocal) ; un blocage coupe immédiatement.
 */
import { z } from 'zod';

import {
  TALKIE_CODECS,
  TALKIE_SEAL_KEY_ID_CHARS,
  TALKIE_SEALED_CODEC,
  type TalkieEndReason,
  type TalkieErrorCode,
  type TalkieWireCodec,
} from './talkie-constants.js';

/** Les bornes, encodages, codes et raisons : `./talkie-constants.ts`, sans Zod, lisibles par un client léger. */
export * from './talkie-constants.js';

/**
 * La voix SCELLÉE de bout en bout (#13949) : les fragments sont chiffrés sur l'appareil émetteur avec une clé
 * propre à la prise de parole. Cette clé n'est PAS ici : l'émetteur la remet par le relais des signaux E2EE
 * de la paire (`e2ee:send-signal`, une enveloppe libsignal par appareil, Sesame compris) ; `talkie:start` n'en
 * porte que l'identifiant, que le destinataire rapproche de la clé déchiffrée. Le serveur ne transcrit ni ne
 * normalise les fragments, et n'exige d'eux aucune forme (un fragment scellé n'est pas une trame ADTS lisible).
 * Dans une paire dont la conversation directe est chiffrée, seule une voix scellée passe — et seulement quand la
 * passerelle l'accepte (`TALKIE_SEALED_VOICE_ENABLED`, éteint tant qu'aucun client ne déchiffre). Une voix scellée
 * porte l'encodage {@link TALKIE_SEALED_CODEC} : le sceau sans cet encodage, ou l'inverse, est illisible.
 */
export const talkieSealSchema = z.object({
  keyId: z.string().min(TALKIE_SEAL_KEY_ID_CHARS.min).max(TALKIE_SEAL_KEY_ID_CHARS.max).regex(/^[A-Za-z0-9_-]+$/),
});
export type TalkieSeal = z.infer<typeof talkieSealSchema>;

export const talkieStartPayloadSchema = z
  .object({
    toUserId: z.string().regex(/^[0-9a-fA-F]{24}$/),
    codec: z.enum([...TALKIE_CODECS, TALKIE_SEALED_CODEC]),
    sealed: talkieSealSchema.optional(),
  })
  .refine((payload) => (payload.codec === TALKIE_SEALED_CODEC) === (payload.sealed !== undefined), {
    message: 'Une voix scellée porte son sceau ET son encodage, une voix en clair ni l’un ni l’autre',
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
  /**
   * Le DERNIER fragment de la prise de parole (#13949). Pour une voix scellée, il entre dans les données associées
   * de l'AEAD (`keyId || seq || dernier`) : le destinataire ne tient une prise de parole pour complète qu'au vu d'un
   * dernier fragment authentifié, jamais sur le seul `talkie:ended` que le serveur dicte.
   */
  last: z.literal(true).optional(),
  data: z.custom<Uint8Array>((v) => v instanceof Uint8Array || v instanceof ArrayBuffer),
});
export type TalkieChunkPayload = z.infer<typeof talkieChunkPayloadSchema>;

export const talkieEndPayloadSchema = z.object({ talkieId: z.string().regex(/^[0-9a-f]{24}$/) });
export type TalkieEndPayload = z.infer<typeof talkieEndPayloadSchema>;

export type TalkieIncomingEventData = {
  readonly talkieId: string;
  readonly fromUserId: string;
  readonly codec: TalkieWireCodec;
  readonly startedAt: string;
  readonly maxDurationMs: number;
  /** Présent ⇔ la voix est scellée : l'identifiant de la clé, remise à part par le relais des signaux E2EE. */
  readonly sealed?: TalkieSeal;
};

export type TalkieChunkEventData = {
  readonly talkieId: string;
  readonly fromUserId: string;
  readonly seq: number;
  readonly data: Uint8Array;
  readonly capturedAt?: number;
  /** Le dernier fragment, tel que l'émetteur l'a déclaré (`talkieChunkPayloadSchema.last`). */
  readonly last?: true;
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
