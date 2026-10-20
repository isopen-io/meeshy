/**
 * Le retrait d'un contenu par un TIERS depuis l'app (#11149) — site UNIQUE des
 * trois chemins (message, publication, commentaire).
 *
 * - le MOTIF : exigé du tiers, nettoyé, 3 à 500 caractères, sinon
 *   `400 MODERATION_REASON_REQUIRED` ;
 * - la TRACE : une ligne `AdminAuditLog` `REMOVE_CONTENT` (le post garde la
 *   sienne, `DELETE_POST`, écrite par `applyPostRemovalEffects` avec le motif) ;
 * - la NOTIFICATION `content_removed`, à l'AUTEUR seul, composée dans sa langue
 *   de cadrage (`utils/recipient-language.ts`). Ni le contenu retiré ni
 *   l'identité du modérateur n'y voyagent : aucun `actor`, aucun extrait.
 *
 * Trace et notification sont best-effort : le contenu est déjà retiré quand
 * elles partent, et leur échec ne doit pas changer la réponse.
 */

import { z } from 'zod';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ContentRemovedNotificationMetadata, RemovedContentType } from '@meeshy/shared/types/notification';
import { notificationString, type NotificationStringKey } from '@meeshy/shared/utils/notification-strings';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import type { NotificationService } from '../notifications/NotificationService';
import { getSharedNotificationService } from '../notifications/notification-service-registry';

const log = enhancedLogger.child({ module: 'contentRemoval' });

export const MODERATION_REASON_MIN = 3;
export const MODERATION_REASON_MAX = 500;
export const MODERATION_REASON_REQUIRED = 'MODERATION_REASON_REQUIRED';
export const MODERATION_REASON_MESSAGE = `Un motif de ${MODERATION_REASON_MIN} à ${MODERATION_REASON_MAX} caractères est requis pour retirer le contenu d'un autre`;

const moderationReasonSchema = z.object({
  reason: z.string().trim().min(MODERATION_REASON_MIN).max(MODERATION_REASON_MAX),
});

/** Le motif nettoyé, ou `null` quand il manque ou sort des bornes. */
export function moderationReasonOf(body: unknown): string | null {
  const parsed = moderationReasonSchema.safeParse(body ?? {});
  return parsed.success ? parsed.data.reason : null;
}

/** Le `contentType` d'une publication retirée. Un STATUS (humeur) est une publication. */
export function removedPostContentType(postType: string | null | undefined): 'post' | 'reel' | 'story' {
  if (postType === 'REEL') return 'reel';
  if (postType === 'STORY') return 'story';
  return 'post';
}

export type ContentRemovalAudit = {
  readonly actorUserId: string;
  /** `null` pour un expéditeur anonyme : la ligne se rattache alors à l'acteur. */
  readonly authorUserId: string | null | undefined;
  readonly entity: 'Message' | 'Post' | 'Comment';
  readonly entityId: string;
  readonly reason: string;
};

export async function recordContentRemoval(
  prisma: Pick<PrismaClient, 'adminAuditLog'>,
  audit: ContentRemovalAudit,
): Promise<void> {
  const metadata = audit.authorUserId
    ? { reason: audit.reason, via: 'app' }
    : { reason: audit.reason, via: 'app', anonymousAuthor: true };
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId: audit.actorUserId,
        userId: audit.authorUserId || audit.actorUserId,
        action: 'REMOVE_CONTENT',
        entity: audit.entity,
        entityId: audit.entityId,
        metadata: JSON.stringify(metadata),
      },
    });
  } catch (error) {
    log.warn('content removal: audit log write failed', { entity: audit.entity, entityId: audit.entityId, error });
  }
}

export type ContentRemovalNotice = {
  readonly authorUserId: string | null | undefined;
  readonly contentType: RemovedContentType;
  readonly contentId: string;
  readonly conversationId?: string;
  readonly conversationTitle?: string | null;
  readonly postId?: string;
  readonly reason: string;
};

