/**
 * #9584 — retirer un commentaire reprend ce qu'il a rapporté, mais jamais à
 * quelqu'un d'autre que son auteur, et jamais pour la décision d'un tiers.
 * Supprimer son commentaire emporte les réponses des AUTRES : elles
 * disparaissent, mais leurs auteurs gardent leurs points
 * (`removalReclaimsAuthorCredits`, choix soumis au porteur).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { PostCommentService } from '../../../../services/PostCommentService';
import { removalReclaimsAuthorCredits } from '../../../../services/posts/postEngagementCredits';

jest.mock('../../../../services/posts/retractCommentNotifications', () => ({
  retractCommentNotifications: jest.fn<any>().mockResolvedValue(undefined),
}));

const COMMENTER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439012';
const COMMENT = '507f1f77bcf86cd7994390c1';
const REPLY_BY_OTHER = '507f1f77bcf86cd7994390c2';
const REPLY_BY_SELF = '507f1f77bcf86cd7994390c3';

function setup() {
  const recorder = {
    recordActivity: jest.fn<any>().mockResolvedValue(undefined),
    reclaimContent: jest.fn<any>().mockResolvedValue(0),
    reclaimSource: jest.fn<any>().mockResolvedValue(0),
  };
  const levels = [[{ id: REPLY_BY_OTHER, authorId: OTHER }, { id: REPLY_BY_SELF, authorId: COMMENTER }], []];
  const prisma = {
    postComment: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: COMMENT, authorId: COMMENTER, postId: 'post-1', parentId: null }),
      findMany: jest.fn(async () => levels.shift() ?? []),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 3 }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    post: { update: jest.fn<any>().mockResolvedValue({}) },
  };
  const service = new PostCommentService(prisma as never, undefined, recorder);
  return { service, recorder };
}

describe('retirer son commentaire — à qui la reprise s’applique', () => {
  it('reprend SES crédits — le commentaire et sa propre réponse — jamais ceux d’une réponse d’un autre qu’il emporte', async () => {
    const { service, recorder } = setup();

    await service.deleteComment(COMMENT, COMMENTER, undefined);

    expect(recorder.reclaimSource.mock.calls).toEqual([
      [COMMENTER, `comment:${COMMENT}`, {}],
      [COMMENTER, `comment:${REPLY_BY_SELF}`, {}],
    ]);
  });

  it('la règle, isolée : l’auteur pour son propre retrait, quiconque sous modération, jamais pour la décision d’un tiers', () => {
    expect(removalReclaimsAuthorCredits({ removedBy: COMMENTER, authorId: COMMENTER, byModeration: false })).toBe(true);
    expect(removalReclaimsAuthorCredits({ removedBy: 'moderator', authorId: COMMENTER, byModeration: true })).toBe(true);
    expect(removalReclaimsAuthorCredits({ removedBy: OTHER, authorId: COMMENTER, byModeration: false })).toBe(false);
  });
});
