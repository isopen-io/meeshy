/**
 * `community:updated` (#18435) — l'identité d'une communauté, à jour chez ses
 * membres. Le faux Prisma APPLIQUE les filtres que le service demande :
 * l'audience se lit sur ce que la base rendrait, pas sur la forme de la
 * requête.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type { CommunityUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import {
  broadcastCommunityUpdated,
  scheduleCommunityUpdatedBroadcast,
} from '../../../services/community-updated-broadcast';

const COMMUNITY = '6650a0000000000000000001';
const OTHER = '6650a0000000000000000002';
const CREATOR = 'u-creator';
const UPDATED_AT = new Date('2026-11-14T11:00:00Z');

type CommunityRow = {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly description: string | null;
  readonly avatar: string | null;
  readonly banner: string | null;
  readonly isPrivate: boolean;
  readonly isActive: boolean;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly secretNote?: string;
};
type MemberRow = { readonly communityId: string; readonly userId: string; readonly isActive: boolean; readonly email?: string; readonly isOnline?: boolean };

const community = (overrides: Partial<CommunityRow> = {}): CommunityRow => ({
  id: COMMUNITY,
  identifier: 'mshy_club',
  name: 'Club &amp; amis',
  description: 'Le club',
  avatar: 'community/avatar.webp',
  banner: null,
  isPrivate: true,
  isActive: true,
  createdBy: CREATOR,
  updatedAt: UPDATED_AT,
  secretNote: 'ne part jamais',
  ...overrides,
});
const member = (userId: string, overrides: Partial<MemberRow> = {}): MemberRow => ({
  communityId: COMMUNITY,
  userId,
  isActive: true,
  email: `${userId}@example.com`,
  isOnline: true,
  ...overrides,
});

type CommunityWhere = { id: string; isActive: boolean };
type MemberWhere = { communityId: string; isActive: boolean };
type Select = Readonly<Record<string, unknown>>;

const project = <T extends object>(row: T, select: Select): Partial<T> =>
  Object.fromEntries(Object.entries(row).filter(([key]) => select[key] === true)) as Partial<T>;

const fakePrisma = (communities: readonly CommunityRow[], members: readonly MemberRow[]) => {
  const memberMatches = (row: MemberRow, where: MemberWhere) => row.communityId === where.communityId && row.isActive === where.isActive;
  return {
    community: {
      findFirst: async (args: { where: CommunityWhere; select: Select }) => {
        const row = communities.find((c) => c.id === args.where.id && c.isActive === args.where.isActive);
        return row === undefined ? null : project(row, args.select);
      },
    },
    communityMember: {
      findMany: async (args: { where: MemberWhere; select: Select }) =>
        members.filter((row) => memberMatches(row, args.where)).map((row) => project(row, args.select)),
    },
  };
};

const recorder = () => {
  const sent: Array<{ userId: string; payload: CommunityUpdatedEventData }> = [];
  return { sent, deliver: (userId: string, payload: CommunityUpdatedEventData) => { sent.push({ userId, payload }); } };
};

const run = async (communities: readonly CommunityRow[], members: readonly MemberRow[]) => {
  const { sent, deliver } = recorder();
  const count = await broadcastCommunityUpdated({ prisma: fakePrisma(communities, members) as never, deliver }, { communityId: COMMUNITY });
  return { sent, count };
};

describe('broadcastCommunityUpdated', () => {
  it('part vers chaque membre actif et le créateur, une fois chacun', async () => {
    const { sent, count } = await run([community()], [member('u-a'), member('u-b'), member(CREATOR)]);

    expect(sent.map((s) => s.userId).sort()).toEqual(['u-a', 'u-b', CREATOR].sort());
    expect(count).toBe(3);
  });

  it("n'atteint ni un ancien membre ni le membre d'une autre communauté", async () => {
    const { sent } = await run(
      [community()],
      [member('u-a'), member('u-left', { isActive: false }), member('u-elsewhere', { communityId: OTHER })],
    );

    expect(sent.map((s) => s.userId).sort()).toEqual(['u-a', CREATOR].sort());
  });

  it("porte l'identité écrite et RIEN à côté — ni membres, ni présence, ni coordonnées", async () => {
    const { sent } = await run([community()], [member('u-a'), member('u-b', { isActive: false })]);

    expect(sent[0]?.payload).toEqual({
      communityId: COMMUNITY,
      identifier: 'mshy_club',
      name: 'Club &amp; amis',
      description: 'Le club',
      avatar: 'community/avatar.webp',
      banner: null,
      isPrivate: true,
      memberCount: 1,
      updatedAt: '2026-11-14T11:00:00.000Z',
    });
  });

  it("une communauté désactivée ou disparue n'annonce rien", async () => {
    expect((await run([community({ isActive: false })], [member('u-a')])).sent).toEqual([]);
    expect((await run([], [member('u-a')])).sent).toEqual([]);
  });

  it("un envoi qui lève n'arrête pas les autres", async () => {
    const sent: string[] = [];
    const deliver = (userId: string) => {
      if (userId === 'u-a') throw new Error('adaptateur en défaut');
      sent.push(userId);
    };
    const count = await broadcastCommunityUpdated(
      { prisma: fakePrisma([community()], [member('u-a'), member('u-b')]) as never, deliver },
      { communityId: COMMUNITY },
    );

    expect(sent.sort()).toEqual(['u-b', CREATOR].sort());
    expect(count).toBe(2);
  });
});

describe('scheduleCommunityUpdatedBroadcast', () => {
  it('diffuse après la réponse', async () => {
    const tasks: Array<() => Promise<void>> = [];
    const { sent, deliver } = recorder();
    scheduleCommunityUpdatedBroadcast(
      { prisma: fakePrisma([community()], [member('u-a')]) as never, deliver },
      { communityId: COMMUNITY },
      { afterResponse: (task) => { tasks.push(task); } },
    );

    expect(sent).toEqual([]);
    await Promise.all(tasks.map((task) => task()));
    expect(sent.map((s) => s.userId).sort()).toEqual(['u-a', CREATOR].sort());
  });

  it('une lecture qui lève ne rejette jamais', async () => {
    const tasks: Array<() => Promise<void>> = [];
    const prisma = { community: { findFirst: async () => { throw new Error('Mongo'); } }, communityMember: { findMany: async () => [] } };
    scheduleCommunityUpdatedBroadcast(
      { prisma: prisma as never, deliver: () => undefined },
      { communityId: COMMUNITY },
      { afterResponse: (task) => { tasks.push(task); } },
    );

    await expect(Promise.all(tasks.map((task) => task()))).resolves.toEqual([undefined]);
  });
});
