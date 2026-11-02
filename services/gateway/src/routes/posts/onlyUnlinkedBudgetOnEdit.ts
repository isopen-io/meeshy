import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ChosenLinkDb } from '../../services/posts/chosenRecipientLinks';
import { spendOnlyUnlinkedBudget, type OnlyUnlinkedVerdict } from './onlyUnlinkedBudget';

/**
 * #14105 — à l'édition, seuls les choisis AJOUTÉS à un post ONLY original comptent
 * au plafond des choisis sans lien ; une liste EXCEPT qui devient ONLY n'était
 * pas une liste de choisis. Une republication aussi : à l'édition, sa liste est
 * celle que l'auteur écrit, plus celle de sa source.
 */
export async function spendOnlyUnlinkedBudgetOnEdit(
  fastify: FastifyInstance,
  prisma: ChosenLinkDb & Pick<PrismaClient, 'post'>,
  params: { postId: string; authorId: string; update: { visibility?: string; visibilityUserIds?: string[] } }
): Promise<OnlyUnlinkedVerdict> {
  const allowed = { allowed: true, retryAfter: 0, unlinked: 0 };
  if (params.update.visibility === undefined && params.update.visibilityUserIds === undefined) return allowed;
  const stored = await prisma.post.findFirst({
    where: { id: params.postId, authorId: params.authorId },
    select: { visibility: true, visibilityUserIds: true },
  });
  const visibility = params.update.visibility ?? stored?.visibility;
  if (!stored || visibility !== 'ONLY') return allowed;
  const storedChosen = stored.visibility === 'ONLY' ? stored.visibilityUserIds ?? [] : [];
  return spendOnlyUnlinkedBudget({
    fastify,
    prisma,
    authorId: params.authorId,
    chosenIds: params.update.visibilityUserIds ?? storedChosen,
    previouslyChosen: storedChosen,
  });
}
