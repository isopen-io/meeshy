import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ADMIN_PERMISSIONS_QUERY_KEY } from '@/lib/api/admin';
import { visibleAdminSections, type AdminPermissions } from '@/lib/admin/sections';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { mountAdminAt, resetAdminRouter } from '@/test-support/admin-router';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import AdminScreen from './admin';

/**
 * **LE HUB MÈNE À SES PIÈCES** (#6733 / #6862, revue-correction).
 *
 * Le lot D a trouvé que `admin.tsx` appelait `visibleAdminSections(permissions)`
 * SANS le rôle : la tuile « Conversations » (`adminRankOnly`) n'apparaissait
 * **jamais**, pour personne, et l'écran de lecture souveraine — écrit, testé,
 * routé — n'était atteignable qu'en tapant son adresse. Il l'a corrigé d'UNE
 * ligne, **sans témoin** : rien n'empêchait le même appel amputé de revenir, et
 * c'est exactement le défaut dont le correctif disait « rien ne pouvait le
 * voir ».
 *
 * Ce fichier le voit. Il monte l'écran avec la matrice SERVIE posée dans le
 * cache (`staleTime: 5 min` ⇒ aucune requête ne part) et lit les tuiles au DOM
 * — `data-admin-section`, la même ancre que le produit.
 *
 * **Le témoin se lit sur MODERATOR**, pas sur BIGBOSS : c'est le rang où les
 * deux lois divergent (leçon 261). Il porte `canManageConversations` et n'a pas
 * le RANG ; un hub qui rendrait toutes les tuiles à tout le monde passerait un
 * témoin écrit sur un BIGBOSS.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadAdminInterfaceCatalog('fr');
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const MATRICE: AdminPermissions = {
  canAccessAdmin: true,
  canManageUsers: true,
  canManageGroups: true,
  canManageConversations: true,
  canViewAnalytics: true,
  canModerateContent: true,
  canViewAuditLogs: true,
  canManageNotifications: true,
  canManageTranslations: true,
  canManageAgent: true,
};

async function hub(role: string, permissions: AdminPermissions = MATRICE): Promise<HTMLDivElement> {
  appQueryClient.setQueryData(ADMIN_PERMISSIONS_QUERY_KEY, { role, permissions });
  return mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminScreen />
    </QueryClientProvider>,
  );
}

const tuiles = (host: HTMLDivElement): readonly string[] =>
  [...host.querySelectorAll('[data-admin-section]')].map((n) => n.getAttribute('data-admin-section') ?? '');

describe('le hub d’administration mène à chacune de ses pièces', () => {
  test('un ADMIN voit la tuile des CONVERSATIONS — celle qui exige le rang', async () => {
    const host = await hub('ADMIN');
    expect(tuiles(host)).toContain('conversations');
  });

  test('il voit aussi la tuile de l’AGENT', async () => {
    const host = await hub('ADMIN');
    expect(tuiles(host)).toContain('agent');
  });

  test('chaque tuile est un LIEN qui mène quelque part — jamais un bloc décoratif', async () => {
    const host = await hub('BIGBOSS');
    for (const lien of host.querySelectorAll('[data-admin-section]')) {
      expect({ id: lien.getAttribute('data-admin-section'), href: lien.getAttribute('href') ?? '' }).not.toEqual({
        id: lien.getAttribute('data-admin-section'),
        href: '',
      });
    }
  });

  test('un MODERATOR ne voit PAS les conversations — le rang, pas la permission', async () => {
    // Il PORTE `canManageConversations` : c'est tout l'intérêt de ce rang-là.
    const host = await hub('MODERATOR');
    expect(tuiles(host)).not.toContain('conversations');
  });

  test('un MODERATOR sans `canManageAgent` ne voit pas l’agent non plus', async () => {
    const host = await hub('MODERATOR', { ...MATRICE, canManageAgent: false });
    expect(tuiles(host)).not.toContain('agent');
  });
});

/**
 * **LE HUB EST LE REFLET EXACT DE CE QUE LE LECTEUR PEUT OUVRIR** (#8876) — ses
 * attentes sont DÉRIVÉES de `visibleAdminSections`, jamais une liste écrite :
 * dix lots basculent leur drapeau de disponibilité à tour de rôle, et une liste
 * épinglée ici changerait à chaque bascule, pour des raisons qui n'ont rien à
 * voir avec le hub.
 */
