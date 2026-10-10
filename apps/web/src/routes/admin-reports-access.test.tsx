import { describe, expect, test } from 'bun:test';

import { AdminSectionDirectory } from '@/components/admin/section-directory';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { visibleAdminSections } from '@/lib/admin/sections';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { HttpRequest, HttpTransport } from '@/lib/api/http';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminReportsPanel } from './admin-reports';

/**
 * **DÉCISION #6843 — UNE TUILE PORTE LA CAPACITÉ DE CE QU'ELLE OUVRE** (option C,
 * complétée par un masquage par bloc à l'intérieur de l'écran).
 *
 * La tuile « Signalements » porte `canModerateContent` — exactement la garde des
 * dix routes de `reports.ts`. Les statistiques de messages quittent la modération
 * (elles vont sous « Statistiques »), les publications ont leur propre section :
 * la tuile ne demande donc ni plus ni moins que ce que l'écran sert. Un lecteur
 * qui ne la porte ne voit NI la tuile NI l'écran, et aucune requête ne part.
 */

const { mount } = setupAdminKitTests();

const without = (role: string) => adminIdentityFixture({ role, permissions: { canModerateContent: false } });

const sectionsOf = (identity: ReturnType<typeof adminIdentityFixture>) => visibleAdminSections(identity.permissions, identity.role).map((section) => section.id);

describe('qui voit la section Signalements', () => {
  test('le créateur et les modérateurs, par la capacité servie — jamais par le rôle', () => {
    expect(sectionsOf(adminIdentityFixture({ role: 'BIGBOSS' }))).toContain('reports');
    expect(sectionsOf(adminIdentityFixture({ role: 'MODERATOR' }))).toContain('reports');
    expect(sectionsOf(adminIdentityFixture({ role: 'USER', permissions: { canAccessAdmin: true, canModerateContent: true } }))).toContain('reports');
  });

  test('sans canModerateContent, la section n’existe pas — même pour un administrateur', () => {
    for (const role of ['BIGBOSS', 'ADMIN', 'MODERATOR', 'AUDIT', 'ANALYST']) {
      expect(sectionsOf(without(role))).not.toContain('reports');
    }
  });

  test('aucune AUTRE capacité ne suffit : auditeurs et analystes ne voient pas la file', () => {
    expect(sectionsOf(adminIdentityFixture({ role: 'AUDIT' }))).not.toContain('reports');
    expect(sectionsOf(adminIdentityFixture({ role: 'ANALYST' }))).not.toContain('reports');
  });

  test('canModerateContent seule (sans canAccessAdmin) n’ouvre pas l’administration : fail-closed', () => {
    expect(sectionsOf(adminIdentityFixture({ role: 'USER', permissions: { canModerateContent: true } }))).toEqual([]);
  });
});

function Probe() {
  const reach = useAdminReach();
  return (
    <>
      <p data-opens-reports>{String(reach.opens('reports'))}</p>
      <AdminSectionDirectory language="fr" reach={reach} />
    </>
  );
}

describe('la tuile et l’écran, rendus', () => {
  test('avec canModerateContent : la tuile « Signalements » est dans le hub, et reach.opens(reports) est vrai', async () => {
    const host = await mount(<Probe />, adminIdentityFixture({ role: 'MODERATOR' }));

    expect(host.querySelector('[data-opens-reports]')?.textContent).toBe('true');
    const tile = host.querySelector('[data-admin-section="reports"]');
    expect(tile?.textContent).toContain('Signalements');
    expect(tile?.getAttribute('href')).toBe('/admin/reports');
  });

  test('sans canModerateContent : NI la tuile NI l’accès — reach.opens(reports) est faux', async () => {
    const host = await mount(<Probe />, without('ADMIN'));

    expect(host.querySelector('[data-opens-reports]')?.textContent).toBe('false');
    expect(host.querySelector('[data-admin-section="reports"]')).toBeNull();
    expect(host.querySelector('[data-admin-section="users"]')).not.toBeNull();
  });

  test('sans canModerateContent, l’écran rend le refus unique et ne demande RIEN à la passerelle', async () => {
    const calls: HttpRequest[] = [];
    const transport = {
      request: async (request: HttpRequest) => {
        calls.push(request);
        return { ok: true as const, data: {} };
      },
    } as unknown as HttpTransport;

    const host = await mount(
      <AdminSectionScreen section="reports" language="fr" title="Signalements">
        {() => <AdminReportsPanel language="fr" deps={{ source: 'gateway', transport }} />}
      </AdminSectionScreen>,
      without('ADMIN'),
    );

    expect(host.textContent).toContain('Espace réservé');
    expect(host.querySelector('[data-admin-reports]')).toBeNull();
    expect(calls).toEqual([]);
  });
});
