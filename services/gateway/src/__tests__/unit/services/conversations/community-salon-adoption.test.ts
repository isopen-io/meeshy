/**
 * #16723 — une communauté qui devient privée ne laisse plus de non-membres
 * dans ses salons. Les salons d'une communauté privée sont réservés à ses
 * membres (#16695) : à la bascule, chaque occupant inscrit qui n'en est pas
 * membre y ENTRE sous l'autorité du créateur (la loi de
 * `planCommunityAdmission`), et celui qui ne peut pas y entrer (compte mort,
 * blocage avec le créateur) SORT des salons (`exitCommunitySalons`).
 *
 * Le double honore les `where` posés : lignes actives, salons de la seule
 * communauté, comptes vivants.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const exitCommunitySalons = jest.fn<any>(async () => ({ exitedConversationIds: [], announcements: Promise.resolve() }));
jest.mock('../../../../services/conversations/communitySalonExit', () => {
  const actual = jest.requireActual<typeof import('../../../../services/conversations/communitySalonExit')>(
    '../../../../services/conversations/communitySalonExit',
  );
  return { ...actual, exitCommunitySalons: (...args: unknown[]) => exitCommunitySalons(...args) };
});

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

import {
  admitSalonOccupants,
  exitSalonOutsiders,
  isBecomingPrivate,
} from '../../../../services/conversations/communitySalonAdoption';

const COMMUNITY = '507f1f77bcf86cd799439044';
const CREATEUR = '507f1f77bcf86cd7994390c0';
const MEMBRE = '507f1f77bcf86cd799439011';
const OCCUPANT = '507f1f77bcf86cd799439022';
const ANCIEN = '507f1f77bcf86cd799439033';
const BLOQUE = '507f1f77bcf86cd799439055';
const MORT = '507f1f77bcf86cd799439066';
const HORS = '507f1f77bcf86cd799439077';
const SALON_A = '507f1f77bcf86cd7994390a1';
const SALON_B = '507f1f77bcf86cd7994390b2';
const AUTRE_SALON = '507f1f77bcf86cd7994390f9';

type Occupation = {
  readonly conversationId: string;
  readonly userId: string | null;
  readonly type?: string;
  readonly isActive?: boolean;
};

type Monde = {
  readonly occupations?: readonly Occupation[];
  readonly membres?: ReadonlyArray<{ readonly id: string; readonly userId: string; readonly isActive: boolean }>;
  readonly morts?: readonly string[];
  readonly bloquesParCreateur?: readonly string[];
  readonly bloquentCreateur?: readonly string[];
};

const SALONS = [
  { id: SALON_A, communityId: COMMUNITY },
  { id: SALON_B, communityId: COMMUNITY },
  { id: AUTRE_SALON, communityId: 'autre' },
];

function prismaDouble(monde: Monde = {}) {
  const occupations = monde.occupations ?? [];
  const membres = monde.membres ?? [];
  const morts = new Set(monde.morts ?? []);
  const bloquesParCreateur = monde.bloquesParCreateur ?? [];
  const bloquentCreateur = new Set(monde.bloquentCreateur ?? []);
  return {
    conversation: {
      findMany: jest.fn<any>(async (args: any) => SALONS
        .filter((s) => s.communityId === args.where.communityId)
        .map((s) => ({ id: s.id }))),
    },
    participant: {
      findMany: jest.fn<any>(async (args: any) => occupations
        .filter((o) => args.where.conversationId.in.includes(o.conversationId))
        .filter((o) => (o.isActive ?? true) === args.where.isActive)
        .filter((o) => (o.type ?? 'user') === args.where.type)
        .map((o) => ({ userId: o.userId }))),
    },
    communityMember: {
      findMany: jest.fn<any>(async (args: any) => membres
        .filter((m) => args.where.communityId === COMMUNITY && args.where.userId.in.includes(m.userId))),
      updateMany: jest.fn<any>(async (args: any) => ({ count: args.where.id.in.length })),
      createMany: jest.fn<any>(async (args: any) => ({ count: args.data.length })),
    },
    user: {
      findMany: jest.fn<any>(async (args: any) => {
        if (args.where.isActive === true) {
          return args.where.id.in.filter((id: string) => !morts.has(id)).map((id: string) => ({ id }));
        }
        return args.where.id.in.filter((id: string) => bloquentCreateur.has(id)).map((id: string) => ({ id }));
      }),
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: bloquesParCreateur })),
    },
  };
}

const NOW = new Date('2026-11-07T22:00:00.000Z');
const creations = (prisma: ReturnType<typeof prismaDouble>) =>
  prisma.communityMember.createMany.mock.calls.flatMap((c: any) => c[0].data);

beforeEach(() => jest.clearAllMocks());

describe('isBecomingPrivate — quelle bascule fait entrer ou sortir', () => {
  it('publique → privée, oui', () => {
    expect(isBecomingPrivate({ before: false, requested: true })).toBe(true);
  });

  it('déjà privée, rien : la loi était déjà tenue par les portes', () => {
    expect(isBecomingPrivate({ before: true, requested: true })).toBe(false);
  });

  it('privée → publique ou champ absent, rien', () => {
    expect(isBecomingPrivate({ before: true, requested: false })).toBe(false);
    expect(isBecomingPrivate({ before: false, requested: undefined })).toBe(false);
  });
});

describe('admitSalonOccupants — les occupants des salons entrent dans la communauté', () => {
  it("un occupant inscrit qui n'est pas membre entre, en MEMBER, sans rien demander à personne", async () => {
    const prisma = prismaDouble({ occupations: [{ conversationId: SALON_A, userId: OCCUPANT }] });

    const exclus = await admitSalonOccupants(prisma as never, { communityId: COMMUNITY, createdBy: CREATEUR });

    expect(exclus).toEqual([]);
    expect(creations(prisma)).toEqual([{ communityId: COMMUNITY, userId: OCCUPANT, role: 'member' }]);
  });

  it('un membre actif reste tel quel : ni relu comme compte, ni réécrit', async () => {
    const prisma = prismaDouble({
      occupations: [{ conversationId: SALON_A, userId: MEMBRE }],
      membres: [{ id: 'cm-membre', userId: MEMBRE, isActive: true }],
    });

    await admitSalonOccupants(prisma as never, { communityId: COMMUNITY, createdBy: CREATEUR });

    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
    expect(prisma.communityMember.updateMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("la ligne d'un ancien membre se réactive en MEMBER, jamais avec son ancien rang", async () => {
    const prisma = prismaDouble({
      occupations: [{ conversationId: SALON_B, userId: ANCIEN }],
      membres: [{ id: 'cm-ancien', userId: ANCIEN, isActive: false }],
    });

    await admitSalonOccupants(prisma as never, { communityId: COMMUNITY, createdBy: CREATEUR });

    expect(prisma.communityMember.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['cm-ancien'] }, isActive: false },
      data: { isActive: true, leftAt: null, role: 'member' },
    });
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
  });

  it("le créateur n'est jamais réinscrit : il peut revenir dans ses salons sans ligne (#16703)", async () => {
    const prisma = prismaDouble({ occupations: [{ conversationId: SALON_A, userId: CREATEUR }] });

    const exclus = await admitSalonOccupants(prisma as never, { communityId: COMMUNITY, createdBy: CREATEUR });

    expect(exclus).toEqual([]);
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
  });

  it("un occupant présent dans deux salons n'entre qu'une fois", async () => {
    const prisma = prismaDouble({
      occupations: [
        { conversationId: SALON_A, userId: OCCUPANT },
        { conversationId: SALON_B, userId: OCCUPANT },
      ],
    });

    await admitSalonOccupants(prisma as never, { communityId: COMMUNITY, createdBy: CREATEUR });

    expect(creations(prisma)).toHaveLength(1);
  });

  it("ne lit que les salons de CETTE communauté, les lignes actives et les participants inscrits (ni invité ni bot)", async () => {
    const prisma = prismaDouble({
      occupations: [
        { conversationId: AUTRE_SALON, userId: HORS },
        { conversationId: SALON_A, userId: ANCIEN, isActive: false },
        { conversationId: SALON_A, userId: null, type: 'anonymous' },
        { conversationId: SALON_A, userId: OCCUPANT, type: 'bot' },
      ],
    });

    const exclus = await admitSalonOccupants(prisma as never, { communityId: COMMUNITY, createdBy: CREATEUR });

    expect(exclus).toEqual([]);
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
    expect(prisma.participant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { conversationId: { in: [SALON_A, SALON_B] }, isActive: true, type: 'user' },
    }));
  });

  it("un compte mort ou bloqué avec le créateur, dans un sens ou dans l'autre, n'entre pas : il est rendu pour sortir", async () => {
    const AUSSI_BLOQUE = '507f1f77bcf86cd799439088';
    const prisma = prismaDouble({
      occupations: [
        { conversationId: SALON_A, userId: OCCUPANT },
        { conversationId: SALON_A, userId: BLOQUE },
        { conversationId: SALON_B, userId: MORT },
        { conversationId: SALON_B, userId: AUSSI_BLOQUE },
      ],
      morts: [MORT],
      bloquesParCreateur: [BLOQUE],
      bloquentCreateur: [AUSSI_BLOQUE],
    });

    const exclus = await admitSalonOccupants(prisma as never, { communityId: COMMUNITY, createdBy: CREATEUR });

    expect([...exclus].sort()).toEqual([BLOQUE, MORT, AUSSI_BLOQUE].sort());
    expect(creations(prisma)).toEqual([{ communityId: COMMUNITY, userId: OCCUPANT, role: 'member' }]);
  });

  it('une communauté sans salon ne lit rien de plus', async () => {
    const prisma = prismaDouble();
    prisma.conversation.findMany.mockResolvedValueOnce([]);

    const exclus = await admitSalonOccupants(prisma as never, { communityId: COMMUNITY, createdBy: CREATEUR });

    expect(exclus).toEqual([]);
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });
});

describe('exitSalonOutsiders — ceux qui ne peuvent pas entrer sortent des salons', () => {
  it('chaque exclu sort par la loi de #16704, à la même date', async () => {
    const deps = { prisma: {} as never, socketIOHandler: null };

    await exitSalonOutsiders(deps, { communityId: COMMUNITY, userIds: [BLOQUE, MORT], now: NOW });

    expect(exitCommunitySalons).toHaveBeenCalledTimes(2);
    expect(exitCommunitySalons).toHaveBeenCalledWith(deps, { communityId: COMMUNITY, userId: BLOQUE, now: NOW });
    expect(exitCommunitySalons).toHaveBeenCalledWith(deps, { communityId: COMMUNITY, userId: MORT, now: NOW });
  });

  it('ne rejette jamais : la bascule est déjà écrite', async () => {
    exitCommunitySalons.mockRejectedValueOnce(new Error('panne'));
    const deps = { prisma: {} as never, socketIOHandler: null };

    await expect(exitSalonOutsiders(deps, { communityId: COMMUNITY, userIds: [BLOQUE, MORT], now: NOW }))
      .resolves.toBeUndefined();
    expect(exitCommunitySalons).toHaveBeenCalledTimes(2);
  });
});
