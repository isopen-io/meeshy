import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { ADMIN_PERMISSIONS_QUERY_KEY } from '@/lib/api/admin';
import { visibleAdminSections, type AdminPermissions } from '@/lib/admin/sections';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { navigate } from '@/lib/router';
import { createActMounter } from '@/test-support/act-mount';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { mountAdminAt, resetAdminRouter } from '@/test-support/admin-router';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminScreenFrame } from './admin-shell';

/**
 * **LE CADRE D'ADMINISTRATION** (#7873) — un menu à gauche, toujours là,
 * repliable, et le contenu qui suit.
 *
 * Le témoin se lit sur MODERATOR : il porte `canManageConversations` sans le
 * rang, et un menu qui offrirait toutes les entrées à tout le monde passerait
 * un témoin écrit sur un BIGBOSS (leçon 261).
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
  navigate('/', true);
  try {
    localStorage.clear();
  } catch {
    return;
  }
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
  canManageAgent: false,
};

async function cadre(role: string): Promise<HTMLDivElement> {
  appQueryClient.setQueryData(ADMIN_PERMISSIONS_QUERY_KEY, { role, permissions: MATRICE });
  return mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminScreenFrame language="fr" title="Comptes" back="admin">
        <p data-contenu>contenu</p>
      </AdminScreenFrame>
    </QueryClientProvider>,
  );
}

const entrees = (racine: ParentNode): readonly string[] =>
  [...racine.querySelectorAll('[data-admin-nav]')].map((n) => n.getAttribute('data-admin-nav') ?? '');

describe('le menu latéral d’administration', () => {
  test('offre les sections servies, anonymes compris, et le contenu à côté', async () => {
    const hote = await cadre('ADMIN');
    const menu = hote.querySelector('[data-admin-sidebar]');

    expect(entrees(menu ?? hote)).toEqual(visibleAdminSections(MATRICE, 'ADMIN').map((section) => section.id));
    expect(entrees(menu ?? hote)).toContain('anonymous');
    expect(hote.querySelector('[data-contenu]')?.textContent).toBe('contenu');
  });

  test('un MODERATOR n’y voit pas les conversations, que la passerelle lui refuserait', async () => {
    const menu = (await cadre('MODERATOR')).querySelector('[data-admin-sidebar]');
    expect(entrees(menu ?? document)).not.toContain('conversations');
  });

  test('se replie en rail d’icônes, et s’en souvient', async () => {
    const hote = await cadre('ADMIN');
    const bascule = hote.querySelector<HTMLButtonElement>('[data-admin-sidebar-toggle]');

    expect(bascule?.getAttribute('aria-expanded')).toBe('true');
    act(() => bascule?.click());

    expect(hote.querySelector('[data-admin-sidebar]')?.getAttribute('data-folded')).toBe('true');
    expect(bascule?.getAttribute('aria-expanded')).toBe('false');

    mounter.unmountAll();
    expect((await cadre('ADMIN')).querySelector('[data-admin-sidebar]')?.getAttribute('data-folded')).toBe('true');
  });

  test('replié, chaque entrée garde son nom pour le lecteur d’écran', async () => {
    const hote = await cadre('ADMIN');
    act(() => hote.querySelector<HTMLButtonElement>('[data-admin-sidebar-toggle]')?.click());

    const comptes = hote.querySelector('[data-admin-sidebar] [data-admin-nav="users"]');
    expect(comptes?.textContent).toContain('Comptes');
    expect(comptes?.getAttribute('title')).toBe('Comptes');
  });

  test('sur petit écran, le tiroir s’ouvre depuis l’en-tête et se ferme sur Échap', async () => {
    const hote = await cadre('ADMIN');
    expect(hote.querySelector('[data-admin-drawer]')).toBeNull();

    act(() => hote.querySelector<HTMLButtonElement>('[data-admin-menu-open]')?.click());
    expect(entrees(hote.querySelector('[data-admin-drawer]') ?? document)).toContain('users');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(hote.querySelector('[data-admin-drawer]')).toBeNull();
  });

  /* #8020 — le retour matériel de la coque Android rejoue `history.back()` :
     comme toute couche modale (`useBackDismiss`), le tiroir pose son entrée
     d'historique et se ferme sur `popstate`, au lieu de quitter l'écran. */
  test('le retour Android ferme le tiroir au lieu de quitter l’écran (#8020)', async () => {
    const hote = await cadre('ADMIN');

    act(() => hote.querySelector<HTMLButtonElement>('[data-admin-menu-open]')?.click());
    expect(typeof (window.history.state as { readonly backDismiss?: unknown } | null)?.backDismiss).toBe('string');

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(hote.querySelector('[data-admin-drawer]')).toBeNull();
  });
});

/**
 * L'EN-TÊTE À GAUCHE, LE TITRE DANS LE CONTENU (#8289) — la page Comptes montre
 * « ‹ Comptes » à gauche, son action principale (« Créer un compte ») en haut
 * à droite de l'en-tête, et son titre dans le contenu, où il est le seul
 * `<h1>` de la page.
 */
