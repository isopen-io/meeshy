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
  readonly madePrivate?: boolean;
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
    ...(removal.madePrivate ? { madePrivate: true } : {}),
  }).catch((error: unknown) => log.warn('admin removal: author notification failed', { contentId: removal.contentId, error }));
}

/** La forme d'un geste de publication appliqué que ce site lit (`ModerationPlan` des routes admin). */
export type AppliedPostModeration = {
  readonly row: { readonly id: string; readonly authorId: string; readonly type: string | null };
  readonly before: { readonly visibility: string; readonly moderationHiddenAt: Date | null };
  readonly after: { readonly visibility: string; readonly moderationHiddenAt: Date | null } | null;
  readonly copyOf?: string;
};

type Withdrawal = 'taken-offline' | 'made-private' | null;

/**
 * Ce que le geste a retiré à l'audience de l'auteur : la publication mise HORS
 * LIGNE, ou passée en PRIVÉ (décision porteur, #11158) depuis une audience plus
 * large. Ni la copie d'une republication (son auteur n'a rien publié de retiré),
 * ni une remise en ligne, ni un resserrement à FRIENDS / COMMUNITY.
 */
function withdrawalOf(plan: AppliedPostModeration): Withdrawal {
  if (plan.copyOf !== undefined || plan.after === null) return null;
  if (plan.before.moderationHiddenAt === null && plan.after.moderationHiddenAt !== null) return 'taken-offline';
  if (plan.after.moderationHiddenAt === null && plan.after.visibility === 'PRIVATE' && plan.before.visibility !== 'PRIVATE') return 'made-private';
  return null;
}

export function noticeWithdrawals(
  deps: ContentRemovalNotifyDeps,
  applied: readonly AppliedPostModeration[],
  context: { readonly actorUserId: string; readonly reason: string | null | undefined },
): void {
  applied.forEach((plan) => {
    const withdrawal = withdrawalOf(plan);
    if (withdrawal === null) return;
    noticeAdminRemoval(deps, {
      actorUserId: context.actorUserId,
      authorUserId: plan.row.authorId,
      contentType: removedPostContentType(plan.row.type),
      contentId: plan.row.id,
      postId: plan.row.id,
      reason: context.reason,
      madePrivate: withdrawal === 'made-private',
    });
  });
}
