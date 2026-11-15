import { describe, expect, test } from 'bun:test';

import { visibleAdminSections } from '@/lib/admin/sections';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { mountAdminAt } from '@/test-support/admin-router';

import { ROUTES } from './route-table';

/**
 * **LES QUATRE ADRESSES DES DIFFUSIONS MÈNENT À LEURS ÉCRANS, ET PERSONNE D'AUTRE
 * QUE CELUI QUI GÈRE LES NOTIFICATIONS N'Y ENTRE** (#8876, #6731).
 *
 * Le routeur est le VRAI : c'est ce qui prouve le branchement que les témoins de
 * panneau (à `deps` injecté) ne peuvent pas prouver — le paramètre `$broadcast`
 * de la fiche arrive jusqu'au panneau, et aucune des quatre adresses n'est plus
 * l'écran d'attente. Le transport réel n'a nulle part où aller : on ne lit que ce
 * que l'écran pose AVANT toute réponse.
 *
 * La section porte la capacité de ce que ses routes exigent, `canManageNotifications`
 * (décision #6843, option C) — lue dans la matrice SERVIE, jamais dans le rôle.
 */

const { mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const BROADCAST = '64f1c2a9e8b7d6c5b4a39281';

const sectionsOf = (identity: ReturnType<typeof adminIdentityFixture>) => visibleAdminSections(identity.permissions, identity.role).map((section) => section.id);

describe('les routes des diffusions', () => {
  test('les quatre clés existent, avec leurs motifs', () => {
    expect(ROUTES.adminBroadcasts.pattern).toBe('/admin/broadcasts');
    expect(ROUTES.admBroadcasts.pattern).toBe('/adm/broadcasts');
    expect(ROUTES.adminBroadcast.pattern).toBe('/admin/broadcasts/$broadcast');
    expect(ROUTES.admBroadcast.pattern).toBe('/adm/broadcasts/$broadcast');
  });

  for (const url of ['/admin/broadcasts', '/adm/broadcasts']) {
    test(`${url} monte la liste, pas l’écran d’attente`, async () => {
      const host = await mountAdminAt(mounter, url, BIGBOSS, '[data-admin-broadcasts]');

      expect(host.querySelector('[data-admin-stub]')).toBeNull();
      expect(host.querySelector('[data-admin-page-title]')?.textContent).toBe('Diffusions');
      expect(host.querySelector('[data-admin-action="new"]')).not.toBeNull();
    });
  }

  for (const url of [`/admin/broadcasts/${BROADCAST}`, `/adm/broadcasts/${BROADCAST}`]) {
    test(`${url} monte la fiche, pas l’écran d’attente`, async () => {
      const host = await mountAdminAt(mounter, url, BIGBOSS, '[data-admin-broadcast-loading], [data-admin-broadcast-fiche], [data-admin-error], [data-admin-empty]');

      expect(host.querySelector('[data-admin-stub]')).toBeNull();
      expect(host.textContent).not.toContain('Cette section arrive');
    });
  }
});

describe('qui voit la section Diffusions', () => {
  test('le créateur et les administrateurs, par la capacité servie — jamais par le rôle', () => {
    expect(sectionsOf(adminIdentityFixture({ role: 'BIGBOSS' }))).toContain('broadcasts');
    expect(sectionsOf(adminIdentityFixture({ role: 'ADMIN' }))).toContain('broadcasts');
    expect(sectionsOf(adminIdentityFixture({ role: 'USER', permissions: { canAccessAdmin: true, canManageNotifications: true } }))).toContain('broadcasts');
  });

  test('sans canManageNotifications, la section n’existe pas — même pour le créateur', () => {
    for (const role of ['BIGBOSS', 'ADMIN', 'MODERATOR', 'AUDIT', 'ANALYST']) {
      expect(sectionsOf(adminIdentityFixture({ role, permissions: { canManageNotifications: false } }))).not.toContain('broadcasts');
    }
  });

  test('aucune AUTRE capacité ne suffit : modérateurs, auditeurs et analystes ne voient pas les diffusions', () => {
    for (const role of ['MODERATOR', 'AUDIT', 'ANALYST']) {
      expect(sectionsOf(adminIdentityFixture({ role }))).not.toContain('broadcasts');
    }
  });

  test('canManageNotifications seule (sans canAccessAdmin) n’ouvre pas l’administration : fail-closed', () => {
    expect(sectionsOf(adminIdentityFixture({ role: 'USER', permissions: { canManageNotifications: true } }))).toEqual([]);
  });
});
