import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { pathOf, type RoutedReply } from '@/test-support/routed-transport';

/**
 * **LA PASSERELLE DU TABLEAU DE BORD, SIMULÉE** (#8876) — les seize charges
 * TELLES QUE LA PASSERELLE LES SERT (libellés français, couleurs, bouche-trous,
 * champs voisins sensibles compris), prêtes pour `routedTransport`. Les témoins
 * du panneau en tirent leurs lectures et n'en surchargent qu'une à la fois.
 *
 * Ce module ne sert QUE les tests : aucun code de production ne l'importe.
 * Les adresses viennent du catalogue généré — jamais écrites ici.
 */
export const IDS = {
  awa: '64f1c2a9e8b7d6c5b4a30001',
  jean: '64f1c2a9e8b7d6c5b4a30002',
  famille: '64f1c2a9e8b7d6c5b4a30003',
  equipe: '64f1c2a9e8b7d6c5b4a30004',
  reportMessage: '64f1c2a9e8b7d6c5b4a30005',
  reportUser: '64f1c2a9e8b7d6c5b4a30006',
  broadcast: '64f1c2a9e8b7d6c5b4a30007',
  message: '64f1c2a9e8b7d6c5b4a30008',
} as const;

const person = (id: string, username: string, displayName: string | null) => ({ id, username, displayName, avatar: null });

