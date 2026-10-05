import { describe, expect, test } from 'bun:test';

import { routedTransport } from '@/test-support/routed-transport';

import { ADMIN_DASHBOARD_QUERY_KEY, ADMIN_DASH_QUERY_KEY, decodeAdminDashboard, loadAdminDashboard } from './admin-dashboard';

const SERVED = {
  statistics: {
    totalUsers: 120,
    activeUsers: 90,
    inactiveUsers: 30,
    adminUsers: 2,
    totalAnonymousUsers: 14,
    activeAnonymousUsers: 6,
    inactiveAnonymousUsers: 8,
    totalMessages: 34_000,
    totalCommunities: 5,
    totalTranslations: 21_000,
    totalShareLinks: 40,
    activeShareLinks: 31,
    totalReports: 9,
    totalInvitations: 77,
    topLanguages: [{ language: 'fr', count: 0 }],
    usersByRole: {},
    messagesByType: {},
  },
  recentActivity: { newUsers: 3, newConversations: 4, newMessages: 500, newAnonymousUsers: 2 },
  userPermissions: { role: 'BIGBOSS', canManageUsers: true },
  timestamp: '2026-09-30T10:00:00.000Z',
};

describe('decodeAdminDashboard', () => {
  test('lit les douze totaux et les quatre nouveautés de 24 h — champ par champ', () => {
    expect(decodeAdminDashboard(SERVED)).toEqual({
      totalUsers: 120,
      activeUsers: 90,
      inactiveUsers: 30,
      adminUsers: 2,
      totalAnonymousUsers: 14,
      activeAnonymousUsers: 6,
      totalMessages: 34_000,
      totalCommunities: 5,
      totalTranslations: 21_000,
      totalShareLinks: 40,
      activeShareLinks: 31,
      totalReports: 9,
      newUsers24h: 3,
      newConversations24h: 4,
      newMessages24h: 500,
      newAnonymousUsers24h: 2,
    });
  });

  test('ne lit JAMAIS les bouche-trous (`topLanguages`, `usersByRole`, `messagesByType`) ni `totalInvitations`, qui compte des membres de communauté', () => {
    const tableau = decodeAdminDashboard(SERVED);
    for (const interdit of ['topLanguages', 'usersByRole', 'messagesByType', 'totalInvitations', 'inactiveAnonymousUsers', 'userPermissions']) {
      expect(Object.keys(tableau ?? {})).not.toContain(interdit);
    }
  });

  test('un compteur illisible est `null` — jamais un zéro que l’on lirait comme une mesure', () => {
    const tableau = decodeAdminDashboard({ statistics: { totalUsers: 'beaucoup', activeUsers: -2 }, recentActivity: { newUsers: Number.NaN } });

    expect(tableau?.totalUsers).toBeNull();
    expect(tableau?.activeUsers).toBeNull();
    expect(tableau?.newUsers24h).toBeNull();
    expect(Object.values(tableau ?? {}).every((valeur) => valeur === null)).toBe(true);
  });

  test('sans `recentActivity`, les statistiques se lisent et les nouveautés sont inconnues', () => {
    const tableau = decodeAdminDashboard({ statistics: { totalUsers: 4 } });
    expect(tableau?.totalUsers).toBe(4);
    expect(tableau?.newMessages24h).toBeNull();
  });

  test('sans `statistics`, la réponse est illisible — pas un tableau de bord à zéro', () => {
    expect(decodeAdminDashboard({ recentActivity: { newUsers: 2 } })).toBeNull();
    expect(decodeAdminDashboard({ statistics: [] })).toBeNull();
    expect(decodeAdminDashboard(null)).toBeNull();
    expect(decodeAdminDashboard([])).toBeNull();
  });
});

describe('loadAdminDashboard', () => {
  test('appelle le catalogue généré et décode la charge', async () => {
    const { transport, calls } = routedTransport(() => ({ ok: true, data: SERVED }));
    const result = await loadAdminDashboard({ source: 'gateway', transport });

    expect(calls().map((call) => `${call.method} ${call.path}`)).toEqual(['GET /api/v1/admin/dashboard']);
    expect(result.ok && result.data.totalUsers).toBe(120);
  });

  test('une réponse sans statistiques est un échec — l’écran dessine l’erreur', async () => {
    const { transport } = routedTransport(() => ({ ok: true, data: {} }));
    expect((await loadAdminDashboard({ source: 'gateway', transport })).ok).toBe(false);
  });
});

describe('la clé de requête', () => {
  test('est sous `admin` (jamais persistée) ET sous le préfixe `dash` que « Recalculer maintenant » invalide', () => {
    expect(ADMIN_DASH_QUERY_KEY).toEqual(['admin', 'dash']);
    expect(ADMIN_DASHBOARD_QUERY_KEY.slice(0, ADMIN_DASH_QUERY_KEY.length)).toEqual([...ADMIN_DASH_QUERY_KEY]);
  });
});
