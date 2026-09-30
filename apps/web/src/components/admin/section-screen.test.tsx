import { describe, expect, test } from 'bun:test';

import { ADMIN_PERMISSIONS_QUERY_KEY } from '@/lib/api/admin';
import { appQueryClient } from '@/lib/api/query-client';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { mountAdminAt, resetAdminRouter } from '@/test-support/admin-router';

import { AdminSectionScreen } from './section-screen';

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });

describe('AdminSectionScreen — la garde de tout écran de section', () => {
  test('identité en vol : un squelette dans le cadre — jamais le refus (il clignoterait une accusation)', async () => {
    void appQueryClient.prefetchQuery({ queryKey: ADMIN_PERMISSIONS_QUERY_KEY, queryFn: () => new Promise(() => undefined) });
    const host = await mount(
      <AdminSectionScreen section="users" language="fr" title="Comptes">
        {() => <p data-contenu>contenu</p>}
      </AdminSectionScreen>,
    );
    expect(host.querySelector('[data-admin-shell]')).not.toBeNull();
    expect(host.querySelector('[data-contenu]')).toBeNull();
    expect(host.textContent).not.toContain('Espace réservé');
  });

  test('section non ouverte (refus) : le refus unique, qui ne dit pas pourquoi', async () => {
    const host = await mount(
      <AdminSectionScreen section="users" language="fr" title="Comptes">
        {() => <p data-contenu>contenu</p>}
      </AdminSectionScreen>,
      adminIdentityFixture({ role: 'MODERATOR' }),
    );
    expect(host.textContent).toContain('Espace réservé');
    expect(host.querySelector('[data-contenu]')).toBeNull();
  });

  test('section PAS PRÊTE : refusée, même pour BIGBOSS — rien ne mène à un écran d’attente', async () => {
    const host = await mount(
      <AdminSectionScreen section="audit" language="fr" title="Journal d’audit">
        {() => <p data-contenu>contenu</p>}
      </AdminSectionScreen>,
      BIGBOSS,
    );
    expect(host.querySelector('[data-contenu]')).toBeNull();
    expect(host.textContent).toContain('Espace réservé');
  });

  test('section ouverte : les enfants reçoivent la portée du lecteur, dans le cadre', async () => {
    const vus: string[] = [];
    const host = await mount(
      <AdminSectionScreen section="users" language="fr" title="Comptes">
        {(reach) => {
          vus.push(`${reach.status}:${reach.hasAdminRank}:${reach.isSovereign}`);
          return <p data-contenu>contenu</p>;
        }}
      </AdminSectionScreen>,
      BIGBOSS,
    );
    expect(host.querySelector('main [data-contenu]')?.textContent).toBe('contenu');
    expect(vus).toContain('ready:true:true');
    expect(host.querySelector('header h1')).toBeNull();
  });

  test('retour par défaut d’une liste : le hub de l’ESPACE COURANT, libellé « Administration »', async () => {
    const host = await mount(
      <AdminSectionScreen section="users" language="fr" title="Comptes">
        {() => <p>c</p>}
      </AdminSectionScreen>,
      BIGBOSS,
    );
    expect(host.querySelector('[data-admin-back]')?.getAttribute('href')).toBe('/admin');
    expect(host.querySelector('[data-admin-back-label]')?.textContent).toBe('Administration');
  });

  test('`back="list"` mène à l’application, libellé « Retour à l’application »', async () => {
    const host = await mount(
      <AdminSectionScreen section="dashboard" language="fr" title="Administration" back="list">
        {() => <p>c</p>}
      </AdminSectionScreen>,
      BIGBOSS,
    );
    expect(host.querySelector('[data-admin-back]')?.getAttribute('href')).toBe('/');
    expect(host.querySelector('[data-admin-back-label]')?.textContent).toBe('Retour à l\'application');
  });

  test('un `back` explicite est respecté, libellé par le titre', async () => {
    const host = await mount(
      <AdminSectionScreen section="users" language="fr" title="Comptes" back="adminAnonymous">
        {() => <p>c</p>}
      </AdminSectionScreen>,
      BIGBOSS,
    );
    expect(host.querySelector('[data-admin-back]')?.getAttribute('href')).toBe('/admin/anonymous');
    expect(host.querySelector('[data-admin-back-label]')?.textContent).toBe('Comptes');
  });

  test('depuis une FICHE, le retour est la liste de sa section dans l’espace courant', async () => {
    const { Router } = createRouter(
      {
        admUser: {
          pattern: '/adm/users/$user',
          screen: async () => ({
            default: () => (
              <AdminSectionScreen section="users" language="fr" title="Awa Diop">
                {() => <p data-fiche>fiche</p>}
              </AdminSectionScreen>
            ),
          }),
        },
      },
      () => <p>absent</p>,
    );
    navigate('/adm/users/64f1c2a9e8b7d6c5b4a39281', true);
    const host = await mount(<Router wrap={(children) => children} skeleton={null} />, BIGBOSS);
    for (let attempt = 0; attempt < 20 && host.querySelector('[data-fiche]') === null; attempt += 1) await mounter.settle();

    expect(host.querySelector('[data-admin-back]')?.getAttribute('href')).toBe('/adm/users');
    expect(host.querySelector('[data-admin-back-label]')?.textContent).toBe('Comptes');
  });
});

describe('AdminStubScreen — l’écran d’attente, joignable par son adresse seulement', () => {
  const stub = (url: string, identity: ReturnType<typeof adminIdentityFixture>) => mountAdminAt(mounter, url, identity, '[data-admin-shell]');

  test('annonce « Cette section arrive », sous le seul h1 de la page, sans identifiant brut', async () => {
    const host = await stub('/admin/audit', BIGBOSS);
    expect(host.querySelector('[data-admin-stub="audit"]')).not.toBeNull();
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    expect(host.querySelector('h1')?.textContent).toBe('Journal d’audit');
    expect(host.textContent).toContain('Cette section arrive');
    expectNoRawIdentifiers(host);
    resetAdminRouter(mounter);
  });

  test('ses fiches aussi sont en attente, dans l’espace /adm', async () => {
    const host = await stub('/adm/reports/64f1c2a9e8b7d6c5b4a39281', adminIdentityFixture({ role: 'MODERATOR' }));
    expect(host.querySelector('[data-admin-stub="reports"]')).not.toBeNull();
    expect(host.querySelector('[data-admin-back]')?.getAttribute('href')).toBe('/adm/reports');
    resetAdminRouter(mounter);
  });

  test('sans la capacité de la section, le refus unique — l’existence de la section ne se révèle pas', async () => {
    const host = await stub('/admin/audit', adminIdentityFixture({ role: 'MODERATOR' }));
    expect(host.querySelector('[data-admin-stub]')).toBeNull();
    expect(host.textContent).toContain('Espace réservé');
    resetAdminRouter(mounter);
  });

  test('AUDIT, qui porte canViewAuditLogs, entre sur l’attente du journal', async () => {
    const host = await stub('/admin/audit', adminIdentityFixture({ role: 'AUDIT' }));
    expect(host.querySelector('[data-admin-stub="audit"]')).not.toBeNull();
    resetAdminRouter(mounter);
  });

  test('la section n’est ni au menu ni au hub tant que son drapeau est faux', async () => {
    const host = await stub('/admin/audit', BIGBOSS);
    expect(host.querySelector('[data-admin-sidebar] [data-admin-nav="audit"]')).toBeNull();
    resetAdminRouter(mounter);
  });
});
