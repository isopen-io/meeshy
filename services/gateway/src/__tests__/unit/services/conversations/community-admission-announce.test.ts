/**
 * Une communauté ne grandit plus en silence (#19406, #18769) : les admissions
 * IMPLICITES — créer un salon dans une communauté, y ajouter quelqu'un,
 * débannir, entrer par le lien d'un salon, rattacher un salon — passent par
 * `applyCommunityAdmission`, qui annonce désormais ce qu'il a ÉCRIT, et la
 * diffusion part sous `community:member-joined` vers la communauté.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  applyCommunityAdmission,
  planCommunityAdmission,
  type CommunityAdmission,
} from '../../../../services/conversations/communityMembershipSync';
import {
  broadcastCommunityMemberChanges,
  communityMemberAnnouncer,
  communityMemberAnnouncerOverIO,
  type CommunityMemberChange,
  type CommunityMemberEmission,
} from '../../../../services/community-member-broadcast';

const COMMUNITY = '6650c0000000000000000001';
const CREATOR = 'u-creator';
const ADMIN = 'u-admin';
const NOW = new Date('2026-11-18T12:00:00Z');

type Row = { readonly id: string; readonly userId: string; readonly isActive: boolean; readonly role: string };

/** Un faux `communityMember` qui ÉCRIT vraiment : `updateMany` ne touche que ce que son filtre désigne. */
const membershipStore = (initial: readonly Row[]) => {
  const rows = new Map(initial.map((row) => [row.id, { ...row }]));
  return {
    rows,
    prisma: {
      communityMember: {
        findMany: async (args: { where: { userId: { in: readonly string[] } } }) =>
          [...rows.values()].filter((row) => args.where.userId.in.includes(row.userId)).map((row) => ({ id: row.id, userId: row.userId, isActive: row.isActive })),
        updateMany: async (args: { where: { id: { in: readonly string[] }; isActive: boolean }; data: { role: string } }) => {
          const touched = [...rows.values()].filter((row) => args.where.id.in.includes(row.id) && row.isActive === args.where.isActive);
          touched.forEach((row) => rows.set(row.id, { ...row, isActive: true, role: args.data.role }));
          return { count: touched.length };
        },
        createMany: async (args: { data: ReadonlyArray<{ userId: string; role: string }> }) => {
          args.data.forEach((row, index) => rows.set(`new-${index}-${row.userId}`, { id: `new-${index}-${row.userId}`, userId: row.userId, isActive: true, role: row.role }));
          return { count: args.data.length };
        },
      },
      user: {
        findMany: async (args: { where: { id: { in: readonly string[] } } }) => args.where.id.in.map((id) => ({ id })),
        findFirst: async () => null,
      },
    },
  };
};

const announcements = () => {
  const announced: CommunityMemberChange[] = [];
  return { announced, announce: (changes: readonly CommunityMemberChange[]) => { announced.push(...changes); } };
};

