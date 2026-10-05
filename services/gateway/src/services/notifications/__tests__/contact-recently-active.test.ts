/**
 * « X était sur Meeshy récemment » (#8285) — la partie SERVEUR.
 *
 * Quand X redevient actif (socket authentifiée), ses amis acceptés et ceux qui
 * l'ont dans leur carnet sont prévenus — au plus UNE fois toutes les 3 heures
 * par X, jamais si X a masqué sa présence ou coupé le partage, jamais vers un
 * compte bloqué, supprimé, désactivé ou qui a coupé ce type de notification.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => {
  const log = { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  return { enhancedLogger: { ...log, child: () => log }, notificationLogger: log };
});

import {
  announceContactRecentlyActive,
  scheduleContactRecentlyActiveAnnouncement,
  CONTACT_RETURN_WINDOW_SECONDS,
  type ReturnThrottle,
} from '../contact-recently-active';
import { clearPrivacyPreferencesCache } from '../../preferences/privacy-cache';
import { RedisCacheStore } from '../../CacheStore';

const MARIE = '507f1f77bcf86cd799439011';
const ANNA = '507f1f77bcf86cd799439021';
const BOB = '507f1f77bcf86cd799439022';
const ZOE = '507f1f77bcf86cd799439023';
const LEO = '507f1f77bcf86cd799439024';
const T0 = new Date('2026-09-27T08:00:00.000Z');
const HOUR = 60 * 60 * 1000;

type Where = Record<string, unknown>;
type Args = { readonly where: Where; readonly select?: Record<string, unknown> };
type CreatedNotification = {
  readonly userId: string;
  readonly type: string;
  readonly lang?: string;
  readonly content: string;
  readonly collapseId?: string;
  readonly actor?: { readonly id: string; readonly username: string; readonly displayName?: string | null; readonly avatar?: string | null };
  readonly metadata: Record<string, unknown>;
};

const revenant = (overrides: Record<string, unknown> = {}) => ({
  id: MARIE,
  username: 'marie',
  displayName: 'Marie Curie',
  firstName: 'Marie',
  lastName: 'Curie',
  avatar: 'https://cdn/marie.jpg',
  phoneNumber: '+33612345678',
  phoneVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  email: 'marie@exemple.fr',
  emailVerifiedAt: null,
  isActive: true,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const compte = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  isActive: true,
  deletedAt: null,
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
  ...overrides,
});

type Monde = {
  readonly user?: Record<string, unknown> | null;
  readonly friends?: readonly string[];
  readonly bookHolders?: ReadonlyArray<{ readonly ownerId: string; readonly displayName: string | null }>;
  readonly accounts?: ReadonlyArray<ReturnType<typeof compte>>;
  readonly privacy?: Record<string, unknown>;
  readonly notificationPrefs?: Readonly<Record<string, Record<string, unknown>>>;
  readonly blockedBy?: readonly string[];
  readonly blocks?: readonly string[];
};

const inList = (where: Where, key: string): readonly string[] => {
  const clause = where[key] as { in?: readonly string[] } | undefined;
  return clause?.in ?? [];
};

function monde(options: Monde = {}) {
  const user = options.user === undefined ? revenant() : options.user;
  const accounts = options.accounts ?? [];
  const prisma = {
    user: {
      findUnique: jest.fn(async (args: Args) => {
        if (args.where.id === MARIE && args.select && 'blockedUserIds' in args.select) {
          return { blockedUserIds: [...(options.blocks ?? [])] };
        }
        return args.where.id === MARIE ? user : null;
      }),
      findMany: jest.fn(async (args: Args) => {
        if (args.where.blockedUserIds) return (options.blockedBy ?? []).map((id) => ({ id }));
        const ids = inList(args.where, 'id');
        return accounts.filter((account) => ids.includes(account.id));
      }),
    },
    friendRequest: {
      findMany: jest.fn(async () => (options.friends ?? []).map((id) => ({ senderId: MARIE, receiverId: id }))),
    },
    userContact: {
      findMany: jest.fn(async () => [...(options.bookHolders ?? [])]),
    },
    userPreferences: {
      findMany: jest.fn(async (args: Args) => {
        const ids = inList(args.where, 'userId');
        if (args.select && 'privacy' in args.select) {
          return ids.includes(MARIE) ? [{ userId: MARIE, privacy: { ...(options.privacy ?? {}) } }] : [];
        }
        return ids
          .filter((id) => options.notificationPrefs?.[id])
          .map((id) => ({ userId: id, notification: options.notificationPrefs?.[id] }));
      }),
    },
    userPreference: { findMany: jest.fn(async () => []) },
  };
  const created: CreatedNotification[] = [];
  const createNotification = jest.fn(async (params: CreatedNotification) => {
    created.push(params);
    return { id: `n-${created.length}` };
  });
  return { prisma, createNotification, created };
}

/** Un verrou à la sémantique de `SET NX EX`, sur l'horloge du témoin. */
function horlogeEtVerrou(start: Date) {
  let now = start.getTime();
  const held = new Map<string, number>();
  const throttle: ReturnThrottle = {
    setnx: async (key, _value, ttlSeconds) => {
      const until = held.get(key);
      if (until !== undefined && until > now) return false;
      held.set(key, now + (ttlSeconds ?? 0) * 1000);
      return true;
    },
  };
  return {
    throttle,
    now: () => new Date(now),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const run = (m: ReturnType<typeof monde>, clock = horlogeEtVerrou(T0)) =>
  announceContactRecentlyActive(
    {
      prisma: m.prisma as never,
      notifications: { createNotification: m.createNotification as never },
      throttle: clock.throttle,
      now: clock.now,
    },
    MARIE
  );

beforeEach(() => clearPrivacyPreferencesCache());

describe('au plus une notification toutes les 3 heures par personne revenue', () => {
  it('4 connexions en 1 heure donnent 1 notification', async () => {
    const m = monde({ friends: [ANNA], accounts: [compte(ANNA)] });
    const clock = horlogeEtVerrou(T0);

    for (const minutes of [0, 15, 30, 55]) {
      clock.advance(minutes === 0 ? 0 : 15 * 60 * 1000);
      await run(m, clock);
    }

    expect(m.created).toHaveLength(1);
  });

  it('3 heures plus tard, une connexion en redonne une', async () => {
    const m = monde({ friends: [ANNA], accounts: [compte(ANNA)] });
    const clock = horlogeEtVerrou(T0);

    await run(m, clock);
    clock.advance(CONTACT_RETURN_WINDOW_SECONDS * 1000);
    await run(m, clock);

    expect(m.created).toHaveLength(2);
    expect(CONTACT_RETURN_WINDOW_SECONDS).toBe(3 * 60 * 60);
  });

  it('deux connexions SIMULTANÉES ne notifient qu’une fois — sur le vrai verrou de la passerelle, sans Redis', async () => {
    const m = monde({ friends: [ANNA, BOB], accounts: [compte(ANNA), compte(BOB)] });
    const store = new RedisCacheStore('');
    try {
      const deps = {
        prisma: m.prisma as never,
        notifications: { createNotification: m.createNotification as never },
        throttle: store,
        now: () => T0,
      };
      const reports = await Promise.all([
        announceContactRecentlyActive(deps, MARIE),
        announceContactRecentlyActive(deps, MARIE),
        announceContactRecentlyActive(deps, MARIE),
      ]);

      expect(m.created.map((n) => n.userId).sort()).toEqual([ANNA, BOB]);
      expect(reports.filter((r) => r.outcome === 'announced')).toHaveLength(1);
      expect(reports.filter((r) => r.outcome === 'skipped' && r.reason === 'throttled')).toHaveLength(2);
    } finally {
      await store.close();
    }
  });

  it('le verrou est pris sur la clé de la personne revenue, pour 3 heures', async () => {
    const m = monde({ friends: [ANNA], accounts: [compte(ANNA)] });
    const calls: Array<readonly [string, number | undefined]> = [];
    const throttle: ReturnThrottle = {
      setnx: async (key, _value, ttl) => {
        calls.push([key, ttl]);
        return true;
      },
    };

    await announceContactRecentlyActive(
      { prisma: m.prisma as never, notifications: { createNotification: m.createNotification as never }, throttle, now: () => T0 },
      MARIE
    );

    expect(calls).toEqual([[`notif:contact-return:${MARIE}`, 10800]]);
  });
});

describe('le verrou de l’émetteur : sa présence et son réglage', () => {
  it('présence masquée : aucune notification, et le verrou n’est pas consommé', async () => {
    const m = monde({ friends: [ANNA], accounts: [compte(ANNA)], privacy: { showOnlineStatus: false } });
    const clock = horlogeEtVerrou(T0);

    const report = await run(m, clock);

    expect(report).toEqual({ outcome: 'skipped', reason: 'presence-hidden' });
    expect(m.created).toHaveLength(0);
    expect(await clock.throttle.setnx(`notif:contact-return:${MARIE}`, 'x', 1)).toBe(true);
  });

  it('« Prévenir mes contacts » coupé : aucune notification', async () => {
    const m = monde({ friends: [ANNA], accounts: [compte(ANNA)], privacy: { notifyContactsOnReturn: false } });

    expect(await run(m)).toEqual({ outcome: 'skipped', reason: 'opted-out' });
    expect(m.created).toHaveLength(0);
  });

  it('un compte qui n’a jamais réglé la bascule est prévenant par défaut', async () => {
    const m = monde({ friends: [ANNA], accounts: [compte(ANNA)], privacy: {} });

    await run(m);

    expect(m.created).toHaveLength(1);
  });

  it('un compte créé il y a moins de 3 heures ne s’annonce pas « revenu » — « X a rejoint Meeshy » s’en charge', async () => {
    const m = monde({ user: revenant({ createdAt: new Date(T0.getTime() - HOUR) }), friends: [ANNA], accounts: [compte(ANNA)] });

    expect(await run(m)).toEqual({ outcome: 'skipped', reason: 'newcomer' });
  });

  it('un compte supprimé ou désactivé ne s’annonce pas', async () => {
    for (const user of [revenant({ deletedAt: new Date('2026-09-01T00:00:00Z') }), revenant({ isActive: false }), null]) {
      const m = monde({ user, friends: [ANNA], accounts: [compte(ANNA)] });
      expect(await run(m)).toEqual({ outcome: 'skipped', reason: 'unknown-user' });
      expect(m.created).toHaveLength(0);
    }
  });
});

describe('les destinataires : amis acceptés ET porteurs du carnet, dédoublonnés', () => {
  it('un porteur du carnet NON ami reçoit la notification, sous le nom de SON carnet', async () => {
    const m = monde({ bookHolders: [{ ownerId: ZOE, displayName: 'Maman' }], accounts: [compte(ZOE, { systemLanguage: 'en' })] });

    await run(m);

    expect(m.created).toHaveLength(1);
    expect(m.created[0]).toMatchObject({ userId: ZOE, type: 'contact_recently_active', lang: 'en', content: 'A good moment to say hi 👋' });
    expect(m.created[0]?.actor).toEqual({ id: MARIE, username: 'marie', displayName: 'Maman', avatar: 'https://cdn/marie.jpg' });
  });

  it('un doublon ami + carnet ne reçoit qu’une notification', async () => {
    const m = monde({
      friends: [ANNA],
      bookHolders: [{ ownerId: ANNA, displayName: 'Nana' }, { ownerId: ANNA, displayName: null }],
      accounts: [compte(ANNA)],
    });

    await run(m);

    expect(m.created.map((n) => n.userId)).toEqual([ANNA]);
  });

  it('un destinataire bloqué — dans un sens comme dans l’autre — ne reçoit rien', async () => {
    const m = monde({
      friends: [ANNA, BOB, LEO],
      accounts: [compte(ANNA), compte(BOB), compte(LEO)],
      blockedBy: [ANNA],
      blocks: [BOB],
    });

    await run(m);

    expect(m.created.map((n) => n.userId)).toEqual([LEO]);
  });

  it('un destinataire supprimé ou désactivé ne reçoit rien', async () => {
    const m = monde({
      friends: [ANNA, BOB, LEO],
      accounts: [compte(ANNA, { deletedAt: new Date() }), compte(BOB, { isActive: false }), compte(LEO)],
    });

    await run(m);

    expect(m.created.map((n) => n.userId)).toEqual([LEO]);
  });

  it('un destinataire qui a coupé « Quand un contact revient » ne reçoit rien', async () => {
    const m = monde({
      friends: [ANNA, LEO],
      accounts: [compte(ANNA), compte(LEO)],
      notificationPrefs: { [ANNA]: { contactActivityEnabled: false } },
    });

    await run(m);

    expect(m.created.map((n) => n.userId)).toEqual([LEO]);
  });

  it('X lui-même n’est jamais destinataire', async () => {
    const m = monde({ friends: [MARIE, ANNA], bookHolders: [{ ownerId: MARIE, displayName: 'moi' }], accounts: [compte(MARIE), compte(ANNA)] });

    await run(m);

    expect(m.created.map((n) => n.userId)).toEqual([ANNA]);
  });

  it('caché de la recherche : ses amis sont prévenus, les carnets non — être trouvé n’a pas été consenti', async () => {
    const m = monde({
      friends: [ANNA],
      bookHolders: [{ ownerId: ZOE, displayName: 'Maman' }],
      accounts: [compte(ANNA), compte(ZOE)],
      privacy: { hideProfileFromSearch: true },
    });

    await run(m);

    expect(m.created.map((n) => n.userId)).toEqual([ANNA]);
    expect(m.prisma.userContact.findMany).not.toHaveBeenCalled();
  });

  it('la résolution est EN LOT : le nombre de requêtes ne dépend pas du nombre de destinataires', async () => {
    const many = Array.from({ length: 40 }, (_, i) => `507f1f77bcf86cd7994391${String(i).padStart(2, '0')}`);
    const m = monde({ friends: many.slice(0, 20), bookHolders: many.slice(20).map((ownerId) => ({ ownerId, displayName: null })), accounts: many.map((id) => compte(id)) });

    await run(m);

    expect(m.created).toHaveLength(40);
    expect(m.prisma.user.findMany.mock.calls.length).toBeLessThanOrEqual(2);
    expect(m.prisma.userPreferences.findMany.mock.calls.length).toBeLessThanOrEqual(2);
    expect(m.prisma.friendRequest.findMany).toHaveBeenCalledTimes(1);
    expect(m.prisma.userContact.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('ce que la notification porte', () => {
  it('le toucher ouvre le profil de X : l’acteur et la métadonnée le nomment, rien d’autre ne voyage', async () => {
    const m = monde({ friends: [ANNA], accounts: [compte(ANNA)] });

    await run(m);

    const [sent] = m.created;
    expect(sent).toMatchObject({ type: 'contact_recently_active', lang: 'fr', content: "C'est le moment de lui écrire 👋" });
    expect(sent?.metadata).toEqual({ action: 'view_profile', userId: MARIE });
    expect(sent?.actor?.id).toBe(MARIE);
    expect(sent?.collapseId).toBe(`contact-return-${MARIE}`);
    const charge = JSON.stringify(sent);
    expect(charge).not.toContain('+33612345678');
    expect(charge).not.toContain('marie@exemple.fr');
  });
});

describe('le déclencheur ne ralentit pas la connexion', () => {
  afterEach(() => jest.useRealTimers());

  it('la tâche part APRÈS l’appel et ses erreurs sont interceptées', async () => {
    const tasks: Array<() => Promise<void>> = [];
    const failing = { createNotification: jest.fn(async () => { throw new Error('boom'); }) };
    const m = monde({ friends: [ANNA], accounts: [compte(ANNA)] });

    scheduleContactRecentlyActiveAnnouncement(m.prisma as never, MARIE, {
      afterResponse: (task) => { tasks.push(task); },
      notifications: failing as never,
      throttle: horlogeEtVerrou(T0).throttle,
    });

    expect(tasks).toHaveLength(1);
    expect(failing.createNotification).not.toHaveBeenCalled();
    await expect(tasks[0]?.()).resolves.toBeUndefined();
  });

  it('sans service de notification (seed, tests), rien n’est programmé', () => {
    const tasks: Array<() => Promise<void>> = [];
    scheduleContactRecentlyActiveAnnouncement(monde().prisma as never, MARIE, {
      afterResponse: (task) => { tasks.push(task); },
    });
    expect(tasks).toHaveLength(0);
  });
});
