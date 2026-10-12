import { z } from 'zod';

/**
 * **LES GESTES D'ADMINISTRATION SUR UNE PUBLICATION** (#10392, #10394) — le
 * contrat que la passerelle valide et que l'espace d'administration web envoie.
 *
 * Un geste porte sur une publication (ou un lot de 50 au plus) et dit ce que
 * l'administration veut VOIR : la publication hors ligne, remise en ligne, ou
 * servie à une autre audience. Publier un brouillon, c'est `set-visibility`
 * `PUBLIC`. Les audiences `EXCEPT` et `ONLY` ne se posent pas d'ici : elles
 * exigent une liste de personnes que seul l'auteur choisit.
 *
 * L'état LU d'une publication tient en cinq valeurs, une seule à la fois, par
 * priorité : supprimée > hors ligne (`moderationHiddenAt`) > expirée > privée
 * (`visibility = PRIVATE` sans retrait) > publiée.
 */

export const ADMIN_POST_STATES = ['published', 'offline', 'private', 'expired', 'deleted'] as const;
export type AdminPostState = (typeof ADMIN_POST_STATES)[number];
export const adminPostStateSchema = z.enum(ADMIN_POST_STATES);

export const ADMIN_POST_VISIBILITIES = ['PUBLIC', 'FRIENDS', 'COMMUNITY', 'PRIVATE', 'EXCEPT', 'ONLY'] as const;
export type AdminPostVisibility = (typeof ADMIN_POST_VISIBILITIES)[number];

export const ADMIN_SETTABLE_VISIBILITIES = ['PUBLIC', 'FRIENDS', 'COMMUNITY', 'PRIVATE'] as const;
export type AdminSettableVisibility = (typeof ADMIN_SETTABLE_VISIBILITIES)[number];

export const ADMIN_POST_GESTURES = ['take-offline', 'restore', 'set-visibility'] as const;
export type AdminPostGestureName = (typeof ADMIN_POST_GESTURES)[number];

export const ADMIN_POST_BATCH_MAX = 50;
export const ADMIN_MODERATION_REASON_MAX = 500;

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

export const ADMIN_POST_GESTURE_OUTCOMES = ['applied', 'unchanged', 'refused'] as const;
export type AdminPostGestureOutcome = (typeof ADMIN_POST_GESTURE_OUTCOMES)[number];

export const adminPostBatchResultSchema = z.object({
  postId: objectId,
  outcome: z.enum(ADMIN_POST_GESTURE_OUTCOMES),
  code: z.string().max(64).optional(),
  view: adminPostModerationViewSchema.optional(),
});
export type AdminPostBatchResult = z.infer<typeof adminPostBatchResultSchema>;

export const adminPostBatchResponseSchema = z.object({ results: z.array(adminPostBatchResultSchema) });
export type AdminPostBatchResponse = z.infer<typeof adminPostBatchResponseSchema>;

export const ADMIN_REPORT_ACTIONS = ['take-offline', 'make-private', 'remove-comment', 'dismiss'] as const;
export type AdminReportAction = (typeof ADMIN_REPORT_ACTIONS)[number];

export const adminReportActSchema = z.object({ action: z.enum(ADMIN_REPORT_ACTIONS), reason });
export type AdminReportAct = z.infer<typeof adminReportActSchema>;

export const adminRemovedCommentSchema = z.object({ commentId: objectId, removedAt: z.iso.datetime() });
export type AdminRemovedComment = z.infer<typeof adminRemovedCommentSchema>;

export const adminReportActResponseSchema = z.object({
  report: z.object({ id: objectId, status: z.string() }),
  target: z.union([adminPostModerationViewSchema, adminRemovedCommentSchema]).nullable(),
});
export type AdminReportActResponse = z.infer<typeof adminReportActResponseSchema>;

export type AdminPostStateFacts = {
  readonly visibility: string;
  readonly deletedAt: Date | string | null;
  readonly expiresAt: Date | string | null;
  readonly moderationHiddenAt: Date | string | null;
};

const instantOf = (value: Date | string | null): number | null => {
  if (value === null || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

/** L'état LU d'une publication — une seule définition pour la passerelle et l'espace web. */
export function adminPostStateOf(facts: AdminPostStateFacts, now: Date): AdminPostState {
  if (facts.deletedAt !== null && facts.deletedAt !== '') return 'deleted';
  if (facts.moderationHiddenAt !== null && facts.moderationHiddenAt !== '') return 'offline';
  const expiry = instantOf(facts.expiresAt);
  if (expiry !== null && expiry <= now.getTime()) return 'expired';
  if (facts.visibility === 'PRIVATE') return 'private';
  return 'published';
}

/** Ce que chaque état laisse faire d'un geste — l'interface ne propose que ceux-là. */
export function adminGesturesFor(state: AdminPostState): readonly AdminPostGestureName[] {
  switch (state) {
    case 'deleted':
      return [];
    case 'offline':
      return ['restore'];
    case 'published':
    case 'private':
    case 'expired':
      return ['take-offline', 'set-visibility'];
  }
}
