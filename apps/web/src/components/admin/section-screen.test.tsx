import { describe, expect, test } from 'bun:test';

import { ADMIN_PERMISSIONS_QUERY_KEY } from '@/lib/api/admin';
import { appQueryClient } from '@/lib/api/query-client';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

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

  test('section dont la permission manque : refusée, même à BIGBOSS — le rôle ne remplace pas la matrice', async () => {
    const host = await mount(
      <AdminSectionScreen section="broadcasts" language="fr" title="Diffusions">
        {() => <p data-contenu>contenu</p>}
      </AdminSectionScreen>,
      adminIdentityFixture({ role: 'BIGBOSS', permissions: { canManageNotifications: false } }),
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
