/**
 * #16704 — quitter une communauté privée, ou en être retiré, fait sortir de ses
 * salons. Les portes d'entrée (#16639, #16695) n'admettent dans un salon d'une
 * communauté privée que ce que la communauté admet ; sans la sortie, un ancien
 * membre restait occupant actif de chaque salon et continuait de les lire.
 *
 * Le double honore les `where` que la sortie pose : seules les lignes ACTIVES
 * de la personne, dans les seuls salons de la communauté, sont lues.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const postConversationNotice = jest.fn<any>(async () => null);
jest.mock('../../../../services/conversations/conversationNotice', () => ({
  postConversationNotice: (...args: unknown[]) => postConversationNotice(...args),
  noticeActor: (p: { id: string; displayName: string }) => ({ participantId: p.id, displayName: p.displayName }),
  noticeBroadcast: () => async () => undefined,
}));

const resoudreSuccessionDuCreateur = jest.fn<any>();
jest.mock('../../../../services/conversations/creatorSuccession', () => ({
  resoudreSuccessionDuCreateur: (...args: unknown[]) => resoudreSuccessionDuCreateur(...args),
}));

const endConversationMembership = jest.fn<any>(async () => undefined);
jest.mock('../../../../socketio/endConversationMembership', () => ({
  endConversationMembership: (...args: unknown[]) => endConversationMembership(...args),
}));

const emitConversationMemberCountEvent = jest.fn<any>();
jest.mock('../../../../socketio/emitConversationMemberCount', () => ({
  emitConversationMemberCountEvent: (...args: unknown[]) => emitConversationMemberCountEvent(...args),
}));

const announceParticipantRoleWithCapabilities = jest.fn<any>(async () => undefined);
jest.mock('../../../../services/conversations/obsoleteCapability', () => ({
  announceParticipantRoleWithCapabilities: (...args: unknown[]) => announceParticipantRoleWithCapabilities(...args),
}));

jest.mock('../../../../services/message-translation/conversationLanguageChanges', () => ({
  announceConversationLanguageChange: jest.fn(),
}));

jest.mock('../../../../utils/participant-lookup-cache', () => ({
  invalidateParticipantLookup: jest.fn(),
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

import {
  communityGuardsItsSalons,
  exitCommunitySalons,
} from '../../../../services/conversations/communitySalonExit';

const COMMUNITY = '507f1f77bcf86cd799439044';
const PARTANT = '507f1f77bcf86cd799439033';
const RESTANT = '507f1f77bcf86cd799439022';
const SALON_A = '507f1f77bcf86cd7994390a1';
const SALON_B = '507f1f77bcf86cd7994390b2';
const HORS_COMMUNAUTE = '507f1f77bcf86cd7994390f9';

type Ligne = {
  readonly id: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly role: string;
  readonly isActive: boolean;
  readonly displayName: string;
};

type Monde = {
  readonly salons?: ReadonlyArray<{ readonly id: string; readonly communityId: string; readonly isActive?: boolean }>;
  readonly lignes?: readonly Ligne[];
};

const ligne = (overrides: Partial<Ligne> & Pick<Ligne, 'id' | 'conversationId' | 'userId'>): Ligne => ({
  role: 'member',
  isActive: true,
  displayName: overrides.userId === PARTANT ? 'Bob' : 'Alice',
  ...overrides,
});

function prismaDouble(monde: Monde = {}) {
  const salons = monde.salons ?? [
    { id: SALON_A, communityId: COMMUNITY },
    { id: SALON_B, communityId: COMMUNITY },
    { id: HORS_COMMUNAUTE, communityId: 'autre' },
  ];
  const lignes = monde.lignes ?? [];
  const participant = {
    findMany: jest.fn<any>(async (args: any) => lignes
      .filter((l) => (args.where.userId === undefined || l.userId === args.where.userId))
      .filter((l) => (args.where.isActive === undefined || l.isActive === args.where.isActive))
      .filter((l) => (args.where.conversationId === undefined
        || (typeof args.where.conversationId === 'string'
          ? l.conversationId === args.where.conversationId
          : args.where.conversationId.in.includes(l.conversationId))))),
    update: jest.fn<any>(async (args: any) => ({ id: args.where.id })),
  };
  return {
    conversation: {
      findMany: jest.fn<any>(async (args: any) => salons
        .filter((s) => s.communityId === args.where.communityId)
        .filter((s) => args.where.isActive === undefined || (s.isActive ?? true) === args.where.isActive)
        .map((s) => ({ id: s.id }))),
    },
    participant,
    user: { findFirst: jest.fn<any>(async () => null) },
    $transaction: jest.fn<any>(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

const NOW = new Date('2026-11-07T20:00:00.000Z');
const io = { to: jest.fn() };
const manager = { getIO: () => io };
const socketIOHandler = { getManager: () => manager };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('communityGuardsItsSalons — quelle communauté fait sortir de ses salons', () => {
  it('une communauté privée garde ses salons', () => {
    expect(communityGuardsItsSalons({ isPrivate: true, isActive: true })).toBe(true);
  });

  it('une communauté désactivée se garde comme une privée (#16695)', () => {
    expect(communityGuardsItsSalons({ isPrivate: false, isActive: false })).toBe(true);
  });

  it('une communauté publique vivante laisse ses salons ouverts : quitter la communauté ne fait sortir de rien', () => {
    expect(communityGuardsItsSalons({ isPrivate: false, isActive: true })).toBe(false);
  });

  it('une forme incomplète (champ non lu) ne déclenche rien — les doubles anciens restent publics', () => {
    expect(communityGuardsItsSalons({})).toBe(false);
  });
});

describe('exitCommunitySalons — le partant sort de chaque salon de la communauté', () => {
  it('désactive SES lignes actives dans les salons de la communauté, avec la même date de départ', async () => {
    const prisma = prismaDouble({
      lignes: [
        ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT }),
        ligne({ id: 'p-b', conversationId: SALON_B, userId: PARTANT }),
        ligne({ id: 'p-hors', conversationId: HORS_COMMUNAUTE, userId: PARTANT }),
        ligne({ id: 'r-a', conversationId: SALON_A, userId: RESTANT }),
      ],
    });

    const result = await exitCommunitySalons({ prisma: prisma as never, socketIOHandler: null }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });

    expect(result.exitedConversationIds.sort()).toEqual([SALON_A, SALON_B].sort());
    const updated = prisma.participant.update.mock.calls.map((c: any) => c[0]);
    expect(updated).toEqual(expect.arrayContaining([
      { where: { id: 'p-a' }, data: { isActive: false, leftAt: NOW } },
      { where: { id: 'p-b' }, data: { isActive: false, leftAt: NOW } },
    ]));
    expect(updated.map((u: any) => u.where.id)).not.toContain('p-hors');
    expect(updated.map((u: any) => u.where.id)).not.toContain('r-a');
  });

  it('ne lit les lignes que dans les salons VIVANTS de la communauté (index conversationId)', async () => {
    const prisma = prismaDouble({ lignes: [] });
    await exitCommunitySalons({ prisma: prisma as never, socketIOHandler: null }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { communityId: COMMUNITY, isActive: true },
    }));
  });

  it('une communauté sans salon ne lit aucun participant', async () => {
    const prisma = prismaDouble({ salons: [], lignes: [] });
    const result = await exitCommunitySalons({ prisma: prisma as never, socketIOHandler: null }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });
    expect(result.exitedConversationIds).toEqual([]);
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });

  it('dit « Bob a quitté la conversation » dans chaque salon quitté', async () => {
    const prisma = prismaDouble({ lignes: [ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT })] });
    await exitCommunitySalons({ prisma: prisma as never, socketIOHandler: null }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });
    expect(postConversationNotice).toHaveBeenCalledWith(expect.anything(), {
      conversationId: SALON_A,
      notice: { kind: 'member-left', actor: { participantId: 'p-a', displayName: 'Bob' } },
    });
  });

  it('annonce le départ aux restants avec l\'effectif absolu, puis sort le partant des rooms du salon', async () => {
    const prisma = prismaDouble({
      lignes: [
        ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT }),
        ligne({ id: 'r-a', conversationId: SALON_A, userId: RESTANT }),
      ],
    });
    // Après l'écriture, le partant n'est plus actif : le double relit le monde.
    const monde = [ligne({ id: 'r-a', conversationId: SALON_A, userId: RESTANT })];
    prisma.participant.findMany
      .mockImplementationOnce(async () => [ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT })])
      .mockImplementationOnce(async () => monde);

    await exitCommunitySalons({ prisma: prisma as never, socketIOHandler }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });

    expect(emitConversationMemberCountEvent).toHaveBeenCalledWith(expect.objectContaining({
      io,
      conversationId: SALON_A,
      event: 'conversation:participant-left',
      memberCount: 1,
      payload: {
        conversationId: SALON_A,
        participantId: 'p-a',
        userId: PARTANT,
        displayName: 'Bob',
        leftAt: NOW.toISOString(),
      },
      participants: [...monde, { id: 'p-a', userId: PARTANT }],
    }));
    expect(endConversationMembership).toHaveBeenCalledWith({
      io, manager, conversationId: SALON_A, userId: PARTANT,
    });
  });

  it('créateur d\'un salon : l\'héritier devient créateur dans la MÊME transaction que le départ', async () => {
    const prisma = prismaDouble({
      lignes: [ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT, role: 'CREATOR' })],
    });
    resoudreSuccessionDuCreateur.mockResolvedValue({ kind: 'transfer', successor: { id: 'r-a', userId: RESTANT } });

    await exitCommunitySalons({ prisma: prisma as never, socketIOHandler }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });

    expect(resoudreSuccessionDuCreateur).toHaveBeenCalledWith(prisma, { conversationId: SALON_A, sortantUserId: PARTANT });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const updated = prisma.participant.update.mock.calls.map((c: any) => c[0]);
    expect(updated).toEqual(expect.arrayContaining([
      { where: { id: 'r-a' }, data: { role: 'creator' } },
      { where: { id: 'p-a' }, data: { isActive: false, leftAt: NOW } },
    ]));
    expect(announceParticipantRoleWithCapabilities).toHaveBeenCalledWith(prisma, expect.objectContaining({
      io,
      payload: { conversationId: SALON_A, userId: RESTANT, newRole: 'creator', updatedBy: PARTANT },
    }));
  });

  it('créateur seul dans son salon : il en sort quand même, sans héritier ni clôture', async () => {
    const prisma = prismaDouble({
      lignes: [ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT, role: 'creator' })],
    });
    resoudreSuccessionDuCreateur.mockResolvedValue({ kind: 'close' });

    const result = await exitCommunitySalons({ prisma: prisma as never, socketIOHandler: null }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });

    expect(result.exitedConversationIds).toEqual([SALON_A]);
    expect(prisma.participant.update).toHaveBeenCalledTimes(1);
    expect(prisma.participant.update).toHaveBeenCalledWith({ where: { id: 'p-a' }, data: { isActive: false, leftAt: NOW } });
  });

  it('un salon qui échoue n\'empêche pas la sortie des autres', async () => {
    const prisma = prismaDouble({
      lignes: [
        ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT }),
        ligne({ id: 'p-b', conversationId: SALON_B, userId: PARTANT }),
      ],
    });
    prisma.participant.update.mockImplementationOnce(async () => { throw new Error('écriture perdue'); });

    const result = await exitCommunitySalons({ prisma: prisma as never, socketIOHandler: null }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });

    expect(prisma.participant.update).toHaveBeenCalledTimes(2);
    expect(result.exitedConversationIds).toHaveLength(1);
  });

  it('ne rejette jamais : une lecture des salons perdue laisse la route répondre au départ déjà écrit', async () => {
    const prisma = prismaDouble();
    prisma.conversation.findMany.mockImplementationOnce(async () => { throw new Error('base indisponible'); });

    await expect(exitCommunitySalons({ prisma: prisma as never, socketIOHandler: null }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    })).resolves.toEqual({ exitedConversationIds: [] });
  });
});
