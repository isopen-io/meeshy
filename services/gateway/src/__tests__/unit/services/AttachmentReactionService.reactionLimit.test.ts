/**
 * Cinq réactions au maximum, par personne et par objet (2026-08-20) — volet
 * pièces jointes. Miroir de `ReactionService.reactionLimit.test.ts` :
 * `AttachmentReactionService.addAttachmentReaction` doit appliquer la règle
 * déclarée dans `packages/shared/utils/reaction-limit.ts` APRÈS avoir vérifié
 * qu'il s'agit d'une création réelle — un `upsert` qui ne fait que confirmer
 * un emoji déjà posé (`previous` non nul) ne consomme aucune place et doit
 * donc passer même au plafond.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { AttachmentReactionService } from '../../../services/AttachmentReactionService';
import { MAX_REACTIONS_PER_OBJECT, REACTION_LIMIT_REACHED_MESSAGE } from '@meeshy/shared/utils/reaction-limit';
import { ConflictError } from '../../../errors/custom-errors';

const ATTACH_ID = 'attach-001';
const MSG_ID = 'msg-001';
const PARTICIPANT_ID = 'user-001';

function makePrisma(existingReactionCount: number) {
  return {
    attachmentReaction: {
      findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
      count: (jest.fn() as jest.Mock<any>).mockResolvedValue(existingReactionCount),
      deleteMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 0 }),
      upsert: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
    },
    message: {
      // Message vivant dans une conversation ouverte : la garde d'admission
      // d'écriture (parité `ReactionService.addReaction`) le laisse passer, si
      // bien que ces témoins exercent bien la règle du PLAFOND.
      findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue({
        deletedAt: null,
        messageType: 'text',
        conversation: { isActive: true, closedAt: null },
      }),
    },
  } as any;
}

describe('AttachmentReactionService.addAttachmentReaction — plafond de 5 réactions par personne et par pièce jointe', () => {
  it(`la ${MAX_REACTIONS_PER_OBJECT}e réaction (nouvel emoji) passe — la personne en a ${MAX_REACTIONS_PER_OBJECT - 1}`, async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT - 1);
    const svc = new AttachmentReactionService(prisma);

    const result = await svc.addAttachmentReaction({
      attachmentId: ATTACH_ID,
      messageId: MSG_ID,
      participantId: PARTICIPANT_ID,
      emoji: '🎉',
    });

    expect(result).toEqual({ changed: true });
    expect(prisma.attachmentReaction.upsert).toHaveBeenCalledTimes(1);
  });

  it(`la ${MAX_REACTIONS_PER_OBJECT + 1}e réaction (nouvel emoji) est refusée — la personne a déjà ${MAX_REACTIONS_PER_OBJECT} emojis distincts sur cette pièce jointe`, async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    const svc = new AttachmentReactionService(prisma);

    await expect(
      svc.addAttachmentReaction({
        attachmentId: ATTACH_ID,
        messageId: MSG_ID,
        participantId: PARTICIPANT_ID,
        emoji: '🎉',
      })
    ).rejects.toThrow(REACTION_LIMIT_REACHED_MESSAGE);

    expect(prisma.attachmentReaction.upsert).not.toHaveBeenCalled();
  });

  it('refuse avec un ConflictError — même mécanisme que les autres objets réagissables (messages, posts, commentaires)', async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    const svc = new AttachmentReactionService(prisma);

    await expect(
      svc.addAttachmentReaction({
        attachmentId: ATTACH_ID,
        messageId: MSG_ID,
        participantId: PARTICIPANT_ID,
        emoji: '🎉',
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('reposer un émoji déjà présent passe MÊME au plafond — un upsert qui ne fait que confirmer ne consomme aucune place', async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    prisma.attachmentReaction.findUnique.mockResolvedValue({ emoji: '👍' });
    const svc = new AttachmentReactionService(prisma);

    const result = await svc.addAttachmentReaction({
      attachmentId: ATTACH_ID,
      messageId: MSG_ID,
      participantId: PARTICIPANT_ID,
      emoji: '👍',
    });

    expect(result).toEqual({ changed: false });
    expect(prisma.attachmentReaction.upsert).not.toHaveBeenCalled();
    // La décision de plafond ne s'applique qu'à une création réelle.
    expect(prisma.attachmentReaction.count).not.toHaveBeenCalled();
  });

  it('retirer une réaction libère une place — removeAttachmentReaction ne consulte aucun plafond et supprime la ligne', async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    prisma.attachmentReaction.deleteMany.mockResolvedValue({ count: 1 });
    const svc = new AttachmentReactionService(prisma);

    const removed = await svc.removeAttachmentReaction({
      attachmentId: ATTACH_ID,
      participantId: PARTICIPANT_ID,
      emoji: '👍',
    });

    expect(removed).toBe(true);
    expect(prisma.attachmentReaction.deleteMany).toHaveBeenCalledWith({
      where: { attachmentId: ATTACH_ID, participantId: PARTICIPANT_ID, emoji: '👍' },
    });
  });
});
