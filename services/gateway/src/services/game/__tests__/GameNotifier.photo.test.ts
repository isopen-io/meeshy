/**
 * LE PUSH D'UNE ÉTAPE FRANCHIE APP FERMÉE (#10175, L19 — § 5.16.4) : `game_photo_moment` passe par
 * `GameNotifier`, comme les autres notifications du jeu. Il compte dans le plafond d'une notification de
 * jeu par jour (D9) mais, contrairement à un résultat de ligue, il se DIFFÈRE : un créneau déjà pris rend
 * sa clé « une seule fois », et la prochaine fenêtre permise le reprend. Il remplace le précédent
 * (même `collapseId`), se cadre dans la langue du destinataire et ne dit jamais quelle étape.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { GameNotifier, type GameNotificationEvent } from '../GameNotifier';
import { fakeGameDb, seedUser, USER } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const NOW = new Date('2026-10-14T12:00:00Z');

type Sent = { userId: string; type: string; content: string; lang?: string; metadata: Record<string, unknown>; priority: string; collapseId?: string };

const world = (recipient: Record<string, unknown> = {}) => {
  const db = fakeGameDb();
  seedUser(db, { isActive: true, deletedAt: null, systemLanguage: 'en', timezone: 'UTC', ...recipient }, USER);
  const sent: Sent[] = [];
  const notifications = { createNotification: jest.fn(async (params: Sent) => (sent.push(params), { id: `n${sent.length}` } as never)) };
  const taken = new Map<string, string>();
  const throttle = {
    setnx: jest.fn(async (key: string, value: string) => (taken.has(key) ? false : (taken.set(key, value), true))),
    del: jest.fn(async (key: string) => void taken.delete(key)),
  };
  const notifier = new GameNotifier(db.prisma, { notifications: () => notifications as never, throttle });
  return { db, sent, notifier, taken };
};

const photo = (stepIds: readonly string[], dayKey = '2026-10-14'): GameNotificationEvent => ({ kind: 'photo-moment', recipientId: USER, stepIds, dayKey });

const league: GameNotificationEvent = { kind: 'league-result', recipientId: USER, weekKey: '2026-10-05', league: 'jade', nextLeague: 'ambre', zone: 'safe', cup: null };

describe('le push photo (game_photo_moment)', () => {
  it('une étape : la phrase au singulier, dans la langue de cadrage, ouvre le carnet, ne nomme pas l’étape', async () => {
    const { notifier, sent } = world({ systemLanguage: 'de', regionalLanguage: 'en' });

    expect(await notifier.notify(photo(['rank:echo:3']), NOW)).toBe('sent');

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: 'game_photo_moment',
      lang: 'de',
      content: notificationString('de', 'game.photoMoment', { count: 1 }),
      collapseId: 'game-photo-moment',
      metadata: { action: 'view_details', route: 'progression', gameSection: 'carnet', count: 1, focusStepId: 'rank:echo:3' },
    });
    expect(sent[0]?.content).not.toContain('echo');
  });

  it('plusieurs étapes : UNE notification groupée qui dit leur nombre', async () => {
    const { notifier, sent } = world();

    expect(await notifier.notify(photo(['rank:echo:3', 'flame:7', 'meesh:10']), NOW)).toBe('sent');

    expect(sent).toHaveLength(1);
    expect(sent[0]?.content).toBe(notificationString('en', 'game.photoMoments', { count: 3 }));
    expect(sent[0]?.metadata).toMatchObject({ count: 3 });
  });

  it('compte dans le plafond : un résultat de ligue le même jour ne part plus (B-5)', async () => {
    const { notifier, sent } = world();

    expect(await notifier.notify(photo(['flame:7']), NOW)).toBe('sent');
    expect(await notifier.notify(league, NOW)).toBe('skipped:daily-cap');
    expect(sent).toHaveLength(1);
  });

  it('créneau du jour déjà pris : DIFFÉRÉ — sa clé se rend, le lendemain il part', async () => {
    const { notifier, sent } = world();

    expect(await notifier.notify(league, NOW)).toBe('sent');
    expect(await notifier.notify(photo(['flame:7']), NOW)).toBe('skipped:daily-cap');
    expect(await notifier.notify(photo(['flame:7']), NOW)).toBe('skipped:daily-cap');

    const tomorrow = new Date('2026-10-15T12:00:00Z');
    expect(await notifier.notify(photo(['flame:7'], '2026-10-15'), tomorrow)).toBe('sent');
    expect(sent.map((s) => s.type)).toEqual(['game_league_result', 'game_photo_moment']);
  });

  it('le même résumé ne part qu’une fois par jour ; un résumé différent est un autre événement', async () => {
    const { notifier } = world();

    expect(await notifier.notify(photo(['flame:7', 'rank:echo:3']), NOW)).toBe('sent');
    expect(await notifier.notify(photo(['rank:echo:3', 'flame:7']), NOW)).toBe('skipped:duplicate');
  });

  it('« Jeu masqué » : rien', async () => {
    const { notifier, sent, db } = world();
    db.gameProfile.rows.push({ id: 'gp', userId: USER, gameHiddenAt: new Date() });

    expect(await notifier.notify(photo(['flame:7']), NOW)).toBe('skipped:game-hidden');
    expect(sent).toHaveLength(0);
  });
  it('refusé par la création (Ne pas déranger franchi entre le contrôle et l’envoi) : rien ne part, et le passage suivant le REPREND au lieu de le lire « déjà parti »', async () => {
    const { sent, db } = world();
    const refusing = { createNotification: jest.fn(async () => null) };
    const taken = new Map<string, string>();
    const throttle = {
      setnx: jest.fn(async (key: string, value: string) => (taken.has(key) ? false : (taken.set(key, value), true))),
      del: jest.fn(async (key: string) => void taken.delete(key)),
    };
    const declining = new GameNotifier(db.prisma, { notifications: () => refusing as never, throttle });
    expect(await declining.notify(photo(['flame:7']), NOW)).toBe('skipped:declined');

    const accepting = new GameNotifier(db.prisma, { notifications: () => ({ createNotification: async (params: Sent) => (sent.push(params), { id: 'n1' }) }) as never, throttle });
    expect(await accepting.notify(photo(['flame:7']), NOW)).toBe('sent');
    expect(sent).toHaveLength(1);
  });
});
