import { describe, expect, test } from 'bun:test';

import { AdminSectionDirectory } from '@/components/admin/section-directory';
import { visibleAdminSections } from '@/lib/admin/sections';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { mountAdminAt } from '@/test-support/admin-router';

import { ROUTES } from './route-table';

/**
 * **LES QUATRE ADRESSES DES LIENS DE PARTAGE MÈNENT À LEURS ÉCRANS** (#8876, #6729)
 * — la liste et la fiche, dans les DEUX espaces (`/admin`, `/adm`, D-76) : le
 * paramètre `$link` arrive jusqu'au panneau, et aucune des quatre n'est plus l'écran
 * d'attente. La capacité qui les ouvre est `canManageConversations`, lue sur la
 * matrice servie — jamais sur le rôle.
 */

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const LINK = '64f1c2a9e8b7d6c5b4a39281';

describe('les routes des liens de partage', () => {
  test('les quatre clés existent, avec leurs motifs', () => {
    expect(ROUTES.adminShareLinks.pattern).toBe('/admin/share-links');
    expect(ROUTES.admShareLinks.pattern).toBe('/adm/share-links');
    expect(ROUTES.adminShareLink.pattern).toBe('/admin/share-links/$link');
    expect(ROUTES.admShareLink.pattern).toBe('/adm/share-links/$link');
  });

  for (const url of ['/admin/share-links', '/adm/share-links']) {
    test(`${url} monte la liste, pas l’écran d’attente`, async () => {
      const host = await mountAdminAt(mounter, url, BIGBOSS, '[data-admin-share-links]');

      expect(host.querySelector('[data-admin-stub]')).toBeNull();
      expect(host.querySelector('[data-admin-page-title]')?.textContent).toBe('Liens de partage');
    });
  }

  for (const url of [`/admin/share-links/${LINK}`, `/adm/share-links/${LINK}`]) {
    test(`${url} monte la fiche, pas l’écran d’attente`, async () => {
      const host = await mountAdminAt(mounter, url, BIGBOSS, '[data-admin-share-link-loading], [data-admin-share-link-fiche], [data-admin-error], [data-admin-empty]');

      expect(host.querySelector('[data-admin-stub]')).toBeNull();
      expect(host.textContent).not.toContain('Cette section arrive');
    });
  }
});

const without = (role: string) => adminIdentityFixture({ role, permissions: { canManageConversations: false } });
const sectionsOf = (identity: ReturnType<typeof adminIdentityFixture>) => visibleAdminSections(identity.permissions, identity.role).map((section) => section.id);

describe('qui voit la section Liens de partage', () => {
  test('par la capacité servie canManageConversations — jamais par le rôle', () => {
    expect(sectionsOf(adminIdentityFixture({ role: 'BIGBOSS' }))).toContain('shareLinks');
    expect(sectionsOf(adminIdentityFixture({ role: 'MODERATOR' }))).toContain('shareLinks');
    expect(sectionsOf(adminIdentityFixture({ role: 'USER', permissions: { canAccessAdmin: true, canManageConversations: true } }))).toContain('shareLinks');
  });

  test('sans canManageConversations, la section n’existe pas — même pour un administrateur', () => {
    for (const role of ['BIGBOSS', 'ADMIN', 'MODERATOR']) expect(sectionsOf(without(role))).not.toContain('shareLinks');
  });

  test('un auditeur, qui ne gère pas les conversations, ne voit pas les liens de partage', () => {
    expect(sectionsOf(adminIdentityFixture({ role: 'AUDIT' }))).not.toContain('shareLinks');
  });
});

function Probe() {
  const reach = useAdminReach();
  return <AdminSectionDirectory language="fr" reach={reach} />;
}

describe('la tuile du hub', () => {
  test('avec canManageConversations : la tuile est là, dans l’espace courant', async () => {
    const host = await mount(<Probe />, BIGBOSS);

    const tile = host.querySelector('[data-admin-section="shareLinks"]');
    expect(tile?.textContent).toContain('Liens de partage');
    expect(tile?.getAttribute('href')).toBe('/admin/share-links');
  });

  test('sans canManageConversations : ni tuile ni accès', async () => {
    const host = await mount(<Probe />, without('ADMIN'));

    expect(host.querySelector('[data-admin-section="shareLinks"]')).toBeNull();
  });
});
