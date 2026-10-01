import { describe, expect, test } from 'bun:test';

import { AdminSectionDirectory } from '@/components/admin/section-directory';
import { visibleAdminSections } from '@/lib/admin/sections';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { mountAdminAt } from '@/test-support/admin-router';

import { ROUTES } from './route-table';

/**
 * **LES QUATRE ADRESSES DES DEMANDES DE CONTACT MÈNENT À LEURS ÉCRANS** (#8876,
 * #6729) — la liste et la fiche, dans les DEUX espaces (`/admin`, `/adm`, D-76) :
 * le paramètre `$invitation` arrive jusqu'au panneau, et aucune des quatre n'est plus
 * l'écran d'attente. Et la capacité qui les ouvre est `canManageUsers`, lue sur la
 * matrice servie — jamais sur le rôle.
 *
 * Le routeur est le VRAI : c'est ce qui prouve le branchement que les témoins de
 * panneau (à `deps` injecté) ne peuvent pas prouver.
 */

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const INVITATION = '64f1c2a9e8b7d6c5b4a39281';

describe('les routes des demandes de contact', () => {
  test('les quatre clés existent, avec leurs motifs', () => {
    expect(ROUTES.adminInvitations.pattern).toBe('/admin/invitations');
    expect(ROUTES.admInvitations.pattern).toBe('/adm/invitations');
    expect(ROUTES.adminInvitation.pattern).toBe('/admin/invitations/$invitation');
    expect(ROUTES.admInvitation.pattern).toBe('/adm/invitations/$invitation');
  });

  for (const url of ['/admin/invitations', '/adm/invitations']) {
    test(`${url} monte la liste, pas l’écran d’attente`, async () => {
      const host = await mountAdminAt(mounter, url, BIGBOSS, '[data-admin-invitations]');

      expect(host.querySelector('[data-admin-stub]')).toBeNull();
      expect(host.querySelector('[data-admin-page-title]')?.textContent).toBe('Demandes de contact');
    });
  }

  for (const url of [`/admin/invitations/${INVITATION}`, `/adm/invitations/${INVITATION}`]) {
    test(`${url} monte la fiche, pas l’écran d’attente`, async () => {
      const host = await mountAdminAt(mounter, url, BIGBOSS, '[data-admin-invitation-loading], [data-admin-invitation-fiche], [data-admin-error], [data-admin-empty]');

      expect(host.querySelector('[data-admin-stub]')).toBeNull();
      expect(host.textContent).not.toContain('Cette section arrive');
    });
  }
});

const without = (role: string) => adminIdentityFixture({ role, permissions: { canManageUsers: false } });
const sectionsOf = (identity: ReturnType<typeof adminIdentityFixture>) => visibleAdminSections(identity.permissions, identity.role).map((section) => section.id);

describe('qui voit la section Demandes de contact', () => {
  test('par la capacité servie canManageUsers — jamais par le rôle', () => {
    expect(sectionsOf(adminIdentityFixture({ role: 'BIGBOSS' }))).toContain('invitations');
    expect(sectionsOf(adminIdentityFixture({ role: 'ADMIN' }))).toContain('invitations');
    expect(sectionsOf(adminIdentityFixture({ role: 'USER', permissions: { canAccessAdmin: true, canManageUsers: true } }))).toContain('invitations');
  });

  test('sans canManageUsers, la section n’existe pas — même pour un administrateur', () => {
    for (const role of ['BIGBOSS', 'ADMIN', 'MODERATOR', 'AUDIT']) expect(sectionsOf(without(role))).not.toContain('invitations');
  });
});

function Probe() {
  const reach = useAdminReach();
  return <AdminSectionDirectory language="fr" reach={reach} />;
}

describe('la tuile du hub', () => {
  test('avec canManageUsers : la tuile est là, dans l’espace courant', async () => {
    const host = await mount(<Probe />, BIGBOSS);

    const tile = host.querySelector('[data-admin-section="invitations"]');
    expect(tile?.textContent).toContain('Demandes de contact');
    expect(tile?.getAttribute('href')).toBe('/admin/invitations');
  });

  test('sans canManageUsers : ni tuile ni accès', async () => {
    const host = await mount(<Probe />, without('ADMIN'));

    expect(host.querySelector('[data-admin-section="invitations"]')).toBeNull();
  });
});