type Notifier = Pick<NotificationService, 'createNotification'>;

export type ContentRemovalNotifyDeps = {
  readonly prisma: Pick<PrismaClient, 'user'>;
  readonly notifications?: Notifier;
};

const TITLE_KEY: Readonly<Record<RemovedContentType, NotificationStringKey>> = {
  message: 'moderation.removedMessage',
  post: 'moderation.removedPost',
  reel: 'moderation.removedReel',
  story: 'moderation.removedStory',
  comment: 'moderation.removedComment',
};

const titleOf = (lang: string, notice: ContentRemovalNotice): string =>
  notice.contentType === 'message' && notice.conversationTitle
    ? notificationString(lang, 'moderation.removedMessageIn', { title: notice.conversationTitle })
    : notificationString(lang, TITLE_KEY[notice.contentType]);

const metadataOf = (notice: ContentRemovalNotice): ContentRemovedNotificationMetadata => ({
  contentType: notice.contentType,
  contentId: notice.contentId,
  ...(notice.conversationId ? { conversationId: notice.conversationId } : {}),
  ...(notice.conversationTitle ? { conversationTitle: notice.conversationTitle } : {}),
  ...(notice.postId ? { postId: notice.postId } : {}),
  reason: notice.reason,
});

export async function notifyContentRemoved(
  deps: ContentRemovalNotifyDeps,
  notice: ContentRemovalNotice,
): Promise<void> {
  const authorUserId = notice.authorUserId;
  const notifications = deps.notifications ?? getSharedNotificationService();
  if (!authorUserId || !notifications) return;
  try {
    const recipient = await deps.prisma.user.findUnique({ where: { id: authorUserId }, select: RECIPIENT_LANG_SELECT });
    const lang = recipientLanguage(recipient, 'fr');
    await notifications.createNotification({
      userId: authorUserId,
      type: 'content_removed',
      priority: 'normal',
      lang,
      title: titleOf(lang, notice),
      content: notificationString(lang, 'moderation.reason', { preview: notice.reason }),
      context: {
        ...(notice.conversationId ? { conversationId: notice.conversationId } : {}),
        ...(notice.conversationTitle ? { conversationTitle: notice.conversationTitle } : {}),
        ...(notice.postId ? { postId: notice.postId } : {}),
      },
      metadata: metadataOf(notice),
    });
  } catch (error) {
    log.warn('content removal: author notification failed', { contentType: notice.contentType, contentId: notice.contentId, error });
  }
}

export type ModeratedMessageRemoval = {
  readonly actorUserId: string;
  readonly authorUserId: string | null | undefined;
  readonly messageId: string;
  readonly conversationId: string;
  readonly reason: string;
};

/**
 * Ce qu'un retrait de message par un tiers doit APRÈS l'écriture, une fois pour
 * les trois transports : la trace, puis la notification à l'auteur, nommant la
 * conversation (qu'il connaît — il en est membre). Ne lève jamais.
 */
export async function completeModeratedMessageRemoval(
  deps: { readonly prisma: Pick<PrismaClient, 'adminAuditLog' | 'user' | 'conversation'>; readonly notifications?: Notifier },
  removal: ModeratedMessageRemoval,
): Promise<void> {
  await recordContentRemoval(deps.prisma, {
    actorUserId: removal.actorUserId,
    authorUserId: removal.authorUserId,
    entity: 'Message',
    entityId: removal.messageId,
    reason: removal.reason,
  });
  const conversationTitle = await deps.prisma.conversation
    .findUnique({ where: { id: removal.conversationId }, select: { title: true } })
    .then((row) => row?.title ?? null)
    .catch(() => null);
  await notifyContentRemoved(deps, {
    authorUserId: removal.authorUserId,
    contentType: 'message',
    contentId: removal.messageId,
    conversationId: removal.conversationId,
    conversationTitle,
    reason: removal.reason,
  });
}
