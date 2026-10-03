import { z } from 'zod';

/**
 * LE CADRE EN DIRECT D'UN APPEL À DEUX (#9214, doc frames 06 § 4, étape 3.2).
 *
 * Chaque participant compose LOCALEMENT sa vue — sa vidéo et celle qu'il reçoit
 * dans les cases du cadre ; la vidéo envoyée ne porte jamais le cadre. Ce qui
 * voyage est donc minimal : l'identifiant du cadre du catalogue (ou `null` pour
 * le retirer) et les textes que l'émetteur accepte de partager. La passerelle
 * relaie à l'AUTRE participant d'un appel à deux, et à personne d'autre.
 *
 * Les bornes sont la loi de FORME, exécutée à la frontière du socket et lisible
 * par les clients. Les types en dérivent.
 */

export const CALL_LIVE_FRAME_ID_MAX = 96;
export const CALL_LIVE_FRAME_TEXT_MAX = 64;

/** La forme d'un identifiant du catalogue : `ambiance.motif[.tranche]`, minuscules, chiffres, tirets. */
export const CALL_LIVE_FRAME_ID_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+){1,3}$/;

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);

const frameId = z.string().max(CALL_LIVE_FRAME_ID_MAX).regex(CALL_LIVE_FRAME_ID_PATTERN);

const sharedText = z
  .string()
  .max(CALL_LIVE_FRAME_TEXT_MAX)
  .transform((value) => value.trim())
  .optional();

/** Les textes que l'émetteur partage : son prénom tel qu'il veut le voir écrit, sa ville s'il l'autorise. */
const sharedTexts = z
  .object({ name: sharedText, city: sharedText })
  .strict()
  .transform((texts): CallLiveFrameTexts =>
    Object.fromEntries(Object.entries(texts).filter(([, value]) => typeof value === 'string' && value.length > 0))
  );

export type CallLiveFrameTexts = {
  readonly name?: string;
  readonly city?: string;
};

/** Client → serveur : poser (ou retirer, `frameId: null`) le cadre en direct de l'appel. */
export const callLiveFrameSelectSchema = z
  .object({
    callId: objectId,
    frameId: frameId.nullable(),
    texts: sharedTexts.optional(),
  })
  .strict();

export type CallLiveFrameSelectEvent = z.input<typeof callLiveFrameSelectSchema>;

/** Serveur → l'autre participant de l'appel à deux. */
export type CallLiveFrameSelectedEvent = {
  readonly callId: string;
  readonly userId: string;
  readonly frameId: string | null;
  readonly texts?: CallLiveFrameTexts;
  readonly at: string;
};
