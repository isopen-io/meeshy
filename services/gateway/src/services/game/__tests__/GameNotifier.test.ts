/**
 * LES NOTIFICATIONS DU JEU (#9490) — quatre types, au plus UNE par jour et par destinataire (le
 * jour de son fuseau), jamais pour un compte « Jeu masqué » ni qui a coupé « Jeu », dans la
 * langue de cadrage du destinataire, sans jamais nommer un joueur de ligue ni dire une heure.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { GameNotifier, type GameNotificationEvent } from '../GameNotifier';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const NOW = new Date('2026-10-14T12:00:00Z');

type Sent = { userId: string; type: string; content: string; lang?: string; actor?: { id: string; displayName?: string | null }; metadata: Record<string, unknown>; priority: string; collapseId?: string };

const world = (options: { recipient?: Record<string, unknown>; declines?: boolean } = {}) => {
  const db: FakeGameDb = fakeGameDb();
  seedUser(db, { isActive: true, deletedAt: null, systemLanguage: 'en', timezone: 'UTC', ...options.recipient }, USER);
  seedUser(db, { isActive: true, deletedAt: null, username: 'marie', displayName: 'Marie', avatar: 'a.png' }, OTHER);
  const sent: Sent[] = [];
  const notifications = {
    createNotification: jest.fn(async (params: Sent) => {
      sent.push(params);
      return options.declines ? null : ({ id: `n${sent.length}` } as never);
    }),
  };
  const taken = new Map<string, string>();
  const throttle = {
    setnx: jest.fn(async (key: string, value: string) => {
      if (taken.has(key)) return false;
      taken.set(key, value);
      return true;
    }),
  };
  const notifier = new GameNotifier(db.prisma, { notifications: () => notifications as never, throttle });
  return { db, sent, notifier, taken, throttle, notifications };
};

const invited = (overrides: Partial<Extract<GameNotificationEvent, { kind: 'duo-invited' }>> = {}): GameNotificationEvent => ({
  kind: 'duo-invited',
  recipientId: USER,
  actorId: OTHER,
  duoId: 'duo-1',
  weekKey: '2026-10-12',
  ...overrides,
});

const leagueResult = (overrides: Partial<Extract<GameNotificationEvent, { kind: 'league-result' }>> = {}): GameNotificationEvent => ({
  kind: 'league-result',
  recipientId: USER,
  weekKey: '2026-10-05',
  league: 'jade',
  nextLeague: 'ambre',
  zone: 'promotion',
  cup: null,
  ...overrides,
});

const step = (overrides: Partial<Extract<GameNotificationEvent, { kind: 'season-step' }>> = {}): GameNotificationEvent => ({
  kind: 'season-step',
  recipientId: USER,
  season: 1,
  step: 12,
  completed: false,
  ...overrides,
});

describe('une invitation de duo reçue', () => {
  it('part vers l’invité, nomme son AMI, dans la langue de cadrage du destinataire', async () => {
    const { notifier, sent } = world();

    expect(await notifier.notify(invited(), NOW)).toBe('sent');

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      userId: USER,
      type: 'game_duo_invited',
      lang: 'en',
      content: notificationString('en', 'game.duoInvitedBody'),
      actor: { id: OTHER, displayName: 'Marie' },
      metadata: { action: 'view_details', route: 'progression', gameSection: 'duo', duoId: 'duo-1', weekKey: '2026-10-12' },
    });
  });

  it('un duo accepté prévient l’invitant, de la même façon', async () => {
    const { notifier, sent } = world();
    await notifier.notify({ kind: 'duo-accepted', recipientId: USER, actorId: OTHER, duoId: 'duo-1', weekKey: '2026-10-12' }, NOW);
    expect(sent[0]).toMatchObject({ type: 'game_duo_accepted', content: notificationString('en', 'game.duoAcceptedBody'), actor: { id: OTHER } });
  });

  it('un rejeu du MÊME duo n’envoie rien : une invitation, une notification', async () => {
    const { notifier, sent } = world();
    await notifier.notify(invited(), NOW);
    expect(await notifier.notify(invited(), new Date(NOW.getTime() + 3 * 86_400_000))).toBe('skipped:duplicate');
    expect(sent).toHaveLength(1);
  });
});

describe('le résultat de la semaine de ligue', () => {
  it('dit la montée, sans nommer un seul autre joueur, ni un rang, ni une heure', async () => {
    const { notifier, sent } = world();

    await notifier.notify(leagueResult({ zone: 'promotion' }), NOW);

    expect(sent[0]).toMatchObject({
      type: 'game_league_result',
      content: notificationString('en', 'game.leaguePromoted'),
      metadata: { gameSection: 'league', weekKey: '2026-10-05', league: 'jade', outcome: 'promoted', cup: null },
    });
    expect(sent[0]!.actor).toBeUndefined();
    const wire = JSON.stringify(sent[0]);
    for (const forbidden of ['pseudonym', 'rank', 'userId":"68a000000000000000000002', 'minuteOfDay', 'T12:00']) expect(wire).not.toContain(forbidden);
  });

  it('une coupe prime sur la zone ; le maintien et la descente ont chacun leur phrase', async () => {
    const cup = world();
    await cup.notifier.notify(leagueResult({ zone: 'safe', cup: 'gold' }), NOW);
    expect(cup.sent[0]).toMatchObject({ content: notificationString('en', 'game.leagueCupGold'), metadata: { outcome: 'stayed', cup: 'gold' } });

    const down = world();
    await down.notifier.notify(leagueResult({ zone: 'relegation' }), NOW);
    expect(down.sent[0]).toMatchObject({ content: notificationString('en', 'game.leagueRelegated'), metadata: { outcome: 'relegated' } });
  });

  it('une semaine ne s’annonce qu’une fois, même si le règlement est rejoué', async () => {
    const { notifier, sent } = world();
    await notifier.notify(leagueResult(), NOW);
    await notifier.notify(leagueResult(), new Date(NOW.getTime() + 2 * 86_400_000));
    expect(sent).toHaveLength(1);
  });
});

describe('une étape de saison atteinte', () => {
  it('porte son numéro ; la dernière dit la saison terminée', async () => {
    const { notifier, sent } = world();
    await notifier.notify(step({ step: 12 }), NOW);
    expect(sent[0]).toMatchObject({ type: 'game_season_step', content: notificationString('en', 'game.seasonStep', { count: 12 }), metadata: { gameSection: 'season', season: 1, step: 12, completed: false } });

    const done = world();
    await done.notifier.notify(step({ step: 40, completed: true }), NOW);
    expect(done.sent[0]).toMatchObject({ content: notificationString('en', 'game.seasonDone'), metadata: { step: 40, completed: true } });
  });
});

describe('au plus UNE notification de jeu par jour et par destinataire', () => {
  it('la deuxième du même jour est écartée, quel que soit son type', async () => {
    const { notifier, sent } = world();
    expect(await notifier.notify(leagueResult(), NOW)).toBe('sent');
    expect(await notifier.notify(invited(), new Date(NOW.getTime() + 3_600_000))).toBe('skipped:daily-cap');
    expect(await notifier.notify(step(), new Date(NOW.getTime() + 7_200_000))).toBe('skipped:daily-cap');
    expect(sent).toHaveLength(1);
  });

  it('le lendemain, une nouvelle part', async () => {
    const { notifier, sent } = world();
    await notifier.notify(leagueResult(), NOW);
    await notifier.notify(step(), new Date(NOW.getTime() + 86_400_000));
    expect(sent).toHaveLength(2);
  });

  it('le jour est celui du FUSEAU du destinataire, pas celui du serveur', async () => {
    // 23 h 30 UTC le 14 = 8 h 30 le 15 à Tokyo : à 20 minutes d'écart, deux jours pour lui.
    const tokyo = world({ recipient: { timezone: 'Asia/Tokyo' } });
    const late = new Date('2026-10-14T14:50:00Z'); // 23 h 50 le 14 à Tokyo
    const early = new Date('2026-10-14T15:10:00Z'); // 0 h 10 le 15 à Tokyo
    await tokyo.notifier.notify(leagueResult(), late);
    expect(await tokyo.notifier.notify(step(), early)).toBe('sent');

    const utc = world({ recipient: { timezone: 'UTC' } });
    await utc.notifier.notify(leagueResult(), late);
    expect(await utc.notifier.notify(step(), early)).toBe('skipped:daily-cap');
  });

  it('deux destinataires ne se partagent pas le plafond', async () => {
    const { db, notifier, sent } = world();
    seedUser(db, { isActive: true, deletedAt: null, systemLanguage: 'fr' }, '68a000000000000000000009');
    await notifier.notify(leagueResult(), NOW);
    await notifier.notify(leagueResult({ recipientId: '68a000000000000000000009' }), NOW);
    expect(sent.map((s) => s.userId)).toEqual([USER, '68a000000000000000000009']);
  });
});

describe('ce qui n’envoie RIEN', () => {
  it('un compte « Jeu masqué » : tout est compté, rien n’est montré', async () => {
    const { db, notifier, sent } = world();
    db.gameProfile.rows.push({ id: 'gp', userId: USER, gameHiddenAt: new Date() });
    expect(await notifier.notify(leagueResult(), NOW)).toBe('skipped:game-hidden');
    expect(sent).toEqual([]);
  });

  it('un compte qui a coupé « Jeu » (notification.gameEnabled) — et le plafond du jour n’est pas consommé', async () => {
    const { db, notifier, sent, taken } = world();
    db.userPreferences.rows.push({ id: 'p', userId: USER, notification: { gameEnabled: false } });
    expect(await notifier.notify(leagueResult(), NOW)).toBe('skipped:opted-out');
    expect(sent).toEqual([]);
    expect([...taken.keys()].filter((key) => key.includes(':day:'))).toEqual([]);
  });

  it('une préférence absente vaut « reçu » : un document antérieur au réglage', async () => {
    const { db, notifier } = world();
    db.userPreferences.rows.push({ id: 'p', userId: USER, notification: { pushEnabled: true } });
    expect(await notifier.notify(leagueResult(), NOW)).toBe('sent');
  });

  it('un compte supprimé, désactivé ou inconnu', async () => {
    for (const recipient of [{ deletedAt: new Date() }, { isActive: false }]) {
      const { notifier, sent } = world({ recipient });
      expect(await notifier.notify(leagueResult(), NOW)).toBe('skipped:unknown-recipient');
      expect(sent).toEqual([]);
    }
    const { notifier } = world();
    expect(await notifier.notify(leagueResult({ recipientId: '68a0000000000000000000ee' }), NOW)).toBe('skipped:unknown-recipient');
  });

  it('un duo dont l’ami est introuvable ne part pas : on ne nomme personne', async () => {
    const { notifier, sent } = world();
    expect(await notifier.notify(invited({ actorId: '68a0000000000000000000ee' }), NOW)).toBe('skipped:unknown-actor');
    expect(sent).toEqual([]);
  });

  it('un service de notification absent (graine, tests) ne fait rien', async () => {
    const db = fakeGameDb();
    seedUser(db, { isActive: true, deletedAt: null });
    const notifier = new GameNotifier(db.prisma, { notifications: () => undefined, throttle: { setnx: async () => true } });
    expect(await notifier.notify(leagueResult(), NOW)).toBe('skipped:no-notifier');
  });

  it('un refus du service (préférences globales, type désactivé) est rendu tel quel', async () => {
    const { notifier } = world({ declines: true });
    expect(await notifier.notify(leagueResult(), NOW)).toBe('skipped:declined');
  });
});

describe('une panne ne remonte JAMAIS vers le geste de jeu', () => {
  it('un service qui lève, un verrou qui lève : le résultat dit la panne, rien ne se propage', async () => {
    const { db } = world();
    const throwing = new GameNotifier(db.prisma, {
      notifications: () => ({ createNotification: async () => { throw new Error('push down'); } }) as never,
      throttle: { setnx: async () => true },
    });
    await expect(throttleFails(db)).resolves.toBe('failed');
    await expect(throwing.notify(leagueResult(), NOW)).resolves.toBe('failed');
  });
});

async function throttleFails(db: FakeGameDb) {
  const notifier = new GameNotifier(db.prisma, {
    notifications: () => ({ createNotification: async () => ({ id: 'x' }) }) as never,
    throttle: { setnx: async () => { throw new Error('redis down'); } },
  });
  return notifier.notify(leagueResult(), NOW);
}

describe('le créneau du jour ne se brûle pas sur une notification qui n’a pas été créée (revue adversariale #9490)', () => {
  const sequenced = (outcomes: ReadonlyArray<'decline' | 'throw' | 'create'>) => {
    const db: FakeGameDb = fakeGameDb();
    seedUser(db, { isActive: true, deletedAt: null, systemLanguage: 'fr', timezone: 'UTC' }, USER);
    seedUser(db, { isActive: true, deletedAt: null, username: 'marie', displayName: 'Marie' }, OTHER);
    const queue = [...outcomes];
    const taken = new Map<string, string>();
    const throttle = {
      setnx: async (key: string, value: string) => {
        if (taken.has(key)) return false;
        taken.set(key, value);
        return true;
      },
      del: async (key: string) => {
        taken.delete(key);
      },
    };
    const notifications = {
      createNotification: async () => {
        const outcome = queue.shift();
        if (outcome === 'throw') throw new Error('push down');
        return outcome === 'decline' ? null : ({ id: 'n' } as never);
      },
    };
    return new GameNotifier(db.prisma, { notifications: () => notifications as never, throttle });
  };

  it('un refus (Ne pas déranger) rend le créneau : l’invitation de duo qui suit le même jour part', async () => {
    const notifier = sequenced(['decline', 'create']);
    expect(await notifier.notify(leagueResult(), NOW)).toBe('skipped:declined');
    expect(await notifier.notify(invited(), new Date(NOW.getTime() + 3600_000))).toBe('sent');
  });

  it('une panne du service rend le créneau aussi', async () => {
    const notifier = sequenced(['throw', 'create']);
    expect(await notifier.notify(step(), NOW)).toBe('failed');
    expect(await notifier.notify(invited(), new Date(NOW.getTime() + 3600_000))).toBe('sent');
  });
});
