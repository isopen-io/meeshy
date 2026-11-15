import { z } from 'zod';

import {
  ADMIN_MODERATION_REASON_MAX,
  ADMIN_POST_BATCH_MAX,
  ADMIN_POST_GESTURE_OUTCOMES,
  ADMIN_POST_STATES,
  ADMIN_POST_VISIBILITIES,
  ADMIN_REPORT_ACTIONS,
  ADMIN_SETTABLE_VISIBILITIES,
} from './admin-publication-states.js';

export * from './admin-publication-states.js';

/**
 * **LES GESTES D'ADMINISTRATION SUR UNE PUBLICATION** (#10392, #10394) — le contrat que
 * la passerelle valide et que l'espace d'administration web envoie.
 *
 * Un geste porte sur une publication (ou un lot de 50 au plus) et dit ce que
 * l'administration veut VOIR : la publication hors ligne, remise en ligne, ou servie à
 * une audience plus étroite ou égale à celle de l'auteur — jamais plus large
 * (`AUDIENCE_WIDENING`) : un brouillon ne se publie que par son auteur. Les
 * audiences `EXCEPT` et `ONLY` ne se posent pas d'ici : elles exigent une liste de
 * personnes que seul l'auteur choisit.
 *
 * Les constantes, l'état lu et les gestes offerts vivent, sans Zod, dans
 * `admin-publication-states.ts` (ré-exporté ici) : un client web les importe de là.
 */

export const adminPostStateSchema = z.enum(ADMIN_POST_STATES);

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const reason = z.string().trim().max(ADMIN_MODERATION_REASON_MAX).optional();

export const adminPostGestureSchema = z.discriminatedUnion('gesture', [
  z.object({ gesture: z.literal('take-offline'), reason }),
  z.object({ gesture: z.literal('restore'), reason }),
  z.object({ gesture: z.literal('set-visibility'), visibility: z.enum(ADMIN_SETTABLE_VISIBILITIES), reason }),
]);
export type AdminPostGesture = z.infer<typeof adminPostGestureSchema>;

export const adminPostBatchGestureSchema = adminPostGestureSchema.and(
  z.object({ postIds: z.array(objectId).min(1).max(ADMIN_POST_BATCH_MAX) }),
);
export type AdminPostBatchGesture = z.infer<typeof adminPostBatchGestureSchema>;

export const adminPostModerationViewSchema = z.object({
  id: objectId,
  state: adminPostStateSchema,
  visibility: z.enum(ADMIN_POST_VISIBILITIES),
  moderationHiddenAt: z.iso.datetime().nullable(),
  moderationPriorVisibility: z.enum(ADMIN_POST_VISIBILITIES).nullable(),
  updatedAt: z.iso.datetime(),
});
export type AdminPostModerationView = z.infer<typeof adminPostModerationViewSchema>;

export const adminPostBatchResultSchema = z.object({
  postId: objectId,
  outcome: z.enum(ADMIN_POST_GESTURE_OUTCOMES),
  code: z.string().max(64).optional(),
  view: adminPostModerationViewSchema.optional(),
});
export type AdminPostBatchResult = z.infer<typeof adminPostBatchResultSchema>;

export const adminPostBatchResponseSchema = z.object({ results: z.array(adminPostBatchResultSchema) });
export type AdminPostBatchResponse = z.infer<typeof adminPostBatchResponseSchema>;

export const adminReportActSchema = z.object({ action: z.enum(ADMIN_REPORT_ACTIONS), reason });
export type AdminReportAct = z.infer<typeof adminReportActSchema>;

export const adminRemovedCommentSchema = z.object({ commentId: objectId, removedAt: z.iso.datetime() });
export type AdminRemovedComment = z.infer<typeof adminRemovedCommentSchema>;

export const adminReportActResponseSchema = z.object({
  report: z.object({ id: objectId, status: z.string() }),
  target: z.union([adminPostModerationViewSchema, adminRemovedCommentSchema]).nullable(),
});
export type AdminReportActResponse = z.infer<typeof adminReportActResponseSchema>;
