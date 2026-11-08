/**
 * REGARDER OU ÉCOUTER ENSEMBLE — deux Proches lisent la même pièce jointe audio ou
 * vidéo d'une conversation qu'ils partagent, en lecture synchronisée (#17011, #17012).
 *
 * UN contrat, lu par la passerelle et les trois clients. Tout passe par la socket
 * authentifiée (noms : `socketio-events/together-event-names.ts`) :
 *
 * 1. `together:invite` {@link TogetherInvitePayload} → accusé {@link TogetherInviteAck} ;
 *    l'invité reçoit `together:invited` ({@link TogetherInvitedEventData}).
 * 2. `together:join` {@link TogetherSessionPayload} → les DEUX reçoivent `together:started`
 *    ({@link TogetherStartedEventData}), tous appareils.
 * 3. `together:sync` {@link TogetherSyncPayload} (lecture, pause, déplacement) → les deux
 *    reçoivent `together:synced` ({@link TogetherSyncedEventData}), horodaté par le serveur.
 * 4. `together:leave` → `together:ended` ({@link TogetherEndedEventData}) chez les deux.
 *
 * Règles que les clients ne recalculent pas : ouvert dès Proche (feature `together` de la
 * matrice), jamais entre deux comptes dont l'un a bloqué l'autre ; le média est une pièce
 * jointe audio ou vidéo, ni supprimée, ni à vue unique, ni éphémère, d'une conversation où
 * les deux sont membres actifs ; une séance par paire. Chaque synchronisation est
 * rejugée, et une baisse, un retrait ou un blocage termine la séance (`cut`).
 *
 * Le serveur ne voit ni ne relaie le CONTENU : seulement des identifiants et une position
 * de lecture. L'état de séance est scellé au repos (`secret-at-rest`), avec une durée de vie
 * courte.
 *
 * Synchroniser : la position COURANTE vaut `positionMs + (maintenant − at)` quand `playing`,
 * `at` étant l'horloge du serveur ; chaque client corrige l'écart de son horloge par
 * l'accusé, et ignore un `rev` déjà appliqué.
 */
import { z } from 'zod';

import { TOGETHER_MAX_POSITION_MS, type TogetherEndReason, type TogetherErrorCode, type TogetherMediaKind } from './together-constants.js';

/** Les bornes, codes et raisons : `./together-constants.ts`, sans Zod, lisibles par un client léger. */
export * from './together-constants.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const sessionId = z.string().regex(/^[0-9a-f]{32}$/);

export const togetherInvitePayloadSchema = z.object({
  toUserId: objectId,
  conversationId: objectId,
  attachmentId: objectId,
});
export type TogetherInvitePayload = z.infer<typeof togetherInvitePayloadSchema>;

export const togetherSessionPayloadSchema = z.object({ sessionId });
export type TogetherSessionPayload = z.infer<typeof togetherSessionPayloadSchema>;

export const togetherSyncPayloadSchema = z.object({
  sessionId,
  playing: z.boolean(),
  positionMs: z.number().int().nonnegative().max(TOGETHER_MAX_POSITION_MS),
});
export type TogetherSyncPayload = z.infer<typeof togetherSyncPayloadSchema>;

/** L'état de lecture partagé. `at` : horloge du serveur (ms epoch) quand `positionMs` valait. */
export type TogetherPlayback = {
  readonly playing: boolean;
  readonly positionMs: number;
  readonly at: number;
  /** Croît à chaque synchronisation : un client ignore un `rev` déjà appliqué. */
  readonly rev: number;
  readonly byUserId: string;
};

type Refusal = { readonly success: false; readonly error: string; readonly code: TogetherErrorCode };

export type TogetherInviteAck =
  | { readonly success: true; readonly data: { readonly sessionId: string; readonly expiresAt: string; readonly media: TogetherMediaKind } }
  | Refusal;

export type TogetherJoinAck = { readonly success: true; readonly data: TogetherStartedEventData } | Refusal;

export type TogetherSyncAck = { readonly success: true; readonly data: { readonly playback: TogetherPlayback } } | Refusal;

export type TogetherLeaveAck = { readonly success: true } | Refusal;

export type TogetherInvitedEventData = {
  readonly sessionId: string;
  readonly fromUserId: string;
  readonly conversationId: string;
  readonly attachmentId: string;
  readonly media: TogetherMediaKind;
  readonly expiresAt: string;
};

export type TogetherStartedEventData = {
  readonly sessionId: string;
  readonly hostUserId: string;
  readonly guestUserId: string;
  readonly conversationId: string;
  readonly attachmentId: string;
  readonly media: TogetherMediaKind;
  readonly playback: TogetherPlayback;
};

export type TogetherSyncedEventData = {
  readonly sessionId: string;
  readonly playback: TogetherPlayback;
};

export type TogetherEndedEventData = {
  readonly sessionId: string;
  readonly reason: TogetherEndReason;
  readonly endedAt: string;
};
