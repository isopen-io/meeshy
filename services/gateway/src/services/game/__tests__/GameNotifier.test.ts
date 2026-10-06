/**
 * LES NOTIFICATIONS DU JEU (#9490) — cinq types, au plus UNE par jour et par destinataire (le
 * jour de son fuseau) — hors les duos et la mission du jour (#9541, #9539) —, jamais pour un compte
 * « Jeu masqué » ni qui a coupé « Jeu », dans la
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
  it('la deuxième du même jour est écartée : un résultat de ligue et une étape de saison se partagent le créneau', async () => {
    const { notifier, sent } = world();
    expect(await notifier.notify(leagueResult(), NOW)).toBe('sent');
    expect(await notifier.notify(step(), new Date(NOW.getTime() + 3_600_000))).toBe('skipped:daily-cap');
    expect(await notifier.notify(step({ step: 13 }), new Date(NOW.getTime() + 7_200_000))).toBe('skipped:daily-cap');
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


describe('les duos SORTENT du plafond (décision porteur 2026-10-06, #9541)', () => {
  it('une invitation et une acceptation de duo partent le même jour qu’un résultat de ligue', async () => {
    const { notifier, sent } = world();
    expect(await notifier.notify(leagueResult(), NOW)).toBe('sent');
    expect(await notifier.notify(invited(), new Date(NOW.getTime() + 3_600_000))).toBe('sent');
    expect(
      await notifier.notify({ kind: 'duo-accepted', recipientId: USER, actorId: OTHER, duoId: 'duo-2', weekKey: '2026-10-12' }, new Date(NOW.getTime() + 7_200_000)),
    ).toBe('sent');
    expect(sent.map((s) => s.type)).toEqual(['game_league_result', 'game_duo_invited', 'game_duo_accepted']);
  });

  it('un duo ne prend pas le créneau du jour : le résultat de ligue qui suit part', async () => {
    const { notifier, taken } = world();
    await notifier.notify(invited(), NOW);
    expect([...taken.keys()].filter((key) => key.includes(':day:'))).toEqual([]);
    expect(await notifier.notify(leagueResult(), new Date(NOW.getTime() + 3_600_000))).toBe('sent');
  });

  it('reste annoncé UNE fois par duo, et muet pour « Jeu masqué » ou « Jeu » coupé', async () => {
    const { db, notifier, sent } = world();
    await notifier.notify(invited(), NOW);
    expect(await notifier.notify(invited(), new Date(NOW.getTime() + 3_600_000))).toBe('skipped:duplicate');
    expect(sent).toHaveLength(1);

    db.userPreferences.rows.push({ id: 'p', userId: USER, notification: { gameEnabled: false } });
    expect(await notifier.notify(invited({ duoId: 'duo-9' }), NOW)).toBe('skipped:opted-out');
  });
});

describe('la mission personnelle du jour (#9539)', () => {
  const windowEvent = (over: Partial<Extract<GameNotificationEvent, { kind: 'mission-window' }>> = {}): GameNotificationEvent => ({
    kind: 'mission-window',
    recipientId: USER,
    missionId: 'mission-1',
    dayKey: '2026-10-14',
    templateKey: 'send-voice',
    startsAt: new Date('2026-10-14T16:00:00Z'),
    endsAt: new Date('2026-10-14T18:00:00Z'),
    ...over,
  });

  it('dit sa plage dans le fuseau du destinataire et sa langue de cadrage : « entre 18:00 et 20:00 » à Paris', async () => {
    const { notifier, sent } = world({ recipient: { systemLanguage: 'fr', timezone: 'Europe/Paris' } });

    expect(await notifier.notify(windowEvent(), NOW)).toBe('sent');

    expect(sent[0]).toMatchObject({
      userId: USER,
      type: 'game_mission_window',
      lang: 'fr',
      priority: 'normal',
      collapseId: 'game-mission-2026-10-14',
      content: 'Ta mission du jour : envoyer des messages vocaux, entre 18:00 et 20:00.',
    });
    expect(sent[0]!.actor).toBeUndefined();
  });

  it('porte la navigation vers la section Héros des missions, et les instants de la plage', async () => {
    const { notifier, sent } = world();
    await notifier.notify(windowEvent(), NOW);
    expect(sent[0]!.metadata).toEqual({
      action: 'view_details',
      route: 'progression',
      gameSection: 'missions',
      missionId: 'mission-1',
      dayKey: '2026-10-14',
      templateKey: 'send-voice',
      startsAt: '2026-10-14T16:00:00.000Z',
      endsAt: '2026-10-14T18:00:00.000Z',
    });
  });

  it('ne dit jamais d’où la plage a été tirée : aucune heure habituelle, aucun compte', async () => {
    const { notifier, sent } = world();
    await notifier.notify(windowEvent(), NOW);
    const wire = JSON.stringify(sent[0]);
    for (const forbidden of ['activeHours', 'habit', 'histogram', 'usage']) expect(wire).not.toContain(forbidden);
  });

  it('sort du plafond : elle part le même jour qu’un résultat de ligue, et ne prend pas le créneau', async () => {
    const { notifier, sent, taken } = world();
    expect(await notifier.notify(leagueResult(), NOW)).toBe('sent');
    expect(await notifier.notify(windowEvent(), new Date(NOW.getTime() + 3_600_000))).toBe('sent');
    expect(sent.map((s) => s.type)).toEqual(['game_league_result', 'game_mission_window']);

    const free = world();
    await free.notifier.notify(windowEvent(), NOW);
    expect([...free.taken.keys()].filter((key) => key.includes(':day:'))).toEqual([]);
    expect(taken.size).toBeGreaterThan(0);
  });

  it('s’annonce UNE fois par mission', async () => {
    const { notifier, sent } = world();
    await notifier.notify(windowEvent(), NOW);
    expect(await notifier.notify(windowEvent(), new Date(NOW.getTime() + 60_000))).toBe('skipped:duplicate');
    expect(sent).toHaveLength(1);
  });

  it('respecte « Jeu masqué » et l’interrupteur « Jeu »', async () => {
    const hidden = world();
    hidden.db.gameProfile.rows.push({ id: 'gp', userId: USER, gameHiddenAt: new Date() });
    expect(await hidden.notifier.notify(windowEvent(), NOW)).toBe('skipped:game-hidden');

    const off = world();
    off.db.userPreferences.rows.push({ id: 'p', userId: USER, notification: { gameEnabled: false } });
    expect(await off.notifier.notify(windowEvent(), NOW)).toBe('skipped:opted-out');
    expect(off.sent).toEqual([]);
  });

  it('un refus du service (Ne pas déranger) est rendu tel quel', async () => {
    const { notifier } = world({ declines: true });
    expect(await notifier.notify(windowEvent(), NOW)).toBe('skipped:declined');
  });
});
