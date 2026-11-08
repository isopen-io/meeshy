import { z } from 'zod';

import { CALL_LIVE_FRAME_ID_MAX, CALL_LIVE_FRAME_ID_PATTERN, CALL_LIVE_FRAME_REPLIES, CALL_LIVE_FRAME_TEXT_MAX, type CallLiveFrameReply } from './call-live-frame-bounds.js';

/**
 * LE CADRE EN DIRECT D'UN APPEL (#9214, doc frames 06 § 4, étape 3.2 ; en groupe #11279).
 *
 * Chaque participant compose LOCALEMENT sa vue — sa vidéo et celle qu'il reçoit
 * dans les cases du cadre ; la vidéo envoyée ne porte jamais le cadre. Ce qui
 * voyage est donc minimal : l'identifiant du cadre du catalogue (ou `null` pour
 * le retirer) et les textes que l'émetteur accepte de partager. La passerelle
 * relaie aux AUTRES participants de l'appel : à deux, à toute la room ; en
 * groupe (3 à `CALL_MAX_PARTICIPANTS`), aux seules sockets qui annoncent
 * `call-live-frame-group` (`utils/client-capabilities.ts`).
 *
 * Les bornes sont la loi de FORME, exécutée à la frontière du socket et lisible
 * par les clients. Les types en dérivent.
 */

export { CALL_LIVE_FRAME_ID_MAX, CALL_LIVE_FRAME_ID_PATTERN, CALL_LIVE_FRAME_REPLIES, CALL_LIVE_FRAME_TEXT_MAX };
export type { CallLiveFrameReply } from './call-live-frame-bounds.js';

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


/** Client → serveur : proposer (ou retirer, `frameId: null`) un cadre en direct, ou répondre à une proposition. */
export const callLiveFrameSelectSchema = z
  .object({
    callId: objectId,
    frameId: frameId.nullable(),
    texts: sharedTexts.optional(),
    reply: z.enum(CALL_LIVE_FRAME_REPLIES).optional(),
  })
  .strict()
  .refine((event) => event.reply === undefined || event.frameId !== null, {
    message: 'a reply names the frame it answers',
    path: ['frameId'],
  });

export type CallLiveFrameSelectEvent = z.input<typeof callLiveFrameSelectSchema>;

/** Serveur → les autres participants de l'appel (en groupe : ceux qui annoncent la capacité). */
export type CallLiveFrameSelectedEvent = {
  readonly callId: string;
  readonly userId: string;
  readonly frameId: string | null;
  readonly texts?: CallLiveFrameTexts;
  readonly reply?: CallLiveFrameReply;
  readonly at: string;
};
