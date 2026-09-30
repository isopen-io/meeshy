import { describe, expect, test } from 'bun:test';

import { pathOf, routedTransport } from '@/test-support/routed-transport';

import {
  decodeAdminAgentDigest,
  decodeAdminMonitoring,
  decodeAdminRankedConversations,
  decodeAdminRankedMembers,
  decodeAdminRecentMembers,
  decodeAdminRecentReports,
  decodeAdminReportsQueue,
  decodeAdminSendingBroadcasts,
  loadAdminAgentDigest,
  loadAdminMonitoring,
  loadAdminRankedConversations,
  loadAdminRankedMembers,
  loadAdminRecentMembers,
  loadAdminRecentReports,
  loadAdminReportsQueue,
  loadAdminSendingBroadcasts,
} from './admin-overview-queue';

/**
 * **LES LECTURES DE LA FILE DE TRAVAIL, DES PERSONNES ET DU SYSTÈME** (#8876,
 * § 4) — décodeurs champ par champ, noms résolus, champs sensibles ABSENTS.
 *
 * Ce que les tableaux de bord ne doivent jamais recevoir : le texte d'un
 * message signalé, l'adresse d'un compte, l'identifiant public d'une
 * conversation, le corps d'une diffusion. Chaque décodeur ne nomme que ce que
 * l'écran PEINT — `toEqual` le fige.
 */

const ID = '64f1c2a9e8b7d6c5b4a39281';

describe('decodeAdminReportsQueue', () => {
  test('lit les deux files et le délai moyen, en heures — et rien des autres compteurs', () => {
    expect(
      decodeAdminReportsQueue({
        totalReports: 40,
        pendingReports: 6,
        underReviewReports: 2,
        resolvedReports: 25,
        rejectedReports: 4,
        dismissedReports: 3,
        reportsByType: { spam: 9 },
        reportsByReportedType: { message: 12 },
        averageResolutionTimeHours: 5.5,
      }),
    ).toEqual({ pending: 6, underReview: 2, averageResolutionHours: 5.5 });
  });

  test('un compteur illisible est `null` ; une charge qui n’est pas un objet est illisible', () => {
    expect(decodeAdminReportsQueue({ pendingReports: 'six' })).toEqual({ pending: null, underReview: null, averageResolutionHours: null });
    expect(decodeAdminReportsQueue(null)).toBeNull();
  });
});

describe('decodeAdminRecentReports', () => {
  const report = {
    id: ID,
    reportedType: 'message',
    reportedEntityId: '64f1c2a9e8b7d6c5b4a39282',
    reporterId: '64f1c2a9e8b7d6c5b4a39283',
    reporterName: 'Anonyme',
    reportType: 'harassment',
    reason: 'Il me harcèle',
    status: 'pending',
    moderatorId: null,
    moderatorNotes: 'note interne',
    actionTaken: null,
    createdAt: '2026-09-30T09:30:00.000Z',
    updatedAt: '2026-09-30T09:30:00.000Z',
    resolvedAt: null,
    reporter: { id: '64f1c2a9e8b7d6c5b4a39283', username: 'jean', displayName: 'Jean Dupont', avatar: null },
    moderator: null,
    reportedEntity: {
      type: 'message',
      id: '64f1c2a9e8b7d6c5b4a39282',
      label: null,
      owner: { id: '64f1c2a9e8b7d6c5b4a39284', username: 'awa', displayName: 'Awa Diop', avatar: null },
      excerpt: 'le texte signalé',
      isProtected: false,
      deleted: false,
      conversation: { id: '64f1c2a9e8b7d6c5b4a39285', title: 'Famille' },
    },
  };

  test('garde l’essentiel pour NOMMER ce qui est signalé — jamais l’extrait, la raison libre ni les notes', () => {
    expect(decodeAdminRecentReports([report])).toEqual([
      {
        id: ID,
        reportType: 'harassment',
        status: 'pending',
        createdAt: '2026-09-30T09:30:00.000Z',
        entity: { kind: 'message', label: null, owner: { displayName: 'Awa Diop', username: 'awa', firstName: null, lastName: null }, deleted: false },
      },
    ]);
  });

  test('un signalement sans entité résolue reste lisible : l’entité est `null`', () => {
    const [row] = decodeAdminRecentReports([{ ...report, reportedEntity: null }]) ?? [];
    expect(row?.entity).toBeNull();
  });

  test('une ligne sans identifiant est écartée ; autre chose qu’un tableau est illisible', () => {
    expect(decodeAdminRecentReports([{ reportType: 'spam' }, report])).toHaveLength(1);
    expect(decodeAdminRecentReports({ reports: [report] })).toBeNull();
  });
});