describe('le hub reflète `visibleAdminSections`, groupe par groupe', () => {
  const attendues = (role: string, permissions: AdminPermissions = MATRICE) =>
    visibleAdminSections(permissions, role)
      .filter((section) => section.id !== 'dashboard')
      .map((section) => section.id);

  test('un BIGBOSS voit une tuile pour chaque section qu’il peut ouvrir — ni plus, ni moins', async () => {
    const host = await hub('BIGBOSS');
    expect([...tuiles(host)].sort()).toEqual([...attendues('BIGBOSS')].sort());
  });

  test('un MODERATOR : exactement ce que son rôle ouvre', async () => {
    const identite = adminIdentityFixture({ role: 'MODERATOR' });
    const host = await hub('MODERATOR', identite.permissions);
    expect([...tuiles(host)].sort()).toEqual([...attendues('MODERATOR', identite.permissions)].sort());
  });

  test('les tuiles sont RANGÉES par groupe, chaque groupe porte son titre', async () => {
    const host = await hub('BIGBOSS');
    const groupes = [...host.querySelectorAll('[data-admin-group]')];

    expect(groupes.length).toBeGreaterThan(0);
    for (const groupe of groupes) {
      expect(groupe.querySelector('h2')?.textContent ?? '').not.toBe('');
      expect(groupe.querySelectorAll('[data-admin-section]').length).toBeGreaterThan(0);
    }
  });

  test('aucune tuile ne mène vers une section pas prête — jamais un écran d’attente', async () => {
    const host = await hub('BIGBOSS');
    for (const id of tuiles(host)) {
      expect(visibleAdminSections(MATRICE, 'BIGBOSS').map((section) => section.id)).toContain(id);
    }
  });

  test('le sous-titre dit le rôle servi en mots — jamais « BIGBOSS »', async () => {
    const host = await hub('BIGBOSS');
    expect(host.querySelector('[data-admin-page-header] p')?.textContent).toBe('Connecté en tant que Créateur');
    expectNoRawIdentifiers(host);
  });

  test('chaque tuile porte sa ligne d’aide sous son libellé', async () => {
    const host = await hub('BIGBOSS');
    for (const tuile of host.querySelectorAll('[data-admin-section]')) {
      expect((tuile.querySelectorAll('span > span')[1]?.textContent ?? '').length).toBeGreaterThan(0);
    }
  });
});

describe('le hub reste DANS l’espace où l’on est (D-76)', () => {
  test('depuis /adm, chaque tuile mène sous /adm — jamais à /admin', async () => {
    const host = await mountAdminAt(mounter, '/adm', adminIdentityFixture({ role: 'BIGBOSS' }), '[data-admin-directory]');
    const liens = [...host.querySelectorAll('[data-admin-section]')].map((lien) => lien.getAttribute('href') ?? '');

    expect(liens.length).toBeGreaterThan(0);
    expect(liens.filter((href) => !href.startsWith('/adm/'))).toEqual([]);
    resetAdminRouter();
  });

  test('depuis /admin, chaque tuile mène sous /admin', async () => {
    const host = await mountAdminAt(mounter, '/admin', adminIdentityFixture({ role: 'BIGBOSS' }), '[data-admin-directory]');
    const liens = [...host.querySelectorAll('[data-admin-section]')].map((lien) => lien.getAttribute('href') ?? '');

    expect(liens.filter((href) => !href.startsWith('/admin/'))).toEqual([]);
    resetAdminRouter();
  });
});
