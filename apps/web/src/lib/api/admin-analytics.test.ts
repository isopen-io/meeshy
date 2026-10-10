import { describe, expect, test } from 'bun:test';

import { scriptedGateway } from '@/test-support/scripted-transport';

import {
  decodeAnalyticsCalls,
  decodeAnalyticsKpis,
  decodeAnalyticsRealtime,
  decodeHourlyActivity,
  decodeMessageTypes,
  decodeUserDistribution,
  decodeVolumeTimeline,
  loadAnalyticsCalls,
  loadAnalyticsKpis,
  loadAnalyticsMessageTypes,
  loadAnalyticsRealtime,
} from './admin-analytics';

const callsPayload = (extra: Readonly<Record<string, unknown>> = {}) => ({
  windowDays: 7,
  sampled: false,
  rowsWithTelemetry: 40,
  totalCalls: 40,
  videoShare: 0.25,
  connectSuccessRate: 0.9,
  callFailureRate: 0.05,
  avgSetupTimeMs: 820,
  avgNegotiationTimeMs: null,
  avgDurationSeconds: 184.5,
  avgReconnectionCount: 0.3,
  reconnectionRate: 0.2,
  avgNetworkTransitions: 0.1,
  avgRtt: 64,
  avgPacketLoss: 1.5,
  maxPacketLoss: 12,
  qualityDistribution: { excellent: 0.6, good: 0.25, fair: 0.1, poor: 0.05 },
  byPlatform: { ios: 10, web: 25, android: 5 },
  byEndReason: { completed: 20, failed: 2, local: 18 },
  feedback: { ratedCalls: 4, avgRating: 4.25, ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 }, byIssue: { echo: 2, dropped: 1 } },
  ...extra,
});

describe('decodeAnalyticsKpis — les quatre indicateurs, jamais les deux codés en dur', () => {
  test('ne garde que les taux calculés : ni avgSessionTime ni peakHours', () => {
    const kpis = decodeAnalyticsKpis({
      engagementRate: 42,
      avgSessionTime: '2h 45m',
      peakHours: '18h-21h',
      growthRate: 7,
      messagesPerUser: 13,
      activeUserRate: 42,
    });

    expect(kpis).toEqual({ engagementRate: 42, growthRate: 7, messagesPerUser: 13, activeUserRate: 42 });
  });

  test('une valeur absente est null, jamais zéro — « aucune activité » ne se fabrique pas', () => {
    expect(decodeAnalyticsKpis({ engagementRate: 'beaucoup', growthRate: -3 })).toEqual({
      engagementRate: null,
      growthRate: null,
      messagesPerUser: null,
      activeUserRate: null,
    });
  });

  test('une charge qui n’est pas un objet est illisible', () => {
    expect(decodeAnalyticsKpis(null)).toBeNull();
    expect(decodeAnalyticsKpis([])).toBeNull();
  });

  test('envoie la période demandée', async () => {
    const { deps, calls } = scriptedGateway({
      'GET /api/v1/admin/analytics/kpis?period=90d': { ok: true, data: { engagementRate: 10, growthRate: 1, messagesPerUser: 2, activeUserRate: 10 } },
    });
    const result = await loadAnalyticsKpis({ ...deps, period: '90d' });

    expect(result).toEqual({ ok: true, data: { engagementRate: 10, growthRate: 1, messagesPerUser: 2, activeUserRate: 10 } });
    expect(calls().map((call) => call.path)).toEqual(['/api/v1/admin/analytics/kpis?period=90d']);
  });
});

