import { describe, expect, test } from 'bun:test';

import { decodeAdminDashboard } from './admin-dashboard';

describe('decodeAdminDashboard', () => {
  test('lit les compteurs sous `statistics` et `recentActivity`', () => {
    const tableau = decodeAdminDashboard({
      statistics: { totalUsers: 12, activeUsers: 7, totalMessages: 340, totalCommunities: 3, totalReports: 1 },
      recentActivity: { newUsers: 2, newMessages: 44 },
    });

    expect(tableau).toEqual({
      totalUsers: 12,
      activeUsers: 7,
      totalMessages: 340,
      totalCommunities: 3,
      totalReports: 1,
      newUsers24h: 2,
      newMessages24h: 44,
    });
  });

  test('rend ZÉRO — jamais NaN ni undefined — sur une charge partielle', () => {
    const tableau = decodeAdminDashboard({ statistics: { totalUsers: 'beaucoup' } });

    expect(tableau.totalUsers).toBe(0);
    expect(Object.values(tableau).every((valeur) => Number.isFinite(valeur))).toBe(true);
  });
});
