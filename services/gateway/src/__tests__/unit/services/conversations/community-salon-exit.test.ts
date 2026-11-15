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

const runPendingGuestRevocation = jest.fn<any>(async () => undefined);
jest.mock('../../../../socketio/closeShareLinkRevokingGuests', () => ({
  runWithRetries: (...args: unknown[]) => runPendingGuestRevocation(...args),
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
  readonly liens?: ReadonlyArray<{ readonly id: string; readonly conversationId: string }>;
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
  const liens = monde.liens ?? [];
  const participant = {
    findMany: jest.fn<any>(async (args: any) => lignes
      .filter((l) => (args.where.userId === undefined || l.userId === args.where.userId))
      .filter((l) => (args.where.isActive === undefined || l.isActive === args.where.isActive))
      .filter((l) => (args.where.conversationId === undefined
        || (typeof args.where.conversationId === 'string'
          ? l.conversationId === args.where.conversationId
          : args.where.conversationId.in.includes(l.conversationId))))),
    update: jest.fn<any>(async (args: any) => ({ id: args.where.id })),
    updateMany: jest.fn<any>(async (args: any) => ({ count: args.where.id.in.length })),
  };
  return {
    conversation: {
      findMany: jest.fn<any>(async (args: any) => salons
        .filter((s) => s.communityId === args.where.communityId)
        .filter((s) => args.where.isActive === undefined || (s.isActive ?? true) === args.where.isActive)
        .map((s) => ({ id: s.id, isActive: s.isActive ?? true }))),
    },
    participant,
    conversationShareLink: {
      findMany: jest.fn<any>(async (args: any) => liens
        .filter((l) => l.conversationId === args.where.conversationId)
        .map((l) => ({ id: l.id }))),
      updateMany: jest.fn<any>(async (args: any) => ({ count: args.where.id.in.length })),
    },
    user: { findFirst: jest.fn<any>(async () => null) },
    $transaction: jest.fn<any>(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

const NOW = new Date('2026-11-07T20:00:00.000Z');
const io = { to: jest.fn() };
const manager = { getIO: () => io };
const socketIOHandler = { getManager: () => manager };

// Les annonces partent en arrière-plan : chaque témoin attend les siennes avant
// que le suivant ne remette les doubles à zéro.
const pending: Promise<void>[] = [];
const sortir = async (...args: Parameters<typeof exitCommunitySalons>) => {
  const result = await exitCommunitySalons(...args);
  pending.push(result.announcements);
  return result;
};

beforeEach(async () => {
  await Promise.all(pending.splice(0));
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

const fermees = (prisma: ReturnType<typeof prismaDouble>) =>
  prisma.participant.updateMany.mock.calls.flatMap((c: any) => c[0].where.id.in as string[]);

describe('exitCommunitySalons — le partant sort de chaque salon de la communauté', () => {
  it('coupe SES lignes actives dans les salons de la communauté, en UNE écriture, avec la même date de départ', async () => {
    const prisma = prismaDouble({
      lignes: [
        ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT }),
        ligne({ id: 'p-b', conversationId: SALON_B, userId: PARTANT }),
        ligne({ id: 'p-hors', conversationId: HORS_COMMUNAUTE, userId: PARTANT }),
        ligne({ id: 'r-a', conversationId: SALON_A, userId: RESTANT }),
      ],
    });

    const result = await sortir({ prisma: prisma as never, socketIOHandler: null }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });

    expect([...result.exitedConversationIds].sort()).toEqual([SALON_A, SALON_B].sort());
    expect(prisma.participant.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.participant.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p-a', 'p-b'] }, isActive: true },
      data: { isActive: false, leftAt: NOW },
    });
    expect(fermees(prisma)).not.toContain('p-hors');
    expect(fermees(prisma)).not.toContain('r-a');
  });

  it('un salon CLOS compte aussi : sa ligne se coupe (une archive se lit par la seule ligne Participant), sans avis', async () => {
    const prisma = prismaDouble({
      salons: [{ id: SALON_A, communityId: COMMUNITY, isActive: false }],
      lignes: [ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT, role: 'creator' })],
    });

    const result = await sortir({ prisma: prisma as never, socketIOHandler }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });
    await result.announcements;

    expect(fermees(prisma)).toEqual(['p-a']);
    expect(resoudreSuccessionDuCreateur).not.toHaveBeenCalled();
    expect(postConversationNotice).not.toHaveBeenCalled();
    expect(emitConversationMemberCountEvent).not.toHaveBeenCalled();
  });

  it('lit les salons de la communauté, clos compris', async () => {
    const prisma = prismaDouble({ lignes: [] });
    await sortir({ prisma: prisma as never, socketIOHandler: null }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { communityId: COMMUNITY },
    }));
  });

  it('une communauté sans salon ne lit aucun participant', async () => {
    const prisma = prismaDouble({ salons: [], lignes: [] });
    const result = await sortir({ prisma: prisma as never, socketIOHandler: null }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });
    expect(result.exitedConversationIds).toEqual([]);
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });

  it('l\'accès est coupé AVANT les annonces : l\'écriture est faite quand la route reprend la main', async () => {
    const prisma = prismaDouble({ lignes: [ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT })] });
    const result = await sortir({ prisma: prisma as never, socketIOHandler: null }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });
    expect(prisma.participant.updateMany).toHaveBeenCalledTimes(1);
    expect(postConversationNotice).not.toHaveBeenCalled();
    await result.announcements;
    expect(postConversationNotice).toHaveBeenCalledTimes(1);
  });

  it('dit « Bob a quitté la conversation » dans chaque salon vivant quitté', async () => {
    const prisma = prismaDouble({ lignes: [ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT })] });
    const result = await sortir({ prisma: prisma as never, socketIOHandler: null }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });
    await result.announcements;
    expect(postConversationNotice).toHaveBeenCalledWith(expect.anything(), {
      conversationId: SALON_A,
      notice: { kind: 'member-left', actor: { participantId: 'p-a', displayName: 'Bob' } },
    });
  });

  it('annonce le départ aux restants avec l\'effectif absolu, puis sort le partant des rooms du salon', async () => {
    const prisma = prismaDouble();
    const monde = [ligne({ id: 'r-a', conversationId: SALON_A, userId: RESTANT })];
    prisma.participant.findMany
      .mockImplementationOnce(async () => [ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT })])
      .mockImplementationOnce(async () => monde);

    const result = await sortir({ prisma: prisma as never, socketIOHandler }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });
    await result.announcements;

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

  it('créateur d\'un salon vivant : l\'héritier devient créateur dans la MÊME transaction que le départ', async () => {
    const prisma = prismaDouble({
      lignes: [ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT, role: 'CREATOR' })],
    });
    resoudreSuccessionDuCreateur.mockResolvedValue({ kind: 'transfer', successor: { id: 'r-a', userId: RESTANT } });

    const result = await sortir({ prisma: prisma as never, socketIOHandler }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });
    await result.announcements;

    expect(resoudreSuccessionDuCreateur).toHaveBeenCalledWith(prisma, { conversationId: SALON_A, sortantUserId: PARTANT });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.participant.updateMany).not.toHaveBeenCalled();
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

    const result = await sortir({ prisma: prisma as never, socketIOHandler: null }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });

    expect(result.exitedConversationIds).toEqual([SALON_A]);
    expect(prisma.participant.update).toHaveBeenCalledTimes(1);
    expect(prisma.participant.update).toHaveBeenCalledWith({ where: { id: 'p-a' }, data: { isActive: false, leftAt: NOW } });
  });

  it('créateur sans héritier inscrit : les liens du salon se ferment et se marquent PENDANT la requête, puis leurs invités sont révoqués (#16712)', async () => {
    const prisma = prismaDouble({
      lignes: [ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT, role: 'creator' })],
      liens: [
        { id: 'lien-1', conversationId: SALON_A },
        { id: 'lien-2', conversationId: SALON_A },
        { id: 'lien-b', conversationId: SALON_B },
      ],
    });
    resoudreSuccessionDuCreateur.mockResolvedValue({ kind: 'close' });
    let revocationsAuRetour = -1;

    const result = await sortir({ prisma: prisma as never, socketIOHandler }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });
    revocationsAuRetour = runPendingGuestRevocation.mock.calls.length;
    await result.announcements;

    expect(prisma.conversationShareLink.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.conversationShareLink.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['lien-1', 'lien-2'] } },
      data: { isActive: false, guestRevocationPendingAt: NOW },
    });
    expect(revocationsAuRetour).toBe(0);
    expect(runPendingGuestRevocation.mock.calls.map((c: any) => [c[0].shareLinkId, c[0].pendingSince])).toEqual([
      ['lien-1', NOW],
      ['lien-2', NOW],
    ]);
    expect(runPendingGuestRevocation.mock.calls[0][0]).toEqual(expect.objectContaining({ prisma, io, manager }));
  });

  it('un salon qui a un héritier garde ses liens et ses invités', async () => {
    const prisma = prismaDouble({
      lignes: [ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT, role: 'creator' })],
      liens: [{ id: 'lien-1', conversationId: SALON_A }],
    });
    resoudreSuccessionDuCreateur.mockResolvedValue({ kind: 'transfer', successor: { id: 'r-a', userId: RESTANT } });

    const result = await sortir({ prisma: prisma as never, socketIOHandler }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });
    await result.announcements;

    expect(prisma.conversationShareLink.updateMany).not.toHaveBeenCalled();
    expect(runPendingGuestRevocation).not.toHaveBeenCalled();
  });

  it('un simple membre qui part ne ferme aucun lien', async () => {
    const prisma = prismaDouble({
      lignes: [ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT })],
      liens: [{ id: 'lien-1', conversationId: SALON_A }],
    });

    const result = await sortir({ prisma: prisma as never, socketIOHandler }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });
    await result.announcements;

    expect(prisma.conversationShareLink.updateMany).not.toHaveBeenCalled();
    expect(runPendingGuestRevocation).not.toHaveBeenCalled();
  });

  it('une fermeture de liens qui échoue laisse la sortie écrite et ne rejette pas ; une révocation qui échoue reste marquée pour le balayage', async () => {
    const prisma = prismaDouble({
      lignes: [
        ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT, role: 'creator' }),
        ligne({ id: 'p-b', conversationId: SALON_B, userId: PARTANT, role: 'creator' }),
      ],
      liens: [{ id: 'lien-a', conversationId: SALON_A }, { id: 'lien-b', conversationId: SALON_B }],
    });
    resoudreSuccessionDuCreateur.mockResolvedValue({ kind: 'close' });
    prisma.conversationShareLink.updateMany.mockImplementationOnce(async () => { throw new Error('écriture perdue'); });
    runPendingGuestRevocation.mockImplementationOnce(async () => { throw new Error('registre muet'); });

    const result = await sortir({ prisma: prisma as never, socketIOHandler }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });
    await expect(result.announcements).resolves.toBeUndefined();

    expect(result.exitedConversationIds).toEqual([SALON_A, SALON_B]);
    expect(runPendingGuestRevocation.mock.calls.map((c: any) => c[0].shareLinkId)).toEqual(['lien-b']);
  });

  it('la succession d\'un salon qui échoue n\'empêche pas la sortie des autres', async () => {
    const prisma = prismaDouble({
      lignes: [
        ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT, role: 'creator' }),
        ligne({ id: 'p-b', conversationId: SALON_B, userId: PARTANT }),
      ],
    });
    resoudreSuccessionDuCreateur.mockImplementationOnce(async () => { throw new Error('lecture perdue'); });

    const result = await sortir({ prisma: prisma as never, socketIOHandler: null }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });

    expect(fermees(prisma)).toEqual(['p-b']);
    expect(result.exitedConversationIds).toEqual([SALON_B]);
  });

  it('une annonce qui échoue n\'empêche pas les suivantes, et les annonces ne rejettent jamais', async () => {
    const prisma = prismaDouble({
      lignes: [
        ligne({ id: 'p-a', conversationId: SALON_A, userId: PARTANT }),
        ligne({ id: 'p-b', conversationId: SALON_B, userId: PARTANT }),
      ],
    });
    postConversationNotice.mockImplementationOnce(async () => { throw new Error('avis perdu'); });

    const result = await sortir({ prisma: prisma as never, socketIOHandler: null }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });
    await expect(result.announcements).resolves.toBeUndefined();
    expect(postConversationNotice).toHaveBeenCalledTimes(2);
  });

  it('ne rejette jamais : une lecture des salons perdue laisse la route répondre au départ déjà écrit', async () => {
    const prisma = prismaDouble();
    prisma.conversation.findMany.mockImplementationOnce(async () => { throw new Error('base indisponible'); });

    const result = await sortir({ prisma: prisma as never, socketIOHandler: null }, {
      communityId: COMMUNITY, userId: PARTANT, now: NOW,
    });
    expect(result.exitedConversationIds).toEqual([]);
    await expect(result.announcements).resolves.toBeUndefined();
  });
});
