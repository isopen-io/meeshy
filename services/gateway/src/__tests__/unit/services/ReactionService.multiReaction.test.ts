import { describe, it, expect, jest } from '@jest/globals';
import { ReactionService } from '../../../services/ReactionService';

/**
 * Multi-réactions (chantier Focal, feu vert user 2026-08-16) : un participant
 * peut empiler PLUSIEURS emojis distincts sur le même message. La clé unique
 * DB passe de (messageId, participantId) à (messageId, participantId, emoji) ;
 * `addReaction` devient ADDITIF (plus jamais de swap — `replacedEmojis`
 * disparaît du contrat), le toggle vit chez les clients qui appellent
 * `removeReaction` sur un emoji déjà posé.
 */

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const PARTICIPANT_ID = '507f1f77bcf86cd799439012';

function makePrisma() {
  const tx = {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: MESSAGE_ID }),
      update: jest.fn<any>().mockResolvedValue({})
    },
    reaction: {
      groupBy: jest.fn<any>().mockResolvedValue([])
    }
  };
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
      count: jest.fn<any>().mockResolvedValue(0),
      upsert: jest.fn<any>().mockImplementation(({ create }: any) =>
        Promise.resolve({
          id: 'r2',
          messageId: MESSAGE_ID,
          participantId: PARTICIPANT_ID,
          emoji: create.emoji,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      ),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      groupBy: jest.fn<any>()
    },
    $transaction: jest.fn<any>().mockImplementation(async (fn: any) => fn(tx))
  };
}

describe('ReactionService — multi-réactions (un participant, plusieurs emojis)', () => {
  it("poser un SECOND emoji n'écrase jamais le premier : upsert sur la clé TRIPLE, aucun retrait, aucun champ de swap", async () => {
    const prisma = makePrisma();
    const service = new ReactionService(prisma as any);

    const result = await service.addReaction({
      messageId: MESSAGE_ID,
      participantId: PARTICIPANT_ID,
      emoji: '❤️'
    });

    expect(prisma.reaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          participant_reaction_unique: {
            messageId: MESSAGE_ID,
            participantId: PARTICIPANT_ID,
            emoji: '❤️'
          }
        }
      })
    );
    expect(prisma.reaction.deleteMany).not.toHaveBeenCalled();
    expect(result?.unchanged).toBe(false);
    expect(result && 'replacedEmojis' in result).toBe(false);
  });

  it('reposer le MÊME emoji est un no-op signalé (unchanged) — jamais un doublon ni une réécriture', async () => {
    const prisma = makePrisma();
    prisma.reaction.findFirst.mockResolvedValue({
      id: 'r1',
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
  });

  it("la détection du no-op se fait sur la clé TRIPLE : l'emoji ❤️ déjà posé ne bloque pas l'ajout de 👍", async () => {
    const prisma = makePrisma();
    prisma.reaction.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.emoji === '❤️'
          ? { id: 'r1', messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '❤️', createdAt: new Date(), updatedAt: new Date() }
          : null
      )
    );
    const service = new ReactionService(prisma as any);

    const result = await service.addReaction({
      messageId: MESSAGE_ID,
      participantId: PARTICIPANT_ID,
      emoji: '👍'
    });

    expect(result?.unchanged).toBe(false);
    expect(prisma.reaction.upsert).toHaveBeenCalledTimes(1);
  });

  it('le retrait reste PAR emoji : retirer ❤️ ne touche jamais les autres emojis du participant', async () => {
    const prisma = makePrisma();
    const service = new ReactionService(prisma as any);

    await service.removeReaction({
      messageId: MESSAGE_ID,
      participantId: PARTICIPANT_ID,
      emoji: '❤️'
    });

    expect(prisma.reaction.deleteMany).toHaveBeenCalledWith({
      where: { messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '❤️' }
    });
  });
});
