import { describe, expect, test } from 'bun:test';

import { scriptedGateway } from '@/test-support/scripted-transport';

import {
  decodeMessagesEngagement,
  decodeMessagesStats,
  decodeMessagesTrends,
  loadMessagesEngagement,
  loadMessagesStats,
  loadMessagesTrends,
} from './admin-message-stats';

const USER = '64f1c2a9e8b7d6c5b4a39281';
const PARTICIPANT = '64f1c2a9e8b7d6c5b4a39282';

const statsPayload = (extra: Readonly<Record<string, unknown>> = {}) => ({
  totalMessages: 1200,
  deletedMessages: 30,
  editedMessages: 45,
  messagesByType: { text: 1000, image: 150, audio: 50 },
  messagesByPeriod: [
    { date: '2026-09-29', count: 500 },
    { date: '2026-09-30', count: 700 },
  ],
  averageLength: 58,
  translatedMessages: 600,
  translatedPercentage: 50,
  topSenders: [{ userId: USER, username: 'awa', displayName: 'Awa Diop', messageCount: 320 }],
  messagesWithAttachments: 200,
  attachmentRate: 17,
  period: '30d',
  ...extra,
});

describe('decodeMessagesStats — des comptes, aucun contenu', () => {
  test('forme figée : les champs affichés, le type servi en code, les jours en vraies dates', () => {
    expect(decodeMessagesStats(statsPayload())).toEqual({
      totalMessages: 1200,
      deletedMessages: 30,
      editedMessages: 45,
      averageLength: 58,
      translatedMessages: 600,
      translatedPercentage: 50,
      messagesWithAttachments: 200,
      attachmentRate: 17,
      byType: [
        { type: 'text', count: 1000 },
        { type: 'image', count: 150 },
        { type: 'audio', count: 50 },
      ],
      byDay: [
        { date: '2026-09-29', count: 500 },
        { date: '2026-09-30', count: 700 },
      ],
      topSenders: [{ userId: USER, username: 'awa', displayName: 'Awa Diop', messageCount: 320, guest: false }],
    });
  });

  test('un jour dont la date n’est pas réelle est écarté', () => {
    const stats = decodeMessagesStats(statsPayload({ messagesByPeriod: [{ date: 'mardi', count: 3 }, { date: '2026-09-30', count: 4 }] }));
    expect(stats?.byDay).toEqual([{ date: '2026-09-30', count: 4 }]);
  });

  test('un invité sort avec le littéral « Unknown » et l’identifiant de son PARTICIPANT : il est lu comme invité, sans pseudo', () => {
    const stats = decodeMessagesStats(statsPayload({ topSenders: [{ userId: PARTICIPANT, username: 'Unknown', messageCount: 7 }] }));
    expect(stats?.topSenders).toEqual([{ userId: PARTICIPANT, username: null, displayName: null, messageCount: 7, guest: true }]);
  });

  test('un compte sans nom affiché garde son pseudo et n’est pas un invité', () => {
    const stats = decodeMessagesStats(statsPayload({ topSenders: [{ userId: USER, username: 'awa', messageCount: 7 }] }));
    expect(stats?.topSenders).toEqual([{ userId: USER, username: 'awa', displayName: null, messageCount: 7, guest: false }]);
  });

  test('ne laisse passer aucun champ voisin d’un expéditeur', () => {
    const stats = decodeMessagesStats(
      statsPayload({ topSenders: [{ userId: USER, username: 'awa', displayName: 'Awa', messageCount: 7, email: 'awa@example.org', content: 'secret' }] }),
    );
    expect(Object.keys(stats?.topSenders[0] ?? {}).sort()).toEqual(['displayName', 'guest', 'messageCount', 'userId', 'username']);
  });

  test('un expéditeur sans identifiant est écarté', () => {
    expect(decodeMessagesStats(statsPayload({ topSenders: [{ username: 'awa', messageCount: 3 }] }))?.topSenders).toEqual([]);
  });

  test('envoie la période demandée', async () => {
    const { deps, calls } = scriptedGateway({ 'GET /api/v1/admin/messages/stats?period=90d': { ok: true, data: statsPayload() } });
    expect((await loadMessagesStats({ ...deps, period: '90d' })).ok).toBe(true);
    expect(calls().map((call) => call.path)).toEqual(['/api/v1/admin/messages/stats?period=90d']);
  });

  test('une charge qui n’est pas un objet est illisible', async () => {
    const { deps } = scriptedGateway({ 'GET /api/v1/admin/messages/stats?period=24h': { ok: true, data: null } });
    expect(await loadMessagesStats({ ...deps, period: '24h' })).toEqual({ ok: false, status: 0, error: 'Statistiques de messages illisible' });
  });
});

