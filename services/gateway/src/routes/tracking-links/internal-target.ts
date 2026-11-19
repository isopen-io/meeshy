import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { mayConsumePost } from '../posts/postConsumptionGate';
import { isBlockedWithContentAuthors } from '../../services/posts/contentAuthorBlock';
import { NOT_DELETED } from '../../services/posts/postIncludes';
import { isPostWebType, postWebUrl } from '../../services/posts/postWebUrl';
import { verdictAccesConversation } from '../conversations/utils/access-control';
import type { UnifiedAuthContext } from '../../middleware/auth';

/**
 * Les cibles MEESHY qu'un lien de suivi peut viser (#19418) — planche
 * Lien-Suivi-Creer. `EXTERNAL` n'en est pas : une adresse externe passe par
 * `originalUrl`, comme avant.
 */
export const INTERNAL_TRACKING_TARGET_TYPES = ['POST', 'REEL', 'STORY', 'STATUS', 'CONVERSATION', 'PROFILE'] as const;
export type InternalTrackingTargetType = (typeof INTERNAL_TRACKING_TARGET_TYPES)[number];

export type InternalTrackingTarget = {
  readonly targetType: InternalTrackingTargetType;
  readonly targetId: string;
};

/**
 * L'adresse que la passerelle compose pour une cible que l'appelant a le droit
 * de PARTAGER, ou `null` — cible absente et cible refusée ne se distinguent pas.
 *
 * - PROFILE : sa propre vitrine, jamais celle d'un autre ;
 * - CONVERSATION : une conversation dont il est membre ;
 * - POST/REEL/STORY/STATUS : un contenu non supprimé, du type annoncé, qu'il
 *   peut lire (`mayConsumePost`), sans blocage avec son auteur — les mêmes
 *   gardes que `POST /posts/:postId/share`.
 *
 * L'audience se vérifie AVANT la frappe : un lien est attribuable et
 * persistant, il ne se frappe pas vers ce que son auteur ne peut pas voir.
 */
export async function sharableTargetUrl(
  prisma: PrismaClient,
  authContext: UnifiedAuthContext,
  target: InternalTrackingTarget,
  baseUrl: string
): Promise<string | null> {
  const callerId = authContext.registeredUser?.id;
  if (!callerId) return null;

  if (target.targetType === 'PROFILE') {
    if (target.targetId !== callerId) return null;
    const user = await prisma.user.findUnique({ where: { id: callerId }, select: { username: true } });
    return user?.username ? `${baseUrl}/u/${encodeURIComponent(user.username)}` : null;
  }

  if (target.targetType === 'CONVERSATION') {
    const verdict = await verdictAccesConversation(prisma, authContext, target.targetId, target.targetId);
    return verdict.genre === 'ok' ? `${baseUrl}/c/${target.targetId}` : null;
  }

  const post = await prisma.post.findFirst({
    where: { id: target.targetId, deletedAt: NOT_DELETED },
    select: { type: true }
  });
  if (!post || post.type !== target.targetType || !isPostWebType(post.type)) return null;
  if (!(await mayConsumePost(prisma, target.targetId, callerId))) return null;
  if (await isBlockedWithContentAuthors(prisma, { actorId: callerId, postId: target.targetId })) return null;
  return postWebUrl(baseUrl, post.type, target.targetId);
}