describe('l’en-tête « ‹ Comptes » et son action', () => {
  test('le libellé suit le retour à gauche, l’action est à droite, et aucun titre n’est posé dans l’en-tête', async () => {
    appQueryClient.setQueryData(ADMIN_PERMISSIONS_QUERY_KEY, { role: 'ADMIN', permissions: MATRICE });
    const hote = await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <AdminScreenFrame
          language="fr"
          title="Comptes"
          back="admin"
          heading="content"
          backLabel="Comptes"
          actions={
            <button type="button" data-action-entete>
              Créer un compte
            </button>
          }
        >
          <h1 data-titre-contenu>Comptes</h1>
        </AdminScreenFrame>
      </QueryClientProvider>,
    );
    const entete = hote.querySelector('header');
    const enfants = [...(entete?.children ?? [])];

    expect(entete?.querySelector('h1')).toBeNull();
    expect(entete?.querySelector('[data-admin-back-label]')?.textContent).toBe('Comptes');
    const retour = enfants.findIndex((e) => e.matches('[data-admin-back]'));
    const action = enfants.findIndex((e) => e.querySelector('[data-action-entete]') !== null);
    expect(retour).toBeGreaterThanOrEqual(0);
    expect(action).toBeGreaterThan(retour);
    expect(hote.querySelectorAll('h1')).toHaveLength(1);
    expect(hote.querySelector('main [data-titre-contenu]')).not.toBeNull();
  });

  test('par défaut, l’en-tête garde son titre — les autres écrans ne bougent pas', async () => {
    const hote = await cadre('ADMIN');
    expect(hote.querySelector('header h1')?.textContent).toBe('Comptes');
    expect(hote.querySelector('[data-admin-back-label]')).toBeNull();
  });
});

/**
 * **LE MENU EST GROUPÉ** (#8876) — sept groupes titrés, dans l'ordre où ils se
 * lisent, et un groupe sans section visible n'est pas rendu. Replié en rail, le
 * titre cède la place à un séparateur : les groupes restent lisibles sans mot.
 */
describe('le menu latéral groupé', () => {
  const groupes = (racine: ParentNode): readonly string[] =>
    [...racine.querySelectorAll('[data-admin-nav-group]')].map((n) => n.getAttribute('data-admin-nav-group') ?? '');

  test('range les sections sous leur groupe, dans l’ordre des groupes', async () => {
    const hote = await cadre('ADMIN');
    const visibles = visibleAdminSections(MATRICE, 'ADMIN');
    const attendus = [...new Set(visibles.map((section) => section.group))];

    expect(groupes(hote)).toEqual(attendus);
    for (const groupe of hote.querySelectorAll('[data-admin-nav-group]')) {
      const id = groupe.getAttribute('data-admin-nav-group');
      const dedans = [...groupe.querySelectorAll('[data-admin-nav]')].map((n) => n.getAttribute('data-admin-nav'));
      expect(dedans).toEqual(visibles.filter((section) => section.group === id).map((section) => section.id));
    }
  });

  test('chaque groupe affiche son titre, déplié', async () => {
    const hote = await cadre('ADMIN');
    const titres = [...hote.querySelectorAll('[data-admin-sidebar] [data-admin-nav-group] > p')].map((p) => p.textContent);

    expect(titres.length).toBeGreaterThan(0);
    expect(titres.every((titre) => (titre ?? '').length > 0)).toBe(true);
  });

  test('replié, les titres cèdent la place à des séparateurs — et chaque entrée garde son nom', async () => {
    const hote = await cadre('ADMIN');
    act(() => hote.querySelector<HTMLButtonElement>('[data-admin-sidebar-toggle]')?.click());

    expect(hote.querySelectorAll('[data-admin-sidebar] [data-admin-nav-group] > p')).toHaveLength(0);
    expect(hote.querySelectorAll('[data-admin-sidebar] [data-admin-nav-group] > hr').length).toBe(groupes(hote).length - 1);
    expect(hote.querySelector('[data-admin-sidebar] [data-admin-nav="users"]')?.getAttribute('title')).toBe('Comptes');
  });

  test('chaque entrée porte un GLYPHE du jeu d’administration, jamais un emoji', async () => {
    const hote = await cadre('ADMIN');
    for (const entree of hote.querySelectorAll('[data-admin-sidebar] [data-admin-nav]')) {
      expect(entree.querySelector('svg')).not.toBeNull();
      expect(entree.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  test('un MODERATOR ne voit que les groupes qui portent au moins une de ses sections', async () => {
    const identite = adminIdentityFixture({ role: 'MODERATOR' });
    appQueryClient.setQueryData(ADMIN_PERMISSIONS_QUERY_KEY, identite);
    const hote = await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <AdminScreenFrame language="fr" title="Comptes" back="admin">
          <p>contenu</p>
        </AdminScreenFrame>
      </QueryClientProvider>,
    );
    const attendus = [...new Set(visibleAdminSections(identite.permissions, 'MODERATOR').map((section) => section.group))];

    expect(groupes(hote)).toEqual(attendus);
  });
});

describe('le retour et le menu restent dans l’espace courant (D-76)', () => {
  test('depuis /adm, chaque entrée du menu mène sous /adm', async () => {
    const hote = await mountAdminAt(mounter, '/adm/users', adminIdentityFixture({ role: 'ADMIN' }), '[data-admin-sidebar]');
    const liens = [...hote.querySelectorAll('[data-admin-sidebar] [data-admin-nav]')].map((lien) => lien.getAttribute('href') ?? '');

    expect(liens.length).toBeGreaterThan(0);
    expect(liens.filter((href) => !(href === '/adm' || href.startsWith('/adm/')))).toEqual([]);
    resetAdminRouter(mounter);
  });
});