describe('applyCommunityAdmission — annonce ce qui a été ÉCRIT', () => {
  it("créer un salon : l'appelant qui revient s'annonce « self » en admin, les participants « invited » en member", async () => {
    const store = membershipStore([{ id: 'cm-creator', userId: CREATOR, isActive: false, role: 'admin' }]);
    const plan = await planCommunityAdmission(store.prisma as never, {
      communityId: COMMUNITY, actorId: CREATOR, createdBy: CREATOR, isPrivate: true, actorRole: null,
      participantIds: ['u-bob', 'u-carla'],
    });
    const { announced, announce } = announcements();

    await applyCommunityAdmission(store.prisma as never, COMMUNITY, plan as Extract<CommunityAdmission, { kind: 'admitted' }>, announce);

    expect(announced).toEqual([
      { kind: 'joined', communityId: COMMUNITY, userId: CREATOR, role: 'admin', via: 'self' },
      { kind: 'joined', communityId: COMMUNITY, userId: 'u-bob', role: 'member', via: 'invited' },
      { kind: 'joined', communityId: COMMUNITY, userId: 'u-carla', role: 'member', via: 'invited' },
    ]);
  });

  it("un ancien membre réactivé s'annonce avec le rang ÉCRIT (member), jamais celui de sa ligne périmée", async () => {
    const store = membershipStore([
      { id: 'cm-admin', userId: ADMIN, isActive: true, role: 'admin' },
      { id: 'cm-old', userId: 'u-old', isActive: false, role: 'moderator' },
    ]);
    const plan = await planCommunityAdmission(store.prisma as never, {
      communityId: COMMUNITY, actorId: ADMIN, createdBy: CREATOR, isPrivate: true, actorRole: 'admin',
      participantIds: ['u-old'], admitActor: false,
    });
    const { announced, announce } = announcements();

    await applyCommunityAdmission(store.prisma as never, COMMUNITY, plan as Extract<CommunityAdmission, { kind: 'admitted' }>, announce);

    expect(store.rows.get('cm-old')).toMatchObject({ isActive: true, role: 'member' });
    expect(announced).toEqual([{ kind: 'joined', communityId: COMMUNITY, userId: 'u-old', role: 'member', via: 'invited' }]);
  });

  it("une réactivation qu'une course a déjà faite n'est pas annoncée deux fois : la course gagnante l'a dite", async () => {
    const store = membershipStore([{ id: 'cm-old', userId: 'u-old', isActive: true, role: 'member' }]);
    const { announced, announce } = announcements();

    await applyCommunityAdmission(store.prisma as never, COMMUNITY, {
      kind: 'admitted',
      reactivations: [{ id: 'cm-old', userId: 'u-old', role: 'member', via: 'invited' }],
      creations: [],
    }, announce);

    expect(announced).toEqual([]);
  });

  it("un membre déjà actif n'entre pas, donc rien ne s'annonce", async () => {
    const store = membershipStore([
      { id: 'cm-admin', userId: ADMIN, isActive: true, role: 'admin' },
      { id: 'cm-bob', userId: 'u-bob', isActive: true, role: 'member' },
    ]);
    const plan = await planCommunityAdmission(store.prisma as never, {
      communityId: COMMUNITY, actorId: ADMIN, createdBy: CREATOR, isPrivate: true, actorRole: 'admin',
      participantIds: ['u-bob'],
    });
    const { announced, announce } = announcements();

    await applyCommunityAdmission(store.prisma as never, COMMUNITY, plan as Extract<CommunityAdmission, { kind: 'admitted' }>, announce);

    expect(announced).toEqual([]);
  });
});

type MemberRow = { readonly userId: string; readonly isActive: boolean; readonly role: string; readonly email?: string; readonly isOnline?: boolean };

const broadcastPrisma = (members: readonly MemberRow[], reads: { count: number }) => ({
  community: {
    findFirst: async (args: { where: { id: string; isActive: boolean } }) => {
      reads.count += 1;
      return args.where.id === COMMUNITY && args.where.isActive ? { id: COMMUNITY, createdBy: CREATOR } : null;
    },
  },
  communityMember: {
    findMany: async (args: { where: { isActive: boolean }; select: Record<string, boolean> }) => {
      reads.count += 1;
      return members
        .filter((row) => row.isActive === args.where.isActive)
        .map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => args.select[key] === true)));
    },
  },
});

