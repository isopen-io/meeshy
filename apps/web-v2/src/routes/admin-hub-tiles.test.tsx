import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ADMIN_PERMISSIONS_QUERY_KEY } from '@/lib/api/admin';
import type { AdminPermissions } from '@/lib/admin/sections';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
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