describe('decodeAnalyticsRealtime', () => {
  test('lit les trois compteurs et l’instant de mesure', () => {
    expect(decodeAnalyticsRealtime({ onlineUsers: 12, messagesLastHour: 340, activeConversations: 9, timestamp: '2026-09-30T10:00:00.000Z' })).toEqual({
      onlineUsers: 12,
      messagesLastHour: 340,
      activeConversations: 9,
      timestamp: '2026-09-30T10:00:00.000Z',
    });
  });

  test('un échec de la passerelle traverse tel quel', async () => {
    const { deps } = scriptedGateway({ 'GET /api/v1/admin/analytics/realtime': { ok: false, status: 403, error: 'Forbidden' } });
    expect(await loadAnalyticsRealtime(deps)).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  test('une charge illisible devient un échec à status 0', async () => {
    const { deps } = scriptedGateway({ 'GET /api/v1/admin/analytics/realtime': { ok: true, data: 'nope' } });
    expect(await loadAnalyticsRealtime(deps)).toEqual({ ok: false, status: 0, error: 'Temps réel illisible' });
  });
});

describe('les séries positionnelles sont tout ou rien', () => {
  test('le volume des jours : les valeurs, sans le libellé français du serveur', () => {
    expect(decodeVolumeTimeline([{ date: 'lun. 29/09', messages: 4 }, { date: 'mar. 30/09', messages: 9 }])).toEqual([4, 9]);
  });

  test('une ligne illisible rend la série entière illisible — écarter décalerait les jours, zéro mentirait', () => {
    expect(decodeVolumeTimeline([{ messages: 4 }, { messages: 'x' }, { messages: 7 }])).toBeNull();
    expect(decodeVolumeTimeline({ messages: 4 })).toBeNull();
  });

  test('la distribution : les comptes par position, sans nom ni couleur servis', () => {
    expect(
      decodeUserDistribution([
        { name: 'Très actifs', value: 5, color: '#10b981' },
        { name: 'Actifs', value: 10, color: '#3b82f6' },
        { name: 'Occasionnels', value: 20, color: '#f59e0b' },
        { name: 'Inactifs', value: 65, color: '#ef4444' },
      ]),
    ).toEqual([5, 10, 20, 65]);
  });

  test('un compte négatif n’est pas un compte', () => {
    expect(decodeUserDistribution([{ value: -1 }])).toBeNull();
  });
});

describe('decodeHourlyActivity — l’heure se lit en nombre, pas en libellé', () => {
  test('« 14h » devient 14 ; une tranche dont l’heure est illisible est écartée', () => {
    expect(
      decodeHourlyActivity([
        { hour: '09h', activity: 3 },
        { hour: '14h', activity: 8 },
        { hour: 'soir', activity: 99 },
        { hour: '27h', activity: 99 },
      ]),
    ).toEqual([
      { hour: 9, messages: 3 },
      { hour: 14, messages: 8 },
    ]);
  });
});

describe('decodeMessageTypes', () => {
  test('garde le type servi, son compte et son pourcentage (0–100)', () => {
    expect(decodeMessageTypes([{ type: 'text', count: 90, percentage: 90 }, { type: 'image', count: 10, percentage: 10 }])).toEqual([
      { type: 'text', count: 90, percentage: 90 },
      { type: 'image', count: 10, percentage: 10 },
    ]);
  });

  test('écarte une ligne sans type', async () => {
    expect(decodeMessageTypes([{ count: 1, percentage: 1 }])).toEqual([]);
    const { deps, calls } = scriptedGateway({ 'GET /api/v1/admin/analytics/message-types?period=24h': { ok: true, data: [] } });
    expect(await loadAnalyticsMessageTypes({ ...deps, period: '24h' })).toEqual({ ok: true, data: [] });
    expect(calls()).toHaveLength(1);
  });
});

describe('decodeAnalyticsCalls', () => {
  test('forme figée : les champs affichés, rien d’autre', () => {
    expect(decodeAnalyticsCalls(callsPayload())).toEqual({
      sampled: false,
      totalCalls: 40,
      videoShare: 0.25,
      connectSuccessRate: 0.9,
      callFailureRate: 0.05,
      avgSetupTimeMs: 820,
      avgNegotiationTimeMs: null,
      avgDurationSeconds: 184.5,
      avgReconnectionCount: 0.3,
      reconnectionRate: 0.2,
      avgNetworkTransitions: 0.1,
      avgRtt: 64,
      avgPacketLoss: 1.5,
      maxPacketLoss: 12,
      qualityDistribution: { excellent: 0.6, good: 0.25, fair: 0.1, poor: 0.05 },
      byPlatform: [
        { key: 'web', count: 25 },
        { key: 'ios', count: 10 },
        { key: 'android', count: 5 },
      ],
      byEndReason: [
        { key: 'completed', count: 20 },
        { key: 'local', count: 18 },
        { key: 'failed', count: 2 },
      ],
      feedback: {
        ratedCalls: 4,
        avgRating: 4.25,
        ratingDistribution: [0, 0, 1, 1, 2],
        byIssue: [
          { key: 'echo', count: 2 },
          { key: 'dropped', count: 1 },
        ],
      },
    });
  });

  test('`sampled` n’est vrai que s’il l’est : le plafond de 5 000 relevés se dit', () => {
    expect(decodeAnalyticsCalls(callsPayload({ sampled: true }))?.sampled).toBe(true);
    expect(decodeAnalyticsCalls(callsPayload({ sampled: 'oui' }))?.sampled).toBe(false);
  });

  test('sans appel mesuré, les moyennes restent null — la passerelle refuse de moyenner le « jamais connecté »', () => {
    const calls = decodeAnalyticsCalls(callsPayload({ totalCalls: 0, avgSetupTimeMs: null, avgRtt: null, avgPacketLoss: null, feedback: undefined }));

    expect(calls?.totalCalls).toBe(0);
    expect(calls?.avgSetupTimeMs).toBeNull();
    expect(calls?.avgRtt).toBeNull();
    expect(calls?.feedback).toEqual({ ratedCalls: 0, avgRating: null, ratingDistribution: [0, 0, 0, 0, 0], byIssue: [] });
  });

  test('une charge sans total d’appels est illisible', async () => {
    expect(decodeAnalyticsCalls({ videoShare: 0.5 })).toBeNull();
    const { deps } = scriptedGateway({ 'GET /api/v1/admin/analytics/calls?days=30': { ok: true, data: { videoShare: 0.5 } } });
    expect(await loadAnalyticsCalls({ ...deps, days: 30 })).toEqual({ ok: false, status: 0, error: 'Appels illisible' });
  });

  test('les décomptes illisibles sont écartés, jamais réparés', () => {
    const calls = decodeAnalyticsCalls(callsPayload({ byPlatform: { ios: 'beaucoup', web: 3, android: -1 } }));
    expect(calls?.byPlatform).toEqual([{ key: 'web', count: 3 }]);
  });
});