describe('decodeAdminSendingBroadcasts', () => {
  const row = { id: ID, name: 'Nouveautés', subject: 'Du nouveau', status: 'SENDING', totalRecipients: 200, sentCount: 50, failedCount: 2, createdAt: '2026-09-30T08:00:00.000Z' };

  test('lit la progression et le total de diffusions en cours', () => {
    expect(decodeAdminSendingBroadcasts({ broadcasts: [row], pagination: { total: 3, offset: 0, limit: 5, hasMore: true } })).toEqual({
      rows: [{ id: ID, name: 'Nouveautés', subject: 'Du nouveau', totalRecipients: 200, sentCount: 50, failedCount: 2 }],
      total: 3,
    });
  });

  test('sans pagination lisible, le total est le nombre de lignes', () => {
    expect(decodeAdminSendingBroadcasts({ broadcasts: [row] })?.total).toBe(1);
  });

  test('des compteurs illisibles valent zéro dans une PROGRESSION (un pas n’est pas une mesure), le nom devient `null`', () => {
    expect(decodeAdminSendingBroadcasts({ broadcasts: [{ id: ID, name: '  ', totalRecipients: 'x' }] })?.rows).toEqual([
      { id: ID, name: null, subject: null, totalRecipients: 0, sentCount: 0, failedCount: 0 },
    ]);
  });

  test('une charge sans liste est illisible', () => {
    expect(decodeAdminSendingBroadcasts({ items: [] })).toBeNull();
  });
});

describe('decodeAdminRecentMembers', () => {
  test('garde le nom, le pseudo, l’avatar et la date d’inscription — jamais l’e-mail ni le rôle', () => {
    expect(
      decodeAdminRecentMembers({
        users: [
          {
            id: ID,
            username: 'awa',
            displayName: 'Awa Diop',
            firstName: 'Awa',
            lastName: 'Diop',
            email: 'awa@example.test',
            role: 'USER',
            avatar: 'https://cdn.example/a.png',
            createdAt: '2026-09-30T07:00:00.000Z',
          },
        ],
        pagination: { total: 1 },
      }),
    ).toEqual([
      { id: ID, username: 'awa', displayName: 'Awa Diop', firstName: 'Awa', lastName: 'Diop', avatar: 'https://cdn.example/a.png', createdAt: '2026-09-30T07:00:00.000Z' },
    ]);
  });

  test('un avatar vide est `null` ; une ligne sans identifiant est écartée', () => {
    const rows = decodeAdminRecentMembers({ users: [{ id: ID, username: 'x', avatar: '' }, { username: 'sans-id' }] }) ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.avatar).toBeNull();
  });

  test('une charge sans `users` est illisible', () => {
    expect(decodeAdminRecentMembers({ data: [] })).toBeNull();
  });
});

describe('les classements', () => {
  test('conversations : le titre, le type et l’effectif — JAMAIS l’identifiant public', () => {
    expect(
      decodeAdminRankedConversations({
        rankings: [{ id: ID, identifier: 'mshy_famille', title: 'Famille', type: 'group', image: null, count: 120 }],
        entityType: 'conversations',
      }),
    ).toEqual([{ id: ID, title: 'Famille', type: 'group', count: 120 }]);
  });

  test('un titre qui REPLIE sur l’identifiant public n’est pas un titre : `null`, pour que l’écran dise « sans titre »', () => {
    const rows =
      decodeAdminRankedConversations({
        rankings: [
          { id: ID, identifier: 'mshy_abc', title: 'mshy_abc', type: 'direct', count: 5 },
          { id: '64f1c2a9e8b7d6c5b4a39286', identifier: 'mshy_def', title: 'Sans titre', type: 'group', count: 4 },
        ],
      }) ?? [];
    expect(rows.map((row) => row.title)).toEqual([null, null]);
  });

  test('membres : le nom, le pseudo et l’effectif — jamais l’activité ni l’avatar', () => {
    expect(
      decodeAdminRankedMembers({
        rankings: [{ id: ID, username: 'awa', displayName: 'Awa Diop', avatar: null, count: 88, lastActivity: '2026-09-30T09:00:00.000Z' }],
      }),
    ).toEqual([{ id: ID, username: 'awa', displayName: 'Awa Diop', firstName: null, lastName: null, count: 88 }]);
  });

  test('un pseudo « Unknown » (compte disparu) n’est pas un nom : `null`', () => {
    const rows = decodeAdminRankedMembers({ rankings: [{ id: ID, username: 'Unknown', displayName: null, count: 1 }] }) ?? [];
    expect(rows[0]?.username).toBeNull();
  });

  test('une charge sans `rankings` est illisible', () => {
    expect(decodeAdminRankedConversations({})).toBeNull();
    expect(decodeAdminRankedMembers([])).toBeNull();
  });
});