export const SERVED = {
  dashboard: {
    statistics: {
      totalUsers: 1200,
      activeUsers: 900,
      inactiveUsers: 300,
      adminUsers: 2,
      totalAnonymousUsers: 140,
      activeAnonymousUsers: 60,
      inactiveAnonymousUsers: 80,
      totalMessages: 34_000,
      totalCommunities: 5,
      totalTranslations: 21_000,
      totalShareLinks: 40,
      activeShareLinks: 31,
      totalReports: 9,
      totalInvitations: 7771,
      topLanguages: [{ language: 'fr', count: 0 }],
      usersByRole: {},
      messagesByType: {},
    },
    recentActivity: { newUsers: 3, newConversations: 4, newMessages: 500, newAnonymousUsers: 2 },
    userPermissions: { role: 'BIGBOSS', canManageUsers: true },
    timestamp: '2026-09-30T11:59:00.000Z',
  },
  realtime: { onlineUsers: 12, messagesLastHour: 340, activeConversations: 27, timestamp: '2026-09-30T11:59:30.000Z' },
  kpis: { engagementRate: 42, avgSessionTime: '2h 45m', peakHours: '18h-21h', growthRate: 7, messagesPerUser: 31, activeUserRate: 42 },
  volume: [
    { date: 'mer. 24/09', messages: 10 },
    { date: 'jeu. 25/09', messages: 20 },
    { date: 'ven. 26/09', messages: 5 },
    { date: 'sam. 27/09', messages: 40 },
    { date: 'dim. 28/09', messages: 30 },
    { date: 'lun. 29/09', messages: 0 },
    { date: 'mar. 30/09', messages: 12 },
  ],
  hourly: [
    { hour: '15h', activity: 4 },
    { hour: '18h', activity: 9 },
    { hour: '21h', activity: 19 },
    { hour: '00h', activity: 1 },
    { hour: '03h', activity: 0 },
    { hour: '06h', activity: 2 },
    { hour: '09h', activity: 6 },
    { hour: '12h', activity: 7 },
  ],
  distribution: [
    { name: 'Très actifs', value: 12, color: '#10b981' }, // harmony-exempt: couleur servie par la passerelle, que le décodeur ignore
    { name: 'Actifs', value: 30, color: '#3b82f6' }, // harmony-exempt: couleur servie par la passerelle, que le décodeur ignore
    { name: 'Occasionnels', value: 8, color: '#f59e0b' }, // harmony-exempt: couleur servie par la passerelle, que le décodeur ignore
    { name: 'Inactifs', value: 50, color: '#ef4444' }, // harmony-exempt: couleur servie par la passerelle, que le décodeur ignore
  ],
  languages: [
    { name: 'fr', value: 900, color: '#8b5cf6' }, // harmony-exempt: couleur servie par la passerelle, que le décodeur ignore
    { name: 'en', value: 400, color: '#3b82f6' }, // harmony-exempt: couleur servie par la passerelle, que le décodeur ignore
    { name: 'es', value: 120, color: '#10b981' }, // harmony-exempt: couleur servie par la passerelle, que le décodeur ignore
    { name: 'de', value: 60, color: '#f59e0b' }, // harmony-exempt: couleur servie par la passerelle, que le décodeur ignore
    { name: 'pt', value: 30, color: '#6b7280' }, // harmony-exempt: couleur servie par la passerelle, que le décodeur ignore
    { name: 'it', value: 10, color: '#6b7280' }, // harmony-exempt: couleur servie par la passerelle, que le décodeur ignore
  ],
  types: [
    { type: 'text', count: 900, percentage: 90 },
    { type: 'image', count: 70, percentage: 7 },
    { type: 'audio', count: 30, percentage: 3 },
  ],
  reportsStats: {
    totalReports: 9,
    pendingReports: 6,
    underReviewReports: 2,
    resolvedReports: 1,
    rejectedReports: 0,
    dismissedReports: 0,
    reportsByType: { harassment: 4 },
    reportsByReportedType: { message: 5 },
    averageResolutionTimeHours: 5.5,
  },
  reportsRecent: [
    {
      id: IDS.reportMessage,
      reportedType: 'message',
      reportedEntityId: IDS.message,
      reporterId: IDS.jean,
      reporterName: 'Jean Dupont',
      reportType: 'harassment',
      reason: 'Il me harcèle depuis des jours',
      status: 'pending',
      moderatorId: null,
      moderatorNotes: 'note interne',
      actionTaken: null,
      createdAt: '2026-09-30T11:57:00.000Z',
      updatedAt: '2026-09-30T11:57:00.000Z',
      resolvedAt: null,
      reporter: person(IDS.jean, 'jean', 'Jean Dupont'),
      moderator: null,
      reportedEntity: {
        type: 'message',
        id: IDS.message,
        label: null,
        owner: person(IDS.awa, 'awa', 'Awa Diop'),
        excerpt: 'EXTRAIT-SECRET-DU-MESSAGE-SIGNALE',
        isProtected: false,
        deleted: false,
        conversation: { id: IDS.famille, title: 'Famille' },
      },
    },
    {
      id: IDS.reportUser,
      reportedType: 'user',
      reportedEntityId: IDS.jean,
      reporterId: null,
      reporterName: 'Anonyme',
      reportType: 'spam',
      reason: null,
      status: 'under_review',
      moderatorId: IDS.awa,
      moderatorNotes: null,
      actionTaken: null,
      createdAt: '2026-09-30T09:00:00.000Z',
      updatedAt: '2026-09-30T09:30:00.000Z',
      resolvedAt: null,
      reporter: null,
      moderator: person(IDS.awa, 'awa', 'Awa Diop'),
      reportedEntity: {
        type: 'user',
        id: IDS.jean,
        label: 'Jean Dupont',
        owner: null,
        excerpt: null,
        isProtected: false,
        deleted: false,
        conversation: null,
      },
    },
  ],
  broadcasts: {
    broadcasts: [
      {
        id: IDS.broadcast,
        name: 'Nouveautés de septembre',
        subject: 'Du nouveau sur Meeshy',
        status: 'SENDING',
        totalRecipients: 200,
        sentCount: 50,
        failedCount: 2,
        createdAt: '2026-09-30T08:00:00.000Z',
        sentAt: '2026-09-30T08:05:00.000Z',
        completedAt: null,
        sourceLanguage: 'fr',
        targetLanguages: ['en'],
        inAppSentCount: 0,
        inAppSentAt: null,
      },
    ],
    pagination: { total: 1, offset: 0, limit: 5, hasMore: false },
  },
  users: {
    users: [
      {
        id: IDS.awa,
        username: 'awa',
        displayName: 'Awa Diop',
        firstName: 'Awa',
        lastName: 'Diop',
        email: 'awa@example.test',
        role: 'USER',
        isActive: true,
        avatar: '',
        createdAt: '2026-09-30T09:00:00.000Z',
      },
      {
        id: IDS.jean,
        username: 'jean',
        displayName: null,
        firstName: 'Jean',
        lastName: 'Dupont',
        email: 'jean@example.test',
        role: 'USER',
        isActive: true,
        avatar: '',
        createdAt: '2026-09-29T12:00:00.000Z',
      },
    ],
    pagination: { total: 1200, offset: 0, limit: 5, hasMore: true },
  },
  rankConversations: {
    rankings: [
      { id: IDS.famille, identifier: 'mshy_famille', title: 'Famille', type: 'group', image: null, count: 120 },
      { id: IDS.equipe, identifier: 'mshy_equipe', title: 'mshy_equipe', type: 'direct', image: null, count: 80 },
    ],
    entityType: 'conversations',
    criterion: 'message_count',
    period: '7d',
    total: 2,
  },
  rankMembers: {
    rankings: [
      { id: IDS.awa, username: 'awa', displayName: 'Awa Diop', avatar: null, count: 88, lastActivity: '2026-09-30T11:00:00.000Z' },
      { id: IDS.jean, username: 'jean', displayName: null, avatar: null, count: 50 },
    ],
    entityType: 'users',
    criterion: 'messages_sent',
    period: '7d',
    total: 2,
  },
  monitoring: {
    generatedAt: '2026-09-30T12:00:00.000Z',
    gateway: { uptimeSeconds: 9000, memory: { heapUsed: 1, heapTotal: 2, rss: 3 } },
    database: { status: 'up', latencyMs: 4 },
    redis: { status: 'up', latencyMs: 2 },
    realtime: { connections: 120, connectedUsers: 80, messagesProcessed: 5000, translationsSent: 300, errors: 1 },
    translator: null,
    circuitBreakers: [{ name: 'translator', state: 'CLOSED', failures: 0, successes: 9, totalRequests: 9, lastFailureAt: null }],
    presenceUpdates: null,
  },
  agent: {
    totalConfigs: 4,
    activeConfigs: 3,
    totalRoles: 2,
    totalArchetypes: 5,
    totalControlledUsers: 12,
    totalMessagesSent: 486,
    totalWordsSent: 9000,
    avgConfidence: 0.7,
    recentActivity: [
      { conversationId: IDS.famille, conversation: { id: IDS.famille, title: 'Famille', type: 'group' }, messagesSent: 3, lastResponseAt: '2026-09-30T09:00:00.000Z' },
    ],
  },
} as const;

