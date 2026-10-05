import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { pathOf, routedTransport } from '@/test-support/routed-transport';

/**
 * **LA PASSERELLE DES TÉMOINS DE STATISTIQUES** (#8876, #6728) — des charges
 * servies réalistes pour les treize routes, et un transport qui répond PAR
 * CHEMIN, garde chaque appel et laisse un témoin surcharger UNE route.
 *
 * Fichier de témoins : il n'est importé par aucun écran.
 */
export const NOW = new Date('2026-09-30T12:00:00.000Z');

export const AWA = '64f1c2a9e8b7d6c5b4a39281';
export const GUEST_PARTICIPANT = '64f1c2a9e8b7d6c5b4a39299';

type Reply = ApiResult<unknown> | ((request: HttpRequest) => ApiResult<unknown>);

const ok = (data: unknown): ApiResult<unknown> => ({ ok: true, data });

const hours = (counts: Readonly<Record<number, number>>) => Array.from({ length: 24 }, (_, hour) => ({ hour: `${hour}h`, count: counts[hour] ?? 0 }));
const weekdays = (counts: Readonly<Record<number, number>>) =>
  ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map((day, index) => ({ day, count: counts[index] ?? 0 }));

export const PAYLOADS: Readonly<Record<string, unknown>> = {
  [adminEndpoints.analyticsRealtime]: { onlineUsers: 12, messagesLastHour: 340, activeConversations: 9, timestamp: '2026-09-30T11:58:00.000Z' },
  [adminEndpoints.analyticsKpis]: { engagementRate: 42, avgSessionTime: '2h 45m', peakHours: '18h-21h', growthRate: 7, messagesPerUser: 13, activeUserRate: 41 },
  [adminEndpoints.analyticsVolumeTimeline]: [
    { date: 'lun. 24/09', messages: 10 },
    { date: 'mar. 25/09', messages: 20 },
    { date: 'mer. 26/09', messages: 15 },
    { date: 'jeu. 27/09', messages: 40 },
    { date: 'ven. 28/09', messages: 30 },
    { date: 'sam. 29/09', messages: 5 },
    { date: 'dim. 30/09', messages: 25 },
  ],
  [adminEndpoints.analyticsHourlyActivity]: [
    { hour: '15h', activity: 4 },
    { hour: '18h', activity: 6 },
    { hour: '21h', activity: 2 },
    { hour: '00h', activity: 0 },
    { hour: '03h', activity: 1 },
    { hour: '06h', activity: 3 },
    { hour: '09h', activity: 9 },
    { hour: '12h', activity: 7 },
  ],
  [adminEndpoints.analyticsUserDistribution]: [
    { name: 'Très actifs', value: 5, color: '#10b981' }, // harmony-exempt: couleur servie par la passerelle, que le décodeur ignore
    { name: 'Actifs', value: 10, color: '#3b82f6' }, // harmony-exempt: couleur servie par la passerelle, que le décodeur ignore
    { name: 'Occasionnels', value: 20, color: '#f59e0b' }, // harmony-exempt: couleur servie par la passerelle, que le décodeur ignore
    { name: 'Inactifs', value: 65, color: '#ef4444' }, // harmony-exempt: couleur servie par la passerelle, que le décodeur ignore
  ],
  [adminEndpoints.analyticsMessageTypes]: [
    { type: 'text', count: 82, percentage: 82 },
    { type: 'image', count: 12, percentage: 12 },
    { type: 'hologram', count: 6, percentage: 6 },
  ],
  [adminEndpoints.analyticsCalls]: {
    windowDays: 7,
    sampled: false,
    rowsWithTelemetry: 40,
    totalCalls: 40,
    videoShare: 0.25,
    connectSuccessRate: 0.9,
    callFailureRate: 0.05,
    avgSetupTimeMs: 820,
    avgNegotiationTimeMs: null,
    avgDurationSeconds: 184,
    avgReconnectionCount: 0.3,
    reconnectionRate: 0.2,
    avgNetworkTransitions: 0.1,
    avgRtt: 64,
    avgPacketLoss: 1.5,
    maxPacketLoss: 12,
    qualityDistribution: { excellent: 0.6, good: 0.25, fair: 0.1, poor: 0.05 },
    byPlatform: { ios: 10, web: 20, macos: 3, windows: 2, android: 5 },
    byEndReason: { completed: 20, failed: 2, local: 12, teleported: 3, connectionLost: 3 },
    feedback: { ratedCalls: 4, avgRating: 4.25, ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 }, byIssue: { echo: 2, dropped: 1 } },
  },
  [adminEndpoints.messagesStats]: {
    totalMessages: 1200,
    deletedMessages: 30,
    editedMessages: 45,
    messagesByType: { text: 1000, image: 150, hologram: 50 },
    messagesByPeriod: [
      { date: '2026-09-28', count: 400 },
      { date: '2026-09-29', count: 500 },
      { date: '2026-09-30', count: 300 },
    ],
    averageLength: 58,
    translatedMessages: 600,
    translatedPercentage: 50,
    topSenders: [
      { userId: AWA, username: 'awa', displayName: 'Awa Diop', messageCount: 320 },
      { userId: '64f1c2a9e8b7d6c5b4a39282', username: 'jean', messageCount: 210 },
      { userId: GUEST_PARTICIPANT, username: 'Unknown', messageCount: 40 },
    ],
    messagesWithAttachments: 200,
    attachmentRate: 17,
    period: '30d',
  },
  [adminEndpoints.messagesTrends]: {
    peakHour: { hour: 14, label: '14h', count: 80 },
    peakWeekday: { day: 2, label: 'Mardi', count: 300 },
    hourlyActivity: hours({ 14: 80, 9: 20, 20: 5 }),
    weekdayActivity: weekdays({ 2: 300, 5: 100, 0: 10 }),
  },
  [adminEndpoints.messagesEngagement]: {
    totalMessages: 100,
    messagesWithReactions: 30,
    messagesWithReplies: 20,
    totalReactions: 75,
    totalReplies: 25,
    reactionRate: 30,
    replyRate: 20,
    avgReactionsPerMessage: 0.8,
    avgRepliesPerMessage: 0.3,
  },
  [adminEndpoints.languagesStats]: {
    topLanguages: [
      { language: 'fr', messageCount: 700, userCount: 40, percentage: 70 },
      { language: 'en', messageCount: 250, userCount: 25, percentage: 25 },
      { language: 'es', messageCount: 50, userCount: 5, percentage: 5 },
    ],
    languagePairs: [
      { from: 'fr', to: 'en', translationCount: 250, avgConfidence: 0.93 },
      { from: 'en', to: 'fr', translationCount: 120, avgConfidence: 0 },
    ],
    usersByLanguage: { en: 25, fr: 40, pt: 3 },
    growth: { fr: 12, en: 100, es: -8 },
    period: '30d',
    totalMessages: 1000,
    totalLanguages: 3,
  },
  [adminEndpoints.languagesTimeline]: [
    { date: '2026-09-28', fr: 10, en: 5, es: 2, de: 1, it: 1 },
    { date: '2026-09-29', fr: 8, en: 6, es: 3, de: 1 },
    { date: '2026-09-30', fr: 9, en: 4, pt: 1 },
  ],
  [adminEndpoints.languagesTranslationAccuracy]: [
    { from: 'fr', to: 'en', avgConfidence: 93, translationCount: 250, quality: 'excellent' },
    { from: 'en', to: 'fr', avgConfidence: 0, translationCount: 120, quality: 'poor' },
    { from: 'es', to: 'fr', avgConfidence: 62, translationCount: 10, quality: 'fair' },
  ],
};

/**
 * Une passerelle qui sert `PAYLOADS`, sauf pour les chemins de `overrides`
 * (par chemin SANS chaîne de requête). `calls()` rend les requêtes parties.
 */
export function statsGateway(overrides: Readonly<Record<string, Reply>> = {}): {
  readonly deps: AdminDeps;
  readonly calls: () => readonly HttpRequest[];
  readonly paths: () => readonly string[];
} {
  const { transport, calls } = routedTransport((request) => {
    const path = pathOf(request);
    const override = overrides[path];
    if (override !== undefined) return typeof override === 'function' ? override(request) : override;
    const payload = PAYLOADS[path];
    return payload === undefined ? undefined : ok(payload);
  });
  return { deps: { source: 'gateway', transport }, calls, paths: () => calls().map((request) => request.path) };
}

/** Une passerelle qui ne répond JAMAIS : ce que voit l'écran tant que rien n'est arrivé (squelette, cache-first). */
export function pendingGateway(): AdminDeps {
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = (() => new Promise<ApiResult<unknown>>(() => undefined)) as HttpTransport['request'];
  return { source: 'gateway', transport };
}
