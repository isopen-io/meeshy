/**
 * Un retrait fait depuis la CONSOLE d'administration prévient l'auteur (#11158),
 * par la même notification `content_removed` que le retrait depuis l'app
 * (`contentRemoval.ts`, le site unique de sa composition) : à l'auteur seul,
 * avec le motif quand il y en a un — le rang souverain peut ne pas en donner.
 *
 * Détaché : la réponse du modérateur n'attend pas l'envoi du push.
 */

import type { RemovedContentType } from '@meeshy/shared/types/notification';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { notifyContentRemoved, removedPostContentType, type ContentRemovalNotifyDeps } from './contentRemoval';

const log = enhancedLogger.child({ module: 'adminRemovalNotices' });

export type AdminRemoval = {
  readonly actorUserId: string;
  readonly authorUserId: string | null | undefined;
  readonly contentType: RemovedContentType;
  readonly contentId: string;
  readonly postId?: string;
  readonly reason: string | null | undefined;
};

export function noticeAdminRemoval(deps: ContentRemovalNotifyDeps, removal: AdminRemoval): void {
  if (!removal.authorUserId || removal.authorUserId === removal.actorUserId) return;
  const reason = removal.reason?.trim();
  notifyContentRemoved(deps, {
    authorUserId: removal.authorUserId,
    contentType: removal.contentType,
    contentId: removal.contentId,
    ...(removal.postId ? { postId: removal.postId } : {}),
    ...(reason ? { reason } : {}),
  }).catch((error: unknown) => log.warn('admin removal: author notification failed', { contentId: removal.contentId, error }));
}

/** La forme d'un geste de publication appliqué que ce site lit (`ModerationPlan` des routes admin). */
export type AppliedPostModeration = {
  readonly row: { readonly id: string; readonly authorId: string; readonly type: string | null };
  readonly before: { readonly moderationHiddenAt: Date | null };
  readonly after: { readonly moderationHiddenAt: Date | null } | null;
  readonly copyOf?: string;
};

const takenOffline = (plan: AppliedPostModeration): boolean =>
  plan.copyOf === undefined && plan.before.moderationHiddenAt === null && plan.after !== null && plan.after.moderationHiddenAt !== null;

/**
 * Chaque publication NOUVELLEMENT mise hors ligne prévient son auteur. Ni la copie
 * d'une republication (son auteur n'a rien publié de retiré), ni une remise en
 * ligne, ni un changement d'audience.
 */
export function noticeTakenOffline(
  deps: ContentRemovalNotifyDeps,
  applied: readonly AppliedPostModeration[],
  context: { readonly actorUserId: string; readonly reason: string | null | undefined },
): void {
  applied.filter(takenOffline).forEach((plan) =>
    noticeAdminRemoval(deps, {
      actorUserId: context.actorUserId,
      authorUserId: plan.row.authorId,
      contentType: removedPostContentType(plan.row.type),
      contentId: plan.row.id,
      postId: plan.row.id,
      reason: context.reason,
    }),
  );
}
