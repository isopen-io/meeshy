import { describe, expect, test } from 'bun:test';

import { AdminSectionDirectory } from '@/components/admin/section-directory';
import { visibleAdminSections } from '@/lib/admin/sections';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { mountAdminAt } from '@/test-support/admin-router';

import { ROUTES } from './route-table';

/**
 * **LES QUATRE ADRESSES DES LIENS DE SUIVI MÈNENT À LEURS ÉCRANS** (#8876, #6729) —
 * la liste et la fiche, dans les DEUX espaces (`/admin`, `/adm`, D-76) : le paramètre
 * `$link` arrive jusqu'au panneau, et aucune des quatre n'est plus l'écran d'attente.
 * La capacité qui les ouvre est `canViewAnalytics`, lue sur la matrice servie — jamais
 * sur le rôle : un auditeur (qui la porte) voit la section, un modérateur (qui ne la
 * porte pas) ne la voit pas.
 */

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const LINK = '64f1c2a9e8b7d6c5b4a39281';

describe('les routes des liens de suivi', () => {
  test('les quatre clés existent, avec leurs motifs', () => {
    expect(ROUTES.adminTrackingLinks.pattern).toBe('/admin/tracking-links');
    expect(ROUTES.admTrackingLinks.pattern).toBe('/adm/tracking-links');
    expect(ROUTES.adminTrackingLink.pattern).toBe('/admin/tracking-links/$link');
    expect(ROUTES.admTrackingLink.pattern).toBe('/adm/tracking-links/$link');
  });

  for (const url of ['/admin/tracking-links', '/adm/tracking-links']) {
    test(`${url} monte la liste, pas l’écran d’attente`, async () => {
      const host = await mountAdminAt(mounter, url, BIGBOSS, '[data-admin-tracking-links]');

      expect(host.querySelector('[data-admin-stub]')).toBeNull();
      expect(host.querySelector('[data-admin-page-title]')?.textContent).toBe('Liens de suivi');
    });
  }

  for (const url of [`/admin/tracking-links/${LINK}`, `/adm/tracking-links/${LINK}`]) {
    test(`${url} monte la fiche, pas l’écran d’attente`, async () => {
      const host = await mountAdminAt(mounter, url, BIGBOSS, '[data-admin-tracking-link-loading], [data-admin-tracking-link-fiche], [data-admin-error], [data-admin-empty]');

      expect(host.querySelector('[data-admin-stub]')).toBeNull();
      expect(host.textContent).not.toContain('Cette section arrive');
    });
  }
});

const without = (role: string) => adminIdentityFixture({ role, permissions: { canViewAnalytics: false } });
const sectionsOf = (identity: ReturnType<typeof adminIdentityFixture>) => visibleAdminSections(identity.permissions, identity.role).map((section) => section.id);

describe('qui voit la section Liens de suivi', () => {
  test('par la capacité servie canViewAnalytics — jamais par le rôle', () => {
    expect(sectionsOf(adminIdentityFixture({ role: 'BIGBOSS' }))).toContain('trackingLinks');
    expect(sectionsOf(adminIdentityFixture({ role: 'AUDIT' }))).toContain('trackingLinks');
    expect(sectionsOf(adminIdentityFixture({ role: 'USER', permissions: { canAccessAdmin: true, canViewAnalytics: true } }))).toContain('trackingLinks');
  });

  test('sans canViewAnalytics, la section n’existe pas — même pour un administrateur', () => {
    for (const role of ['BIGBOSS', 'ADMIN', 'AUDIT']) expect(sectionsOf(without(role))).not.toContain('trackingLinks');
  });

  test('un modérateur, qui ne lit pas les statistiques, ne voit pas les liens de suivi', () => {
    expect(sectionsOf(adminIdentityFixture({ role: 'MODERATOR' }))).not.toContain('trackingLinks');
  });
});

function Probe() {
  const reach = useAdminReach();
  return <AdminSectionDirectory language="fr" reach={reach} />;
}

describe('la tuile du hub', () => {
  test('avec canViewAnalytics : la tuile est là, dans l’espace courant', async () => {
    const host = await mount(<Probe />, BIGBOSS);

    const tile = host.querySelector('[data-admin-section="trackingLinks"]');
    expect(tile?.textContent).toContain('Liens de suivi');
    expect(tile?.getAttribute('href')).toBe('/admin/tracking-links');
  });

  test('sans canViewAnalytics : ni tuile ni accès', async () => {
    const host = await mount(<Probe />, without('ADMIN'));

    expect(host.querySelector('[data-admin-section="trackingLinks"]')).toBeNull();
  });
});