export type DashRoute = keyof typeof SERVED;

/** L'adresse (sans requête) de chaque lecture — depuis le catalogue généré. Les deux classements partagent la leur. */
const PATHS: readonly (readonly [Exclude<DashRoute, 'rankConversations' | 'rankMembers'>, string])[] = [
  ['dashboard', adminEndpoints.dashboard],
  ['realtime', adminEndpoints.analyticsRealtime],
  ['kpis', adminEndpoints.analyticsKpis],
  ['volume', adminEndpoints.analyticsVolumeTimeline],
  ['hourly', adminEndpoints.analyticsHourlyActivity],
  ['distribution', adminEndpoints.analyticsUserDistribution],
  ['languages', adminEndpoints.analyticsLanguageDistribution],
  ['types', adminEndpoints.analyticsMessageTypes],
  ['reportsStats', adminEndpoints.reportsStats],
  ['reportsRecent', adminEndpoints.reportsRecent],
  ['broadcasts', adminEndpoints.broadcasts],
  ['users', adminEndpoints.users],
  ['monitoring', adminEndpoints.monitoring],
  ['agent', adminEndpoints.agentStats],
];

/** Quelle lecture du tableau de bord une requête vise-t-elle ? `null` : aucune. */
export function routeOf(request: HttpRequest): DashRoute | null {
  const path = pathOf(request);
  if (path === adminEndpoints.ranking) {
    const entity = new URLSearchParams(request.path.split('?')[1] ?? '').get('entityType');
    return entity === 'conversations' ? 'rankConversations' : entity === 'users' ? 'rankMembers' : null;
  }
  return PATHS.find(([, candidate]) => candidate === path)?.[0] ?? null;
}

/**
 * Le répondeur de `routedTransport` : chaque lecture du tableau de bord rend sa
 * charge servie ; `overrides` remplace UNE lecture (une panne, un refus, une
 * charge vide) sans toucher aux autres.
 */
export function dashboardReplies(overrides: Partial<Record<DashRoute, ApiResult<unknown>>> = {}): RoutedReply {
  return (request) => {
    const route = routeOf(request);
    return route === null ? undefined : (overrides[route] ?? { ok: true, data: SERVED[route] });
  };
}