const hours = (counts: Readonly<Record<number, number>>) => Array.from({ length: 24 }, (_, hour) => ({ hour: `${hour}h`, count: counts[hour] ?? 0 }));
const days = (counts: Readonly<Record<number, number>>) =>
  ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map((day, index) => ({ day, count: counts[index] ?? 0 }));

describe('decodeMessagesTrends — le pic se lit par indice, jamais par le libellé français', () => {
  test('forme figée : 24 heures et 7 jours par position, pics par indice', () => {
    const trends = decodeMessagesTrends({
      peakHour: { hour: 14, label: '14h', count: 80 },
      peakWeekday: { day: 2, label: 'Mardi', count: 300 },
      hourlyActivity: hours({ 14: 80, 9: 20 }),
      weekdayActivity: days({ 2: 300, 5: 100 }),
    });

    expect(trends).toEqual({
      peakHour: { index: 14, count: 80 },
      peakWeekday: { index: 2, count: 300 },
      hourly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0, 0, 0, 0, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      weekday: [0, 0, 300, 0, 0, 100, 0],
    });
  });

  test('sans aucun message, il n’y a PAS de pic — le repli « minuit, 0 message » du serveur ne se lit pas comme un pic', () => {
    const trends = decodeMessagesTrends({
      peakHour: { hour: 0, label: '0h', count: 0 },
      peakWeekday: { day: 0, label: 'Dimanche', count: 0 },
      hourlyActivity: hours({}),
      weekdayActivity: days({}),
    });
    expect(trends?.peakHour).toBeNull();
    expect(trends?.peakWeekday).toBeNull();
  });

  test('une série qui n’a pas ses 24 heures ou ses 7 jours est illisible : la position ferait mentir les libellés', () => {
    const base = { peakHour: { hour: 1, count: 1 }, peakWeekday: { day: 1, count: 1 } };
    expect(decodeMessagesTrends({ ...base, hourlyActivity: hours({}).slice(0, 23), weekdayActivity: days({}) })).toBeNull();
    expect(decodeMessagesTrends({ ...base, hourlyActivity: hours({}), weekdayActivity: days({}).slice(1) })).toBeNull();
  });

  test('un pic dont l’indice sort des bornes est écarté, la série reste', () => {
    const trends = decodeMessagesTrends({
      peakHour: { hour: 30, count: 5 },
      peakWeekday: { day: 9, count: 5 },
      hourlyActivity: hours({}),
      weekdayActivity: days({}),
    });
    expect(trends?.peakHour).toBeNull();
    expect(trends?.peakWeekday).toBeNull();
    expect(trends?.hourly).toHaveLength(24);
  });

  test('un échec traverse, une charge illisible échoue à status 0', async () => {
    const down = scriptedGateway({ 'GET /api/v1/admin/messages/trends': { ok: false, status: 500, error: 'boom' } });
    expect(await loadMessagesTrends(down.deps)).toEqual({ ok: false, status: 500, error: 'boom' });
    const bad = scriptedGateway({ 'GET /api/v1/admin/messages/trends': { ok: true, data: { peakHour: {} } } });
    expect(await loadMessagesTrends(bad.deps)).toEqual({ ok: false, status: 0, error: 'Tendances illisible' });
  });
});

describe('decodeMessagesEngagement', () => {
  test('forme figée', () => {
    const payload = {
      totalMessages: 100,
      messagesWithReactions: 30,
      messagesWithReplies: 20,
      totalReactions: 75,
      totalReplies: 25,
      reactionRate: 30,
      replyRate: 20,
      avgReactionsPerMessage: 0.8,
      avgRepliesPerMessage: 0.3,
    };
    expect(decodeMessagesEngagement(payload)).toEqual(payload);
  });

  test('une valeur illisible est null, jamais zéro', () => {
    expect(decodeMessagesEngagement({ reactionRate: 'x' })?.reactionRate).toBeNull();
  });

  test('envoie la période demandée', async () => {
    const { deps, calls } = scriptedGateway({ 'GET /api/v1/admin/messages/engagement?period=30d': { ok: true, data: {} } });
    expect((await loadMessagesEngagement({ ...deps, period: '30d' })).ok).toBe(true);
    expect(calls()).toHaveLength(1);
  });
});
