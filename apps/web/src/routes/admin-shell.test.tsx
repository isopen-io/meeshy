import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { ADMIN_PERMISSIONS_QUERY_KEY } from '@/lib/api/admin';
import type { AdminPermissions } from '@/lib/admin/sections';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
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
  ensureHappyDomRegistered();
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

    expect(entrees(menu ?? hote)).toEqual(['dashboard', 'users', 'anonymous', 'conversations']);
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
    const profondeur = window.history.length;

    act(() => hote.querySelector<HTMLButtonElement>('[data-admin-menu-open]')?.click());
    expect(window.history.length).toBe(profondeur + 1);

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(hote.querySelector('[data-admin-drawer]')).toBeNull();
  });
});
