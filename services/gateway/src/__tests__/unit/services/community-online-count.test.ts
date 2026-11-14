/**
 * « N en ligne » d'une communauté (#18014) : un AGRÉGAT sans identité, la
 * seule présence que la co-appartenance a le droit de révéler (directive
 * 2026-08-25). Le faux Prisma APPLIQUE le filtre que le service demande : la
 * loi se lit sur ce que la base rendrait, pas sur la forme de la requête.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  countOnlineMembers,
  ONLINE_COUNT_ANONYMITY_FLOOR,
} from '../../../services/community-online-count';

type Person = {
  readonly id: string;
  readonly isOnline: boolean;
  readonly lastActiveAt: Date | null;
  readonly isActive?: boolean;
  readonly deactivatedAt?: Date | null;
  readonly deletedAt?: Date | null;
  readonly blockedUserIds?: readonly string[];
  readonly showOnlineStatus?: boolean;
  readonly memberActive?: boolean;
  readonly communityId?: string;
};

const NOW = new Date('2026-11-13T12:00:00Z');
const VIEWER = 'u-viewer';
const COMMUNITY = 'comm-1';

const person = (id: string, overrides: Partial<Person> = {}): Person => ({
  id,
  isOnline: false,
  lastActiveAt: null,
  ...overrides,
});
const online = (id: string, overrides: Partial<Person> = {}) => person(id, { isOnline: true, lastActiveAt: NOW, ...overrides });
const crowd = (count: number, prefix = 'u-off') => Array.from({ length: count }, (_, i) => person(`${prefix}-${i}`));

type OnlineFilter = { OR: readonly [{ isOnline: boolean }, { lastActiveAt: { gte: Date } }] };
type LivingFilter = { isActive: boolean; AND: readonly unknown[] };
type MemberWhere = {
  communityId: string;
  isActive: boolean;
  userId: { not: string };
  user?: { is: OnlineFilter | LivingFilter };
};

const isLivingFilter = (filter: OnlineFilter | LivingFilter): filter is LivingFilter => 'AND' in filter;
const living = (p: Person) => (p.isActive ?? true) && !p.deactivatedAt && !p.deletedAt;

const fakes = (people: readonly Person[], viewerBlocks: readonly string[] = []) => {
  const memberOf = (p: Person, where: MemberWhere) => {
    if ((p.communityId ?? COMMUNITY) !== where.communityId) return false;
    if ((p.memberActive ?? true) !== where.isActive) return false;
    if (p.id === where.userId.not) return false;
    if (!where.user) return true;
    if (isLivingFilter(where.user.is)) return living(p);
    const since = where.user.is.OR[1].lastActiveAt.gte;
    return p.isOnline || (p.lastActiveAt !== null && p.lastActiveAt >= since);
  };
  const count = jest.fn(async ({ where }: { where: MemberWhere }) => people.filter((p) => memberOf(p, where)).length);
  const findMany = jest.fn(async ({ where, take }: { where: MemberWhere; take: number }) =>
    people
      .filter((p) => memberOf(p, where))
      .slice(0, take)
      .map((p) => ({
        userId: p.id,
        user: {
          isOnline: p.isOnline,
          lastActiveAt: p.lastActiveAt,
          isActive: p.isActive ?? true,
          deactivatedAt: p.deactivatedAt ?? null,
          deletedAt: p.deletedAt ?? null,
        },
      })),
  );
  const userFindMany = jest.fn(async ({ where }: { where: { id: { in: string[] }; blockedUserIds: { has: string } } }) =>
    people
      .filter((p) => where.id.in.includes(p.id) && (p.blockedUserIds ?? []).includes(where.blockedUserIds.has))
      .map((p) => ({ id: p.id })),
  );
  const userFindUnique = jest.fn(async () => ({ blockedUserIds: [...viewerBlocks] }));
  const prisma = {
    communityMember: { count, findMany },
    user: { findMany: userFindMany, findUnique: userFindUnique, findFirst: userFindUnique },
  };
  const getPreferencesForUsers = jest.fn(async (ids: ReadonlyArray<{ id: string }>) =>
    new Map(
      ids
        .filter(({ id }) => id !== 'u-no-prefs')
        .map(({ id }) => [id, { showOnlineStatus: people.find((p) => p.id === id)?.showOnlineStatus ?? true }]),
    ),
  );
  return { prisma, privacy: { getPreferencesForUsers }, findMany, getPreferencesForUsers };
};

const countFor = async (people: readonly Person[], viewerBlocks: readonly string[] = []) => {
  const deps = fakes(people, viewerBlocks);
  const value = await countOnlineMembers({
    prisma: deps.prisma as never,
    privacy: deps.privacy as never,
    communityId: COMMUNITY,
    viewerId: VIEWER,
    now: NOW,
  });
  return { value, ...deps };
};

describe('countOnlineMembers (#18014)', () => {
  it('compte les autres membres en ligne d’une communauté assez grande', async () => {
    const { value } = await countFor([...crowd(10), online('u-a'), online('u-b')]);
    expect(value).toBe(2);
  });

  it('ne compte jamais le lecteur lui-même', async () => {
    const { value } = await countFor([...crowd(10), online(VIEWER), online('u-a')]);
    expect(value).toBe(1);
  });

  it(`ne sert rien sous ${ONLINE_COUNT_ANONYMITY_FLOOR} autres membres actifs : dans une petite communauté, un compte désigne quelqu’un`, async () => {
    const { value, findMany } = await countFor([...crowd(ONLINE_COUNT_ANONYMITY_FLOOR - 2), online('u-a')]);
    expect(value).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('le plancher ne compte ni le lecteur ni les anciens membres', async () => {
    const formers = crowd(5, 'u-former').map((p) => ({ ...p, memberActive: false }));
    const { value } = await countFor([...crowd(ONLINE_COUNT_ANONYMITY_FLOOR - 1), online(VIEWER), ...formers]);
    expect(value).toBeNull();
  });

  it('un ancien membre en ligne n’entre pas dans le compte', async () => {
    const { value } = await countFor([...crowd(10), online('u-gone', { memberActive: false }), online('u-a')]);
    expect(value).toBe(1);
  });

  it('un membre d’une autre communauté n’entre pas dans le compte', async () => {
    const { value } = await countFor([...crowd(10), online('u-elsewhere', { communityId: 'comm-2' })]);
    expect(value).toBe(0);
  });

  it('suit la règle 1/3/5 : un drapeau isOnline vieux de plus de 5 minutes ne compte pas, une activité de moins d’une minute compte', async () => {
    const stale = online('u-stale', { lastActiveAt: new Date(NOW.getTime() - 6 * 60_000) });
    const away = person('u-away', { lastActiveAt: new Date(NOW.getTime() - 2 * 60_000) });
    const fresh = person('u-fresh', { lastActiveAt: new Date(NOW.getTime() - 30_000) });
    const { value } = await countFor([...crowd(10), stale, away, fresh]);
    expect(value).toBe(1);
  });

  it('exclut un compte non vivant : inactif, désactivé ou supprimé', async () => {
    const { value } = await countFor([
      ...crowd(10),
      online('u-inactive', { isActive: false }),
      online('u-deactivated', { deactivatedAt: NOW }),
      online('u-deleted', { deletedAt: NOW }),
      online('u-a'),
    ]);
    expect(value).toBe(1);
  });

  it('ne dépend pas du lecteur : bloquer la cible ne change pas le compte (sinon bloquer-relire-débloquer serait un oracle)', async () => {
    const people = [...crowd(10), online('u-target'), online('u-a')];
    const before = await countFor(people);
    const afterBlocking = await countFor(people.map((p) => (p.id === 'u-target' ? { ...p, blockedUserIds: [VIEWER] } : p)), ['u-target']);
    expect(afterBlocking.value).toBe(before.value);
  });

  it('le plancher ne compte que des comptes vivants : dix comptes désactivés ne le franchissent pas', async () => {
    const ghosts = crowd(10, 'u-ghost').map((p) => ({ ...p, deactivatedAt: NOW }));
    const { value } = await countFor([...ghosts, online('u-target')]);
    expect(value).toBeNull();
  });

  it('une préférence illisible ne compte pas : fail-closed', async () => {
    const { value } = await countFor([...crowd(10), online('u-no-prefs'), online('u-a')]);
    expect(value).toBe(1);
  });

  it('exclut un membre qui a coupé « afficher mon statut en ligne »', async () => {
    const { value } = await countFor([...crowd(10), online('u-hidden', { showOnlineStatus: false }), online('u-a')]);
    expect(value).toBe(1);
  });

  it('ne lit les préférences que des membres en ligne, jamais de toute la communauté', async () => {
    const { getPreferencesForUsers } = await countFor([...crowd(40), online('u-a')]);
    expect(getPreferencesForUsers).toHaveBeenCalledTimes(1);
    expect(getPreferencesForUsers.mock.calls[0]?.[0]).toEqual([{ id: 'u-a', isAnonymous: false }]);
  });

  it('zéro en ligne rend 0 sans lire les préférences', async () => {
    const { value, getPreferencesForUsers } = await countFor(crowd(12));
    expect(value).toBe(0);
    expect(getPreferencesForUsers).not.toHaveBeenCalled();
  });
});
