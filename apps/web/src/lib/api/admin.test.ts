import { describe, expect, test } from 'bun:test';

import { decodeAdminPermissions } from './admin';

/**
 * LE PORT DE L'ADMINISTRATION (#6432) — la matrice de permissions SERVIE.
 *
 * Une permission absente lue comme vraie ouvrirait une porte que personne n'a
 * ouverte : le décodeur compare à `true`, jamais par coercition. Les compteurs
 * (`admin-dashboard.test.ts`) et la liste des comptes (`admin-users.test.ts`)
 * ont leurs propres témoins depuis #8876.
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