describe('decodeAdminMonitoring', () => {
  const served = {
    generatedAt: '2026-09-30T10:00:00.000Z',
    gateway: { uptimeSeconds: 9000, memory: { heapUsed: 1, heapTotal: 2, rss: 3 } },
    database: { status: 'up', latencyMs: 4 },
    redis: { status: 'down', latencyMs: null },
    realtime: { connections: 120, connectedUsers: 80, messagesProcessed: 5000, translationsSent: 300, errors: 1 },
    translator: null,
    circuitBreakers: [
      { name: 'translator', state: 'OPEN', failures: 5, successes: 0, totalRequests: 9, lastFailureAt: '2026-09-30T09:59:00.000Z' },
      { name: 'redis', state: 'CLOSED', failures: 0, successes: 9, totalRequests: 9, lastFailureAt: null },
    ],
    presenceUpdates: null,
  };

  test('garde la base, Redis, le temps réel et les coupe-circuits — le reste relève de la Supervision', () => {
    expect(decodeAdminMonitoring(served)).toEqual({
      database: { status: 'up', latencyMs: 4 },
      redis: { status: 'down', latencyMs: null },
      connections: 120,
      connectedUsers: 80,
      breakers: [
        { name: 'translator', state: 'OPEN' },
        { name: 'redis', state: 'CLOSED' },
      ],
    });
  });

  test('une dépendance absente est « inconnue », jamais « en service »', () => {
    const monitoring = decodeAdminMonitoring({ realtime: {}, circuitBreakers: [] });
    expect(monitoring?.database).toEqual({ status: null, latencyMs: null });
    expect(monitoring?.redis).toEqual({ status: null, latencyMs: null });
    expect(monitoring?.connections).toBeNull();
  });

  test('un coupe-circuit sans nom est écarté ; une charge qui n’est pas un objet est illisible', () => {
    expect(decodeAdminMonitoring({ circuitBreakers: [{ state: 'OPEN' }, { name: 'a', state: 'OPEN' }] })?.breakers).toEqual([{ name: 'a', state: 'OPEN' }]);
    expect(decodeAdminMonitoring([])).toBeNull();
  });
});

describe('decodeAdminAgentDigest', () => {
  test('lit les configurations, les messages publiés et la dernière activité — pas les mots ni la confiance', () => {
    expect(
      decodeAdminAgentDigest({
        totalConfigs: 4,
        activeConfigs: 3,
        totalRoles: 2,
        totalControlledUsers: 12,
        totalMessagesSent: 486,
        totalWordsSent: 9000,
        avgConfidence: 0.7,
        recentActivity: [
          { conversationId: ID, conversation: { id: ID, title: 'Rosetta', type: 'group' }, messagesSent: 3, lastResponseAt: '2026-09-30T09:00:00.000Z' },
          { conversationId: ID, messagesSent: 1, lastResponseAt: '2026-09-29T09:00:00.000Z' },
        ],
      }),
    ).toEqual({ totalConfigs: 4, activeConfigs: 3, messagesSent: 486, lastActivityAt: '2026-09-30T09:00:00.000Z' });
  });

  test('sans activité récente, la dernière activité est `null`', () => {
    expect(decodeAdminAgentDigest({ totalConfigs: 1, activeConfigs: 0, totalMessagesSent: 0 })?.lastActivityAt).toBeNull();
  });

  test('une charge qui n’est pas un objet est illisible', () => {
    expect(decodeAdminAgentDigest(null)).toBeNull();
  });
});

describe('les chargeurs visent les bonnes adresses, avec la bonne fenêtre', () => {
  test('chaque lecture de la file, des personnes et du système', async () => {
    const { transport, calls } = routedTransport(() => ({ ok: true, data: {} }));
    const deps = { source: 'gateway', transport } as const;

    await loadAdminReportsQueue(deps);
    await loadAdminRecentReports(deps);
    await loadAdminSendingBroadcasts(deps);
    await loadAdminRecentMembers(deps);
    await loadAdminRankedConversations(deps);
    await loadAdminRankedMembers(deps);
    await loadAdminMonitoring(deps);
    await loadAdminAgentDigest(deps);

    expect(calls().map((call) => call.path.replace('/api/v1/admin', ''))).toEqual([
      '/reports/stats',
      '/reports/recent?limit=5',
      '/broadcasts?status=SENDING&limit=5',
      '/users?sortBy=createdAt&sortOrder=desc&limit=5',
      '/ranking?entityType=conversations&criterion=message_count&period=7d&limit=5',
      '/ranking?entityType=users&criterion=messages_sent&period=7d&limit=5',
      '/monitoring',
      '/agent/stats',
    ]);
    expect(calls().every((call) => call.method === 'GET')).toBe(true);
  });

  test('un 403 est rendu tel quel : l’écran le dessine comme un refus', async () => {
    const { transport } = routedTransport((req) => (pathOf(req).endsWith('/ranking') ? { ok: false, status: 403, error: 'Forbidden' } : undefined));
    expect(await loadAdminRankedMembers({ source: 'gateway', transport })).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  test('une charge de la mauvaise forme devient un échec', async () => {
    const { transport } = routedTransport(() => ({ ok: true, data: 'pas ça' }));
    expect((await loadAdminMonitoring({ source: 'gateway', transport })).ok).toBe(false);
  });
});
