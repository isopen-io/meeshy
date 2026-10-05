import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { mountAdminAt, resetAdminRouter } from '@/test-support/admin-router';

/**
 * **LES DEUX ÉCRANS, PAR LE ROUTEUR, DANS LES DEUX ESPACES** (#8876, #6728) —
 * Statistiques et Langues et traductions sont joignables sous `/admin` ET `/adm`
 * (D-76), gardés par `canViewAnalytics`, offerts par le menu et le hub dès que
 * leur drapeau de disponibilité est levé.
 *
 * Le panneau lit la passerelle : `fetch` répond 503 d'emblée, pour que ce témoin
 * ne dépende d'aucun réseau — il mesure le CÂBLAGE (route, garde, menu, hub), les
 * lectures ont leurs témoins ailleurs.
 */
const { mounter } = setupAdminKitTests();

const realFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ success: false, error: 'indisponible' }), { status: 503 })) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });

const nav = (host: Element, href: string) => host.querySelector(`[data-admin-sidebar] [data-admin-nav][href="${href}"]`);

describe('Statistiques — /admin/analytics et /adm/analytics', () => {
  for (const space of ['admin', 'adm'] as const) {
    test(`sous /${space}, l’écran s’ouvre pour le créateur, avec son titre et ses trois onglets`, async () => {
      const host = await mountAdminAt(mounter, `/${space}/analytics`, BIGBOSS, '[data-admin-analytics]');

      expect(host.querySelector('h1')?.textContent).toBe('Statistiques');
      expect([...host.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual(['Activité', 'Messages', 'Appels']);
      resetAdminRouter(mounter);
    });

    test(`sous /${space}, le menu offre Statistiques ET Langues dans l’espace courant, avec l’entrée active surlignée`, async () => {
      const host = await mountAdminAt(mounter, `/${space}/analytics`, BIGBOSS, '[data-admin-analytics]');

      expect(nav(host, `/${space}/analytics`)?.getAttribute('aria-current')).toBe('page');
      expect(nav(host, `/${space}/languages`)).not.toBeNull();
      resetAdminRouter(mounter);
    });
  }

  test('un lecteur AUDIT (canViewAnalytics) y entre ; un MODERATOR (sans canViewAnalytics) reçoit le refus unique', async () => {
    const audit = await mountAdminAt(mounter, '/admin/analytics', adminIdentityFixture({ role: 'AUDIT' }), '[data-admin-analytics]');
    expect(audit.querySelector('[data-admin-analytics]')).not.toBeNull();
    resetAdminRouter(mounter);

    const moderator = await mountAdminAt(mounter, '/admin/analytics', adminIdentityFixture({ role: 'MODERATOR' }), '[data-route-pending], h1, p');
    expect(moderator.querySelector('[data-admin-analytics]')).toBeNull();
    expect(moderator.textContent).toContain('Espace réservé');
    resetAdminRouter(mounter);
  });

  test('un ANALYST — sans canAccessAdmin — n’entre pas : la section dépend de la permission, jamais du rôle', async () => {
    const host = await mountAdminAt(mounter, '/admin/analytics', adminIdentityFixture({ role: 'ANALYST' }), '[data-route-pending], h1, p');
    expect(host.querySelector('[data-admin-analytics]')).toBeNull();
    expect(host.textContent).toContain('Espace réservé');
    resetAdminRouter(mounter);
  });

  test('le hub offre la tuile Statistiques, dans l’espace où l’on se trouve', async () => {
    const host = await mountAdminAt(mounter, '/adm', BIGBOSS, '[data-admin-section]');
    const tile = host.querySelector('[data-admin-section="analytics"]');

    expect(tile).not.toBeNull();
    expect(tile?.getAttribute('href') ?? tile?.querySelector('a')?.getAttribute('href')).toBe('/adm/analytics');
    resetAdminRouter(mounter);
  });
});

describe('Langues et traductions — /admin/languages et /adm/languages', () => {
  for (const space of ['admin', 'adm'] as const) {
    test(`sous /${space}, l’écran s’ouvre, sous son titre`, async () => {
      const host = await mountAdminAt(mounter, `/${space}/languages`, BIGBOSS, '[data-admin-languages]');

      expect(host.querySelector('h1')?.textContent).toBe('Langues et traductions');
      expect(nav(host, `/${space}/languages`)?.getAttribute('aria-current')).toBe('page');
      resetAdminRouter(mounter);
    });
  }

  test('un MODERATOR reçoit le refus unique', async () => {
    const host = await mountAdminAt(mounter, '/adm/languages', adminIdentityFixture({ role: 'MODERATOR' }), '[data-route-pending], h1, p');
    expect(host.querySelector('[data-admin-languages]')).toBeNull();
    expect(host.textContent).toContain('Espace réservé');
    resetAdminRouter(mounter);
  });

  test('le hub offre la tuile Langues et traductions', async () => {
    const host = await mountAdminAt(mounter, '/admin', BIGBOSS, '[data-admin-section]');
    expect(host.querySelector('[data-admin-section="languages"]')).not.toBeNull();
    resetAdminRouter(mounter);
  });
});
