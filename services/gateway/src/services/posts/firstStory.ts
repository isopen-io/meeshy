import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * **L'EXCEPTION « PREMIÈRE STORY »** (#7907, décision porteur révisée du
 * 2026-09-25) — le SEUL site qui la calcule, lu par la garde de `POST /posts`
 * (`middleware/email-verification-first-story.ts`) ET par `GET /me/onboarding`
 * (`canPublishStory`) : la carte ne promet jamais ce que la garde refuse.
 *
 * Un compte au courriel non vérifié peut publier UNE story. Le compte porte
 * sur TOUTES les stories jamais écrites par l'auteur, supprimées et expirées
 * comprises : `Post.deletedAt` est un effacement doux, et les stories ne sont
 * jamais détruites (`ExpiredStoriesCleanupService` ne balaie que les statuts).
 * Aucun filtre `deletedAt` ni `expiresAt`, donc : supprimer sa story ne
 * rouvre pas le droit. Lecture servie par l'index `[authorId, type, createdAt]`.
 */
export async function hasAuthoredStory(prisma: Pick<PrismaClient, 'post'>, authorId: string): Promise<boolean> {
  const story = await prisma.post.findFirst({ where: { authorId, type: 'STORY' }, select: { id: true } });
  return story !== null;
}

/** La story passera-t-elle la garde du courriel ? Vérifié, OU aucune story encore écrite. */
export function storyPublishable(input: { readonly emailVerified: boolean; readonly hasAuthoredStory: boolean }): boolean {
  return input.emailVerified || !input.hasAuthoredStory;
}
