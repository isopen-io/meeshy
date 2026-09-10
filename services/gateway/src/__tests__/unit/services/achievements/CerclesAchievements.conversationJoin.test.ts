/**
 * #5940 — « Rejoindre une conversation » comptait aussi celles qu'on a
 * CRÉÉES et les tête-à-tête.
 *
 * `conversationsRejointes` comptait TOUTE participation hors conversations
 * générales : un utilisateur qui CRÉE un groupe (rôle `creator`, déjà compté
 * par `conversation.create.count`) ou qui ouvre un tête-à-tête (`direct`,
 * personne à « rejoindre ») faisait progresser un défi qui nomme l'inverse de
 * ce qui s'est passé. Ce témoin rejoue le cas exact du critère de fin de
 * l'issue : un compte qui a créé une conversation, ouvert un DM, et rejoint
 * un groupe ne doit compter QU'UNE conversation rejointe.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CerclesAchievements } from '../../../../services/achievements/CerclesAchievements';

jest.mock('../../../../services/achievements/AchievementAnnounce', () => ({
  graveEtAnnonce: jest.fn().mockResolvedValue(undefined),
}));

import { graveEtAnnonce } from '../../../../services/achievements/AchievementAnnounce';

const mockGraveEtAnnonce = graveEtAnnonce as jest.MockedFunction<typeof graveEtAnnonce>;

type ParticipantRow = {
  userId: string;
  role: string;
  conversation: { type: string };
};

/**
 * Rejoue le `where` de `participant.count` contre un jeu de lignes fixé,
 * au lieu de rendre une valeur canée — sans quoi le témoin resterait vert
 * sur la requête fautive d'avant #5940 (règle du CLAUDE.md gateway : « un
 * témoin qui ne peut pas tomber n'est pas un témoin »).
 */
function makePrismaWithFixtures(rows: readonly ParticipantRow[]) {
  const count = jest.fn(async (args: unknown) => {
    const where = (
      args as {
        where: {
          userId: string;
          role?: { not?: string };
          conversation?: { type?: { notIn?: readonly string[] } };
        };
      }
    ).where;

    return rows.filter((r) => {
      if (r.userId !== where.userId) return false;
      if (where.role?.not !== undefined && r.role === where.role.not) return false;
      if (where.conversation?.type?.notIn?.includes(r.conversation.type)) return false;
      return true;
    }).length;
  });

  const prisma = {
    participant: { count },
  } as unknown as PrismaClient;

  return { prisma, count };
}

describe('#5940 — conversationsRejointes exclut le créateur et le tête-à-tête', () => {
  it('compte 1 conversation rejointe pour un compte qui a créé un groupe, ouvert un DM, et rejoint un groupe', async () => {
    const { prisma } = makePrismaWithFixtures([
      { userId: 'u1', role: 'creator', conversation: { type: 'group' } }, // créé — pas rejoint
      { userId: 'u1', role: 'creator', conversation: { type: 'direct' } }, // tête-à-tête — pas rejoint
      { userId: 'u1', role: 'member', conversation: { type: 'group' } }, // rejoint — compte
    ]);

    await new CerclesAchievements(prisma).recordEvent({
      kind: 'conversation.join',
      userId: 'u1',
      conversationId: 'c-group-rejoint',
    });

    const volumeCall = mockGraveEtAnnonce.mock.calls.find(
      ([args]) => args.family.subject === 'conversation' && args.family.verb === 'join' && args.family.scale === 'count',
    );
    expect(volumeCall).toBeDefined();
    expect(volumeCall![0].valeur).toBe(1);
  });

  it('interroge participant.count avec role != creator et conversation.type excluant direct/global/public', async () => {
    const { prisma, count } = makePrismaWithFixtures([]);

    await new CerclesAchievements(prisma).recordEvent({
      kind: 'conversation.join',
      userId: 'u1',
      conversationId: 'c1',
    });

    const volumeCall = count.mock.calls.find(
      ([args]) => (args as { where?: { conversationId?: string } }).where?.conversationId === undefined,
    );
    expect(volumeCall).toBeDefined();
    const where = (volumeCall![0] as { where: { role?: { not?: string }; conversation?: { type?: { notIn?: readonly string[] } } } }).where;
    expect(where.role).toEqual({ not: 'creator' });
    expect(where.conversation?.type?.notIn).toEqual(
      expect.arrayContaining(['global', 'public', 'direct']),
    );
  });
});
