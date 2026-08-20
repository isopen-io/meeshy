import { describe, it, expect, jest } from '@jest/globals';
import { ReactionService } from '../../../services/ReactionService';
import { MAX_REACTIONS_PER_OBJECT, REACTION_LIMIT_REACHED_MESSAGE } from '@meeshy/shared/utils/reaction-limit';
import { ConflictError } from '../../../errors/custom-errors';

/**
 * Cinq réactions au maximum, par personne et par objet (2026-08-20) — volet
 * messages. La règle elle-même vit dans `packages/shared/utils/reaction-limit.ts`
 * (Task 1) ; ce fichier prouve que `ReactionService.addReaction` l'applique
 * au bon moment : APRÈS avoir vérifié qu'il s'agit d'une création réelle, pas
 * d'un `upsert` qui ne ferait que confirmer un emoji déjà posé (auquel cas
 * aucune place n'est consommée et la personne doit pouvoir reposer l'emoji
 * même au plafond).
 */

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const PARTICIPANT_ID = '507f1f77bcf86cd799439012';

function makePrisma(existingReactionCount: number) {
  return {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: MESSAGE_ID,
        deletedAt: null,
        messageType: 'text',
        conversation: { participants: [{ id: PARTICIPANT_ID }] }
      })
    },
    reaction: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      count: jest.fn<any>().mockResolvedValue(existingReactionCount),
      upsert: jest.fn<any>().mockImplementation(({ create }: any) =>
        Promise.resolve({
          id: 'r-new',
          messageId: MESSAGE_ID,
          participantId: PARTICIPANT_ID,
          emoji: create.emoji,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      ),
      groupBy: jest.fn<any>().mockResolvedValue([])
    },
    $transaction: jest.fn<any>().mockImplementation(async (fn: any) =>
      fn({
        message: { findUnique: jest.fn<any>().mockResolvedValue({ id: MESSAGE_ID }), update: jest.fn<any>() },
        reaction: { groupBy: jest.fn<any>().mockResolvedValue([]) }
      })
    )
  };
}

describe('ReactionService.addReaction — plafond de 5 réactions par personne et par message', () => {
  it(`la ${MAX_REACTIONS_PER_OBJECT}e réaction (nouvel emoji) passe — la personne en a ${MAX_REACTIONS_PER_OBJECT - 1}`, async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT - 1);
    const service = new ReactionService(prisma as any);

    const result = await service.addReaction({
      messageId: MESSAGE_ID,
      participantId: PARTICIPANT_ID,
      emoji: '🎉'
    });

    expect(result?.unchanged).toBe(false);
    expect(prisma.reaction.upsert).toHaveBeenCalledTimes(1);
  });

  it(`la ${MAX_REACTIONS_PER_OBJECT + 1}e réaction (nouvel emoji) est refusée — la personne a déjà ${MAX_REACTIONS_PER_OBJECT} emojis distincts sur ce message`, async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    const service = new ReactionService(prisma as any);

    await expect(
      service.addReaction({
        messageId: MESSAGE_ID,
        participantId: PARTICIPANT_ID,
        emoji: '🎉'
      })
    ).rejects.toThrow(REACTION_LIMIT_REACHED_MESSAGE);

    // Un refus légitime, pas une panne : les routes REST (`routes/reactions.ts`,
    // `routes/conversations/messages-advanced.ts`) trient sur `instanceof
    // ConflictError` pour répondre 409 plutôt que de retomber sur leur 500
    // générique. Une `Error` nue ne franchirait pas ce tri.
    await expect(
      service.addReaction({
        messageId: MESSAGE_ID,
        participantId: PARTICIPANT_ID,
        emoji: '🎉'
      })
    ).rejects.toBeInstanceOf(ConflictError);

    expect(prisma.reaction.upsert).not.toHaveBeenCalled();
  });

  it('reposer un émoji déjà présent passe MÊME au plafond — un upsert qui ne fait que confirmer ne consomme aucune place', async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    prisma.reaction.findFirst.mockResolvedValue({
      id: 'r-existing',
      messageId: MESSAGE_ID,
      participantId: PARTICIPANT_ID,
      emoji: '👍',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const service = new ReactionService(prisma as any);

    const result = await service.addReaction({
      messageId: MESSAGE_ID,
      participantId: PARTICIPANT_ID,
      emoji: '👍'
    });

    expect(result?.unchanged).toBe(true);
    expect(prisma.reaction.upsert).not.toHaveBeenCalled();
    // Le décompte n'a même pas besoin d'être consulté : la décision de
    // plafond ne s'applique qu'à une création réelle.
    expect(prisma.reaction.count).not.toHaveBeenCalled();
  });

  it('retirer une réaction libère une place — removeReaction ne consulte aucun plafond et supprime la ligne', async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    prisma.reaction.deleteMany = jest.fn<any>().mockResolvedValue({ count: 1 });
    const service = new ReactionService(prisma as any);

    const removed = await service.removeReaction({
      messageId: MESSAGE_ID,
      participantId: PARTICIPANT_ID,
      emoji: '👍'
    });

    expect(removed).toBe(true);
    expect(prisma.reaction.deleteMany).toHaveBeenCalledWith({
      where: { messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '👍' }
    });
  });
});
