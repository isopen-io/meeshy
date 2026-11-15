/**
 * **REJOINDRE et CRÉER sont deux gestes, pas un** (#5940).
 *
 * `conversationsRejointes` comptait TOUTES les participations de l'utilisateur,
 * hors types `global` / `public`. Elle incluait donc :
 *
 *   · les conversations dont il est CRÉATEUR — il y est participant, elles
 *     comptaient une seconde fois sous un verbe qui dit le contraire ;
 *   · les conversations à DEUX (`direct`) — ouvrir un tête-à-tête n'est pas
 *     rejoindre un cercle.
 *
 * Un seul geste — créer un groupe — faisait donc avancer `conversation.create.count`
 * ET `conversation.join.count`. Les défis « rejoindre N conversations » se
 * débloquaient sans qu'on ait rejoint quoi que ce soit.
 *
 * Directive porteur 2026-09-10 : « rejoindre une conversation, c'est quand on
 * n'est pas créateur, et on parle des conversations autres que les
 * conversations à deux ».
 *
 * **Ce témoin porte sur le `where` remis à Prisma**, pas sur un compte final :
 * c'est la CLAUSE qui portait le défaut, et c'est elle qui peut régresser sans
 * qu'aucun chiffre ne bouge sur un jeu de données trop pauvre.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CerclesAchievements } from '../../../../services/achievements/CerclesAchievements';
import { getSharedNotificationService } from '../../../../services/notifications/notification-service-registry';

jest.mock('../../../../services/notifications/notification-service-registry');
jest.mock('../../../../services/notifications/NotificationService');

const mockGetShared = getSharedNotificationService as jest.MockedFunction<
  typeof getSharedNotificationService
>;

type WhereClause = Record<string, unknown>;

describe('conversation.join ne compte ni ce qu\'on a créé ni les tête-à-tête (#5940)', () => {
  let clauses: WhereClause[];
  let prisma: PrismaClient;

  beforeEach(() => {
    mockGetShared.mockReturnValue({ createNotification: jest.fn().mockResolvedValue({}) } as never);
    clauses = [];
    prisma = {
      participant: {
        count: jest.fn(async (args: { where: WhereClause }) => {
          clauses.push(args.where);
          return 0;
        }),
      },
      engagementMilestone: {
        findMany: jest.fn(async () => []),
        create: jest.fn(async () => ({})),
      },
      user: { findUnique: jest.fn(async () => null) },
    } as unknown as PrismaClient;
  });

  /** La clause du VOLUME rejoint — celle qui interroge `userId` sans conversationId. */
  const clauseDuVolume = (): WhereClause | undefined =>
    clauses.find((c) => 'userId' in c && !('conversationId' in c));

  it('exclut les conversations dont l\'utilisateur est CRÉATEUR', async () => {
    const cercles = new CerclesAchievements(prisma);
    await cercles.recordEvent({ kind: 'conversation.join', userId: 'u1', conversationId: 'c1' });

    const where = clauseDuVolume();
    expect(where).toBeDefined();
    expect(where).toMatchObject({ role: { not: 'creator' } });
  });

  it('exclut les conversations à DEUX', async () => {
    const cercles = new CerclesAchievements(prisma);
    await cercles.recordEvent({ kind: 'conversation.join', userId: 'u1', conversationId: 'c1' });

    const where = clauseDuVolume();
    const conversation = (where?.conversation ?? {}) as { type?: { notIn?: string[] } };
    expect(conversation.type?.notIn).toContain('direct');
  });

  /** Les exclusions d'origine tiennent : une régression ne doit pas les emporter. */
  it('garde les exclusions historiques global / public', async () => {
    const cercles = new CerclesAchievements(prisma);
    await cercles.recordEvent({ kind: 'conversation.join', userId: 'u1', conversationId: 'c1' });

    const conversation = (clauseDuVolume()?.conversation ?? {}) as { type?: { notIn?: string[] } };
    expect(conversation.type?.notIn).toEqual(expect.arrayContaining(['global', 'public']));
  });

  /** CRÉER garde sa propre mesure, et elle ne bouge pas. */
  it('créer compte toujours le rôle de créateur, lui', async () => {
    const cercles = new CerclesAchievements(prisma);
    await cercles.recordEvent({ kind: 'conversation.create', userId: 'u1' });

    expect(clauses.some((c) => c.role === 'creator')).toBe(true);
  });
});

/**
 * **La jumelle ne peut plus diverger** (#5940).
 *
 * `AchievementReachService` tenait sa PROPRE copie de la liste d'exclusions —
 * `['global', 'public']` — pendant que `CerclesAchievements` tenait la sienne.
 * Les deux mesurent la même famille `conversation.join` : l'une son VOLUME
 * (« combien en ai-je rejoint »), l'autre son AMPLEUR atteignable (« jusqu'où
 * peut aller une conversation qu'on rejoint »). Deux listes homonymes qui
 * divergent font répondre les deux questions sur des ensembles différents, et
 * **rien ne le signale** : aucun compte ne bouge, aucun témoin ne rougit.
 *
 * La constante est désormais IMPORTÉE. Ce témoin garde le fait qu'elle atteint
 * bien la requête — une importation qu'on cesse d'employer ne casse rien.
 */
describe('l\'ampleur atteignable exclut la même chose que le volume (#5940)', () => {
  it('le groupBy d\'ampleur exclut les tête-à-tête, comme le volume', async () => {
    const { AchievementReachService } = await import(
      '../../../../services/achievements/AchievementReachService'
    );

    let where: { conversation?: { type?: { notIn?: string[] } } } | undefined;
    const prisma = {
      participant: {
        groupBy: jest.fn(async (args: { where: typeof where }) => {
          where = args.where;
          return [];
        }),
      },
      communityMember: { groupBy: jest.fn(async () => []) },
      callParticipant: { groupBy: jest.fn(async () => []) },
      userEngagementStreak: { aggregate: jest.fn(async () => ({ _max: { longest: 0 } })) },
      user: { aggregate: jest.fn(async () => ({ _max: { meeshBalance: 0 } })) },
    } as unknown as PrismaClient;

    await new AchievementReachService(prisma).load();

    expect(where?.conversation?.type?.notIn).toContain('direct');
    expect(where?.conversation?.type?.notIn).toEqual(
      expect.arrayContaining(['global', 'public']),
    );
  });
});
