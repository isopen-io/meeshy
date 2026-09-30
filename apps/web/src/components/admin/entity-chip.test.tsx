import { describe, expect, test } from 'bun:test';

import { ADMIN_FICHES, adminFicheRoute } from '@/lib/admin/admin-routes';
import { ROUTES } from '@/routes/route-table';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { mountAdminAt, resetAdminRouter } from '@/test-support/admin-router';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminEntityChip, AdminEntityIdentity, AdminEntityLink, AdminLink, AdminRouteLink, type AdminEntityRef } from './entity-chip';

const { mount, mounter } = setupAdminKitTests();

const ID = '64f1c2a9e8b7d6c5b4a39281';
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });

const user: AdminEntityRef = { kind: 'user', id: ID, label: 'Awa Diop', secondary: '@awa' };

describe('AdminLink — vers une section ou la fiche d’une entité', () => {
  test('une section : un lien dans l’espace courant (/admin par défaut)', async () => {
    const host = await mount(<AdminLink target={{ kind: 'section', section: 'users', search: { role: 'ADMIN' } }}>Comptes</AdminLink>, BIGBOSS);
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/admin/users?role=ADMIN');
  });

  test('les genres dont la section est prête ouvrent leur fiche sous /admin', async () => {
    for (const [entity, path] of [
      ['user', 'users'],
      ['anonymous', 'anonymous'],
      ['conversation', 'conversations'],
    ] as const) {
      const host = await mount(<AdminLink target={{ kind: 'entity', entity, id: ID }}>x</AdminLink>, BIGBOSS);
      expect(host.querySelector('a')?.getAttribute('href')).toBe(`/admin/${path}/${ID}`);
      mounter.unmountAll();
    }
  });

  test('une section pas encore prête n’est JAMAIS un lien : texte seul — loi 4', async () => {
    const host = await mount(<AdminLink target={{ kind: 'section', section: 'audit' }}>Journal</AdminLink>, BIGBOSS);
    expect(host.querySelector('a')).toBeNull();
    expect(host.textContent).toBe('Journal');
  });

  test('une section que le lecteur ne peut pas ouvrir est un texte seul, même prête', async () => {
    const host = await mount(
      <AdminLink target={{ kind: 'entity', entity: 'conversation', id: ID }}>Équipe</AdminLink>,
      adminIdentityFixture({ role: 'MODERATOR' }),
    );
    expect(host.querySelector('a')).toBeNull();
    expect(host.textContent).toBe('Équipe');
  });

  test('sans identité connue (fail-closed), aucun lien', async () => {
    const host = await mount(<AdminLink target={{ kind: 'section', section: 'users' }}>Comptes</AdminLink>);
    expect(host.querySelector('a')).toBeNull();
  });

  test('l’ancre et le nom accessible passent', async () => {
    const host = await mount(
      <AdminLink target={{ kind: 'section', section: 'users' }} anchor="ouvrir" ariaLabel="Ouvrir les comptes">
        Comptes
      </AdminLink>,
      BIGBOSS,
    );
    expect(host.querySelector('a')?.getAttribute('data-admin-link')).toBe('ouvrir');
    expect(host.querySelector('a')?.getAttribute('aria-label')).toBe('Ouvrir les comptes');
  });

  test('AdminEntityLink : le nom par défaut, ou des enfants', async () => {
    const host = await mount(
      <div>
        <AdminEntityLink entity={user} />
        <AdminEntityLink entity={user}>Voir</AdminEntityLink>
      </div>,
      BIGBOSS,
    );
    expect([...host.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Awa Diop', 'Voir']);
  });
});

describe('AdminRouteLink — le switch exhaustif, sur les dix genres et les deux espaces', () => {
  for (const space of ['admin', 'adm'] as const) {
    test(`chaque genre mène à SA fiche sous /${space}, avec le paramètre de son motif`, async () => {
      for (const fiche of ADMIN_FICHES) {
        const host = await mount(
          <AdminRouteLink target={{ kind: 'entity', entity: fiche.entity, id: ID, search: { tab: 'x' } }} space={space}>
            x
          </AdminRouteLink>,
        );
        const attendu = `${ROUTES[adminFicheRoute(fiche.entity, space)].pattern.replace(`$${fiche.param}`, ID)}?tab=x`;
        expect({ entity: fiche.entity, href: host.querySelector('a')?.getAttribute('href') }).toEqual({ entity: fiche.entity, href: attendu });
        expect(attendu.startsWith(space === 'adm' ? '/adm/' : '/admin/')).toBe(true);
        mounter.unmountAll();
      }
    });
  }
});

describe('AdminEntityChip — le vrai nom, jamais l’identifiant', () => {
  test('avatar, nom, @username ; la puce entière est le lien de 44 px', async () => {
    const host = await mount(<AdminEntityChip language="fr" entity={user} />, BIGBOSS);
    const lien = host.querySelector('a');
    expect(lien?.textContent).toContain('Awa Diop');
    expect(lien?.textContent).toContain('@awa');
    expect(lien?.getAttribute('href')).toBe(`/admin/users/${ID}`);
    expect(lien?.getAttribute('aria-label')).toBe('Ouvrir la fiche de Awa Diop');
    expect(lien?.style.minHeight).toBe('44px');
    expectNoRawIdentifiers(host);
  });

  test('un genre sans personne (conversation) porte le glyphe de son genre, pas un avatar', async () => {
    const host = await mount(<AdminEntityChip language="fr" entity={{ kind: 'conversation', id: ID, label: 'Équipe produit' }} />, BIGBOSS);
    expect(host.querySelector('[data-admin-entity="conversation"] svg')).not.toBeNull();
  });

  test('une entité supprimée : barrée, le mot « supprimé », et aucune fiche à ouvrir', async () => {
    const host = await mount(<AdminEntityChip language="fr" entity={{ ...user, deleted: true }} />, BIGBOSS);
    expect(host.querySelector('a')).toBeNull();
    expect(host.textContent).toContain('supprimé');
    expect(host.querySelector('[data-admin-entity] .truncate')?.getAttribute('style')).toContain('line-through');
  });

  test('si le lecteur ne peut pas ouvrir la section, la puce est une étiquette', async () => {
    const host = await mount(<AdminEntityChip language="fr" entity={{ kind: 'conversation', id: ID, label: 'Équipe' }} />, adminIdentityFixture({ role: 'MODERATOR' }));
    expect(host.querySelector('a')).toBeNull();
    expect(host.textContent).toContain('Équipe');
  });

  test('AdminEntityIdentity : la même identité SANS lien — ce que pose une colonne primaire', async () => {
    const host = await mount(<AdminEntityIdentity language="fr" entity={user} />, BIGBOSS);
    expect(host.querySelector('a')).toBeNull();
    expect(host.textContent).toContain('Awa Diop');
  });
});

describe('les liens restent dans l’espace courant (D-76)', () => {
  test('sous /adm, une puce mène à la fiche sous /adm — jamais à /admin', async () => {
    const host = await mountAdminAt(mounter, '/adm', BIGBOSS, '[data-admin-directory]');
    const lien = host.querySelector('[data-admin-directory] a')?.getAttribute('href') ?? '';
    expect(lien.startsWith('/adm/')).toBe(true);
    resetAdminRouter(mounter);
  });
});
