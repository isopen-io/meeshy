/**
 * L'effectif d'une communauté en temps réel (#18766) —
 * `community:member-joined`, `community:member-left`,
 * `community:member-role-updated`. Le faux Prisma APPLIQUE les filtres que le
 * service demande : l'audience se lit sur ce que la base rendrait.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  broadcastCommunityMemberChange,
  scheduleCommunityMemberBroadcast,
  type CommunityMemberEmission,
} from '../../../services/community-member-broadcast';

const COMMUNITY = '6650c0000000000000000001';
const OTHER = '6650c0000000000000000002';
const CREATOR = 'u-creator';
const NOW = new Date('2026-11-15T23:50:00Z');

type CommunityRow = { readonly id: string; readonly isActive: boolean; readonly createdBy: string; readonly name?: string };
type MemberRow = { readonly communityId: string; readonly userId: string; readonly isActive: boolean; readonly role?: string; readonly email?: string; readonly isOnline?: boolean };

const community = (overrides: Partial<CommunityRow> = {}): CommunityRow => ({
  id: COMMUNITY, isActive: true, createdBy: CREATOR, name: 'ne part jamais', ...overrides,
});
const member = (userId: string, overrides: Partial<MemberRow> = {}): MemberRow => ({
  communityId: COMMUNITY, userId, isActive: true, email: `${userId}@example.com`, isOnline: true, ...overrides,
});

type Select = Readonly<Record<string, unknown>>;
const project = <T extends object>(row: T, select: Select): Partial<T> =>
  Object.fromEntries(Object.entries(row).filter(([key]) => select[key] === true)) as Partial<T>;

const fakePrisma = (communities: readonly CommunityRow[], members: readonly MemberRow[]) => ({
  community: {
    findFirst: async (args: { where: { id: string; isActive: boolean }; select: Select }) => {
      const row = communities.find((c) => c.id === args.where.id && c.isActive === args.where.isActive);
      return row === undefined ? null : project(row, args.select);
    },
  },
  communityMember: {
    findMany: async (args: { where: { communityId: string; isActive: boolean }; select: Select }) =>
      members
        .filter((row) => row.communityId === args.where.communityId && row.isActive === args.where.isActive)
        .map((row) => project(row, args.select)),
  },
});

const recorder = () => {
  const sent: Array<{ userId: string; emission: CommunityMemberEmission }> = [];
  return { sent, deliver: (userId: string, emission: CommunityMemberEmission) => { sent.push({ userId, emission }); } };
};

const deps = (communities: readonly CommunityRow[], members: readonly MemberRow[], deliver: (userId: string, emission: CommunityMemberEmission) => void) => ({
  prisma: fakePrisma(communities, members) as never,
  deliver,
  now: () => NOW,
});

describe('broadcastCommunityMemberChange', () => {
  it("une entrée part vers chaque membre actif et le créateur, une fois chacun, sous community:member-joined", async () => {
    const { sent, deliver } = recorder();
    const count = await broadcastCommunityMemberChange(
      deps([community()], [member('u-a'), member('u-new'), member(CREATOR)], deliver),
      { kind: 'joined', communityId: COMMUNITY, userId: 'u-new', role: 'member', via: 'self' },
    );

    expect(sent.map((s) => s.userId).sort()).toEqual(['u-a', 'u-new', CREATOR].sort());
    expect(count).toBe(3);
    expect(sent[0]?.emission).toEqual({
      event: SERVER_EVENTS.COMMUNITY_MEMBER_JOINED,
      payload: { communityId: COMMUNITY, userId: 'u-new', role: 'member', via: 'self', memberCount: 3, at: NOW.toISOString() },
    });
  });

  it("une entrée PAR LE LIEN : la porte ne part qu'à ceux qui animent ou modèrent, et à l'arrivant — un membre simple lit « self » (#19429)", async () => {
    const { sent, deliver } = recorder();
    await broadcastCommunityMemberChange(
      deps(
        [community()],
        [member('u-a', { role: 'member' }), member('u-mod', { role: 'moderator' }), member('u-new', { role: 'member' }), member(CREATOR, { role: 'admin' })],
        deliver,
      ),
      { kind: 'joined', communityId: COMMUNITY, userId: 'u-new', role: 'member', via: 'link' },
    );

    const viaOf = (userId: string) => {
      const emission = sent.find((s) => s.userId === userId)?.emission;
      return emission?.event === SERVER_EVENTS.COMMUNITY_MEMBER_JOINED ? emission.payload.via : undefined;
    };
    expect(viaOf('u-a')).toBe('self');
    expect(viaOf('u-mod')).toBe('link');
    expect(viaOf(CREATOR)).toBe('link');
    expect(viaOf('u-new')).toBe('link');
    expect(JSON.stringify(sent.filter((s) => s.userId === 'u-a'))).not.toContain('link');
  });

  it("un retrait atteint aussi la personne retirée, et jamais un ancien membre tiers ni le membre d'une autre communauté", async () => {
    const { sent, deliver } = recorder();
    await broadcastCommunityMemberChange(
      deps(
        [community()],
        [member('u-a'), member('u-out', { isActive: false }), member('u-former', { isActive: false }), member('u-elsewhere', { communityId: OTHER })],
        deliver,
      ),
      { kind: 'left', communityId: COMMUNITY, userId: 'u-out', reason: 'removed' },
    );

    expect(sent.map((s) => s.userId).sort()).toEqual(['u-a', 'u-out', CREATOR].sort());
    expect(sent[0]?.emission).toEqual({
      event: SERVER_EVENTS.COMMUNITY_MEMBER_LEFT,
      payload: { communityId: COMMUNITY, userId: 'u-out', reason: 'removed', memberCount: 1, at: NOW.toISOString() },
    });
  });

  it("un changement de rôle part sous community:member-role-updated, et la charge ne porte RIEN à côté — ni profil, ni présence, ni coordonnées", async () => {
    const { sent, deliver } = recorder();
    await broadcastCommunityMemberChange(
      deps([community()], [member('u-a'), member('u-mod')], deliver),
      { kind: 'role-updated', communityId: COMMUNITY, userId: 'u-mod', role: 'moderator' },
    );

    const emission = sent[0]?.emission;
    expect(emission?.event).toBe(SERVER_EVENTS.COMMUNITY_MEMBER_ROLE_UPDATED);
    expect(Object.keys(emission?.payload ?? {}).sort()).toEqual(['at', 'communityId', 'memberCount', 'role', 'userId']);
    expect(JSON.stringify(sent)).not.toMatch(/example\.com|isOnline|ne part jamais/);
  });

  it("une communauté désactivée ou disparue n'annonce rien", async () => {
    const change = { kind: 'joined', communityId: COMMUNITY, userId: 'u-a', role: 'member', via: 'self' } as const;
    const first = recorder();
    await broadcastCommunityMemberChange(deps([community({ isActive: false })], [member('u-a')], first.deliver), change);
    const second = recorder();
    await broadcastCommunityMemberChange(deps([], [member('u-a')], second.deliver), change);

    expect(first.sent).toEqual([]);
    expect(second.sent).toEqual([]);
  });

  it("un envoi qui lève n'arrête pas les autres", async () => {
    const reached: string[] = [];
    const count = await broadcastCommunityMemberChange(
      deps([community()], [member('u-a'), member('u-b')], (userId) => {
        if (userId === 'u-a') throw new Error('adaptateur en défaut');
        reached.push(userId);
      }),
      { kind: 'left', communityId: COMMUNITY, userId: 'u-b', reason: 'left' },
    );

    expect(reached.sort()).toEqual(['u-b', CREATOR].sort());
    expect(count).toBe(2);
  });
});

describe('scheduleCommunityMemberBroadcast', () => {
  it('diffuse après la réponse, et une lecture qui lève ne rejette jamais', async () => {
    const tasks: Array<() => Promise<void>> = [];
    const { sent, deliver } = recorder();
    scheduleCommunityMemberBroadcast(
      deps([community()], [member('u-a')], deliver),
      { kind: 'joined', communityId: COMMUNITY, userId: 'u-a', role: 'member', via: 'invited' },
      { afterResponse: (task) => { tasks.push(task); } },
    );
    expect(sent).toEqual([]);
    await Promise.all(tasks.map((task) => task()));
    expect(sent.map((s) => s.userId).sort()).toEqual(['u-a', CREATOR].sort());

    const failing: Array<() => Promise<void>> = [];
    const broken = { community: { findFirst: async () => { throw new Error('Mongo'); } }, communityMember: { findMany: async () => [] } };
    scheduleCommunityMemberBroadcast(
      { prisma: broken as never, deliver: () => undefined },
      { kind: 'left', communityId: COMMUNITY, userId: 'u-a', reason: 'left' },
      { afterResponse: (task) => { failing.push(task); } },
    );
    await expect(Promise.all(failing.map((task) => task()))).resolves.toEqual([undefined]);
  });
});
