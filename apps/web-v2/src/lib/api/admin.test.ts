import { describe, expect, test } from 'bun:test';

import {
  ADMIN_USERS_PAGE_SIZE,
  decodeAdminDashboard,
  decodeAdminPermissions,
  decodeAdminUsers,
  loadAdminUsers,
} from './admin';
import type { HttpTransport } from './http';

/**
 * LE PORT DE L'ADMINISTRATION (#6432) — ce que la charge SERVIE veut dire.
 *
 * Deux défauts se cachent dans un décodeur d'administration, et ce fichier
 * garde les deux :
 *
 * 1. **Une permission absente lue comme vraie** — ouvrirait une porte que
 *    personne n'a ouverte. Le décodeur compare à `true`, jamais par
 *    coercition.
 * 2. **Une pagination lue au mauvais niveau** — `GET /admin/users` sert son
 *    `pagination` DANS `data`, là où d'autres routes le servent à côté. Lu au
 *    mauvais endroit, `total` vaut 0 et la liste s'arrête à la première page
 *    sans que rien n'échoue.
 */

describe('decodeAdminPermissions — false par défaut, sans exception', () => {
  test('rend tout à false sur une charge vide', () => {
    const matrice = decodeAdminPermissions({});

    expect(Object.values(matrice).every((valeur) => valeur === false)).toBe(true);
  });

  test('rend tout à false sur une charge ILLISIBLE — jamais une ouverture par accident', () => {
    for (const charge of [null, undefined, 'ADMIN', 42, []]) {
      expect(decodeAdminPermissions(charge).canAccessAdmin).toBe(false);
    }
  });

  test('n’accepte que le booléen `true` — ni « true », ni 1', () => {
    expect(decodeAdminPermissions({ canAccessAdmin: 'true' }).canAccessAdmin).toBe(false);
    expect(decodeAdminPermissions({ canAccessAdmin: 1 }).canAccessAdmin).toBe(false);
    expect(decodeAdminPermissions({ canAccessAdmin: true }).canAccessAdmin).toBe(true);
  });

  test('porte les DIX clés de la matrice servie', () => {
    expect(Object.keys(decodeAdminPermissions({})).sort()).toEqual(
      [
        'canAccessAdmin',
        'canManageAgent',
        'canManageConversations',
        'canManageGroups',
        'canManageNotifications',
        'canManageTranslations',
        'canManageUsers',
        'canModerateContent',
        'canViewAnalytics',
        'canViewAuditLogs',
      ].sort(),
    );
  });

  /**
   * **`canManageAgent` EST LA GARDE RÉELLE DES 35 ROUTES `/admin/agent/*`**
   * (#6733) — `requirePermission('canManageAgent')`, `routes/admin/agent-shared.ts`.
   *
   * La passerelle la SERT depuis le lot B (`servedUserPermissions`,
   * `services/admin/served-permissions.ts`, dix clés). Ce décodeur-ci ne la
   * lisait pas : la clé arrivait sur le fil et se perdait au décodage. Un
   * écran qui aurait voulu ce droit n'avait donc que `canAccessAdmin` à
   * consulter — le MAUVAIS seuil, vrai pour MODERATOR et AUDIT, à qui la
   * matrice refuse l'agent. Une tuile peinte sur ce repli ne peut que prendre
   * 403.
   *
   * Ce n'est pas un défaut qu'un témoin de forme attrape : la clé absente du
   * type rendait simplement `undefined`, que personne ne lisait.
   */
  test('lit `canManageAgent`, la garde réelle des routes de l’agent', () => {
    expect(decodeAdminPermissions({ canManageAgent: true }).canManageAgent).toBe(true);
    expect(decodeAdminPermissions({ canManageAgent: 'true' }).canManageAgent).toBe(false);
    expect(decodeAdminPermissions({}).canManageAgent).toBe(false);
  });
});

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

describe('decodeAdminUsers — la pagination vit DANS `data`', () => {
  const charge = (total: number, hasMore?: boolean) => ({
    users: [
      { id: 'u1', username: 'alice', displayName: 'Alice', email: 'a@x.com', role: 'USER', isActive: true, isOnline: true, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'u2', username: 'bob', email: 'b@x.com', role: 'ADMIN' },
    ],
    pagination: { total, offset: 0, limit: ADMIN_USERS_PAGE_SIZE, ...(hasMore === undefined ? {} : { hasMore }) },
  });

  test('lit le total depuis `data.pagination`', () => {
    expect(decodeAdminUsers(charge(57), 0).total).toBe(57);
  });

  test('obéit au `hasMore` du serveur quand il le dit', () => {
    expect(decodeAdminUsers(charge(57, false), 0).hasMore).toBe(false);
    expect(decodeAdminUsers(charge(57, true), 0).hasMore).toBe(true);
  });

  test('recalcule `hasMore` depuis l’OFFSET quand le serveur se tait', () => {
    const meta = { users: charge(57).users, pagination: { total: 57 } };

    expect(decodeAdminUsers(meta, 0).hasMore).toBe(true);
    expect(decodeAdminUsers(meta, 55).hasMore).toBe(false);
  });

  test('retombe sur le pseudo quand le nom affiché manque — jamais une ligne sans nom', () => {
    expect(decodeAdminUsers(charge(2), 0).users[1]?.displayName).toBe('bob');
  });

  test('écarte les lignes sans identifiant plutôt que d’en fabriquer un', () => {
    const abimee = { users: [{ username: 'sans-id' }, { id: 'u1', username: 'alice' }], pagination: { total: 2 } };

    expect(decodeAdminUsers(abimee, 0).users.map((u) => u.id)).toEqual(['u1']);
  });
});

describe('loadAdminUsers — l’adresse demandée', () => {
  const transportEspion = () => {
    const appels: { path: string }[] = [];
    const transport = {
      request: async (requete: { path: string }) => {
        appels.push({ path: requete.path });
        return { ok: true as const, data: { users: [], pagination: { total: 0 } } };
      },
    } as unknown as HttpTransport;
    return { transport, appels };
  };

  test('pagine par OFFSET — `page` serait ignoré par la passerelle', async () => {
    const { transport, appels } = transportEspion();

    await loadAdminUsers({ source: 'gateway', transport, offset: 40, search: '' });

    expect(appels[0]?.path).toContain('offset=40');
    expect(appels[0]?.path).not.toContain('page=');
  });

  test('n’envoie `search` que lorsqu’il porte quelque chose', async () => {
    const { transport, appels } = transportEspion();

    await loadAdminUsers({ source: 'gateway', transport, offset: 0, search: '   ' });
    expect(appels[0]?.path).not.toContain('search=');

    await loadAdminUsers({ source: 'gateway', transport, offset: 0, search: '  alice ' });
    expect(appels[1]?.path).toContain('search=alice');
  });
});
