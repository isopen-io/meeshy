/**
 * La disparition d'une communauté en temps réel (#19590) — `community:deleted`.
 * Le faux Prisma APPLIQUE les filtres que le service demande : l'audience se
 * lit sur ce que la base rendrait.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  deliverCommunityDeleted,
  readCommunityDeletedAudience,
  scheduleCommunityDeletedBroadcast,
} from '../../../services/community-deleted-broadcast';
import type { CommunityDeletedEventData } from '@meeshy/shared/types/socketio-events';

const COMMUNITY = '6650c0000000000000000001';
const OTHER = '6650c0000000000000000002';
const CREATOR = 'u-creator';
const NOW = new Date('2026-11-18T06:00:00Z');

type CommunityRow = { readonly id: string; readonly isActive: boolean; readonly createdBy: string; readonly name?: string };
type MemberRow = { readonly communityId: string; readonly userId: string; readonly isActive: boolean; readonly email?: string };

const community = (overrides: Partial<CommunityRow> = {}): CommunityRow => ({
  id: COMMUNITY, isActive: true, createdBy: CREATOR, name: 'ne part jamais', ...overrides,
});
const member = (userId: string, overrides: Partial<MemberRow> = {}): MemberRow => ({
  communityId: COMMUNITY, userId, isActive: true, email: `${userId}@example.com`, ...overrides,
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
  const sent: Array<{ userId: string; payload: CommunityDeletedEventData }> = [];
  return { sent, deliver: (userId: string, payload: CommunityDeletedEventData) => { sent.push({ userId, payload }); } };
};

describe('readCommunityDeletedAudience', () => {
  it('rend chaque membre actif et le créateur, une fois chacun', async () => {
    const audience = await readCommunityDeletedAudience(
      fakePrisma([community()], [member('u-a'), member('u-b'), member(CREATOR)]) as never,
      COMMUNITY,
    );
    expect([...audience].sort()).toEqual(['u-a', 'u-b', CREATOR].sort());
  });

  it("n'y met ni un ancien membre, ni le membre d'une autre communauté", async () => {
    const audience = await readCommunityDeletedAudience(
      fakePrisma([community()], [member('u-a'), member('u-gone', { isActive: false }), member('u-elsewhere', { communityId: OTHER })]) as never,
      COMMUNITY,
    );
    expect([...audience].sort()).toEqual(['u-a', CREATOR].sort());
  });

  it("rend une audience vide pour une communauté déjà désactivée ou inconnue : elle n'existait déjà plus pour personne", async () => {
    const prisma = fakePrisma([community({ isActive: false })], [member('u-a')]) as never;
    expect(await readCommunityDeletedAudience(prisma, COMMUNITY)).toEqual([]);
    expect(await readCommunityDeletedAudience(prisma, OTHER)).toEqual([]);
  });

  it("rend une audience vide quand la lecture échoue : l'annonce ne fait jamais échouer la suppression", async () => {
    const prisma = { community: { findFirst: async () => { throw new Error('mongo down'); } }, communityMember: { findMany: async () => [] } };
    expect(await readCommunityDeletedAudience(prisma as never, COMMUNITY)).toEqual([]);
  });
});

describe('deliverCommunityDeleted', () => {
  it("annonce ce qui a disparu et quand, rien d'autre : ni membres, ni créateur, ni identité", () => {
    const { sent, deliver } = recorder();
    const count = deliverCommunityDeleted(
      { deliver, now: () => NOW },
      { communityId: COMMUNITY, reason: 'deleted', audience: ['u-a', CREATOR] },
    );
    expect(count).toBe(2);
    expect(sent).toEqual([
      { userId: 'u-a', payload: { communityId: COMMUNITY, reason: 'deleted', at: NOW.toISOString() } },
      { userId: CREATOR, payload: { communityId: COMMUNITY, reason: 'deleted', at: NOW.toISOString() } },
    ]);
  });

  it("dit une désactivation par l'équipe", () => {
    const { sent, deliver } = recorder();
    deliverCommunityDeleted({ deliver, now: () => NOW }, { communityId: COMMUNITY, reason: 'deactivated', audience: ['u-a'] });
    expect(sent[0]?.payload.reason).toBe('deactivated');
  });

  it("un envoi qui lève n'arrête pas les autres", () => {
    const reached: string[] = [];
    const count = deliverCommunityDeleted(
      {
        deliver: (userId) => {
          if (userId === 'u-a') throw new Error('socket closed');
          reached.push(userId);
        },
        now: () => NOW,
      },
      { communityId: COMMUNITY, reason: 'deleted', audience: ['u-a', 'u-b', CREATOR] },
    );
    expect(reached).toEqual(['u-b', CREATOR]);
    expect(count).toBe(2);
  });
});

describe('scheduleCommunityDeletedBroadcast', () => {
  it('part après la réponse, jamais en ligne', async () => {
    const { sent, deliver } = recorder();
    const deferred: Array<() => Promise<void>> = [];
    scheduleCommunityDeletedBroadcast(
      { deliver, now: () => NOW },
      { communityId: COMMUNITY, reason: 'deleted', audience: ['u-a'] },
      { afterResponse: (task) => { deferred.push(task); } },
    );
    expect(sent).toEqual([]);
    await Promise.all(deferred.map((task) => task()));
    expect(sent.map((s) => s.userId)).toEqual(['u-a']);
  });

  it("n'écrit rien quand personne n'est à prévenir", () => {
    const deferred: Array<() => Promise<void>> = [];
    scheduleCommunityDeletedBroadcast(
      { deliver: () => undefined },
      { communityId: COMMUNITY, reason: 'deleted', audience: [] },
      { afterResponse: (task) => { deferred.push(task); } },
    );
    expect(deferred).toEqual([]);
  });
});