describe('broadcastCommunityMemberChanges — un lot, une lecture', () => {
  it("cent entrées ne relisent pas cent fois l'effectif : chacune part avec l'effectif d'après l'écriture", async () => {
    const reads = { count: 0 };
    const members: MemberRow[] = [
      { userId: 'u-a', isActive: true, role: 'member', email: 'a@example.com', isOnline: true },
      { userId: 'u-bob', isActive: true, role: 'member' },
      { userId: 'u-carla', isActive: true, role: 'member' },
    ];
    const sent: Array<{ userId: string; emission: CommunityMemberEmission }> = [];

    const count = await broadcastCommunityMemberChanges(
      { prisma: broadcastPrisma(members, reads) as never, deliver: (userId, emission) => { sent.push({ userId, emission }); }, now: () => NOW },
      [
        { kind: 'joined', communityId: COMMUNITY, userId: 'u-bob', role: 'member', via: 'invited' },
        { kind: 'joined', communityId: COMMUNITY, userId: 'u-carla', role: 'member', via: 'invited' },
      ],
    );

    expect(reads.count).toBe(2);
    expect(count).toBe(8);
    expect(sent.filter((s) => s.userId === 'u-a').map((s) => s.emission)).toEqual([
      { event: SERVER_EVENTS.COMMUNITY_MEMBER_JOINED, payload: { communityId: COMMUNITY, userId: 'u-bob', role: 'member', via: 'invited', memberCount: 3, at: NOW.toISOString() } },
      { event: SERVER_EVENTS.COMMUNITY_MEMBER_JOINED, payload: { communityId: COMMUNITY, userId: 'u-carla', role: 'member', via: 'invited', memberCount: 3, at: NOW.toISOString() } },
    ]);
    expect(JSON.stringify(sent)).not.toMatch(/example\.com|isOnline/);
  });

  it("une communauté désactivée n'annonce rien", async () => {
    const reads = { count: 0 };
    const sent: unknown[] = [];

    const count = await broadcastCommunityMemberChanges(
      { prisma: broadcastPrisma([], reads) as never, deliver: (userId) => { sent.push(userId); } },
      [{ kind: 'joined', communityId: 'autre', userId: 'u-bob', role: 'member', via: 'invited' }],
    );

    expect(count).toBe(0);
    expect(sent).toEqual([]);
  });
});

describe('communityMemberAnnouncer — après la réponse, jamais un échec du geste', () => {
  it('un lot vide ne programme rien', () => {
    const tasks: string[] = [];
    const announce = communityMemberAnnouncer(
      { prisma: broadcastPrisma([], { count: 0 }) as never, deliver: () => undefined },
      { afterResponse: (_task, label) => { tasks.push(label); } },
    );

    announce([]);

    expect(tasks).toEqual([]);
  });

  it('une lecture qui lève est avalée par la tâche différée', async () => {
    const pending: Array<() => Promise<void>> = [];
    const announce = communityMemberAnnouncer(
      {
        prisma: { community: { findFirst: async () => { throw new Error('panne'); } }, communityMember: { findMany: async () => [] } } as never,
        deliver: () => undefined,
      },
      { afterResponse: (task) => { pending.push(task); } },
    );

    announce([{ kind: 'joined', communityId: COMMUNITY, userId: 'u-bob', role: 'member', via: 'invited' }]);

    expect(pending).toHaveLength(1);
    await expect(pending[0]!()).resolves.toBeUndefined();
  });

  it("l'annonce d'un service part, après la réponse, dans la room personnelle de chaque membre, sous le couple (événement, charge)", async () => {
    const emitted: Array<{ room: string; event: unknown; payload: unknown }> = [];
    const io = { to: (room: string) => ({ emit: (event: unknown, payload: unknown) => { emitted.push({ room, event, payload }); } }) };
    const members: MemberRow[] = [{ userId: 'u-a', isActive: true, role: 'member' }, { userId: 'u-bob', isActive: true, role: 'member' }];

    communityMemberAnnouncerOverIO(broadcastPrisma(members, { count: 0 }) as never, io as never)([
      { kind: 'joined', communityId: COMMUNITY, userId: 'u-bob', role: 'member', via: 'invited' },
    ]);
    expect(emitted).toEqual([]);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(emitted.map((e) => e.room).sort()).toEqual(['user:u-a', 'user:u-bob', `user:${CREATOR}`].sort());
    expect(emitted.every((e) => e.event === SERVER_EVENTS.COMMUNITY_MEMBER_JOINED)).toBe(true);
    expect(emitted[0]?.payload).toMatchObject({ communityId: COMMUNITY, userId: 'u-bob', via: 'invited', memberCount: 2 });
  });

  it("sans serveur Socket.IO, l'annonce d'un service ne fait rien", () => {
    expect(() => communityMemberAnnouncerOverIO(broadcastPrisma([], { count: 0 }) as never, null)([
      { kind: 'joined', communityId: COMMUNITY, userId: 'u-bob', role: 'member', via: 'invited' },
    ])).not.toThrow();
  });
});
