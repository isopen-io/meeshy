import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { mountAdminAt, resetAdminRouter } from '@/test-support/admin-router';

/**
 * **JEU — SAISONS, PAR LE ROUTEUR, DANS LES DEUX ESPACES** (#10232) — la route existe sous `/admin` ET `/adm` (D-76), le
 * menu l'offre dans l'espace où l'on est et la surligne, le hub l'offre, et la permission `canManageGame` (BIGBOSS et
 * ADMIN) la garde : un MODERATOR qui tape l'adresse lit le refus unique du kit, pas un 403, et son retour reste dans son
 * espace. Une matrice sans `canManageGame` ne montre pas la tuile, même à un ADMIN.
 *
 * Le panneau lit la passerelle : `fetch` répond 503 d'emblée, pour que ce témoin ne dépende d'aucun réseau — les
 * lectures, l'édition, les propositions et l'export ont leurs témoins dans `admin-game-seasons.test.tsx`.
 */
const { mounter } = setupAdminKitTests();

const realFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ success: false, error: 'indisponible' }), { status: 503 })) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

const ADMIN = adminIdentityFixture({ role: 'ADMIN' });
const MODERATOR = adminIdentityFixture({ role: 'MODERATOR' });
const ECRAN = '[data-gameseasons-load-failed], [data-admin-game-seasons]';
const DENIED = '[data-admin-shell] main#contenu p.text-screen';

const nav = (host: Element, href: string) => host.querySelector(`[data-admin-sidebar] [data-admin-nav][href="${href}"]`);

describe('Jeu — saisons — /admin/game-seasons et /adm/game-seasons', () => {
  for (const space of ['admin', 'adm'] as const) {
    test(`sous /${space}, l’écran s’ouvre pour un ADMIN, sous son titre, et le menu le surligne dans l’espace courant`, async () => {
      const host = await mountAdminAt(mounter, `/${space}/game-seasons`, ADMIN, ECRAN);

      expect(host.querySelector('h1')?.textContent).toBe('Jeu — saisons');
      expect(nav(host, `/${space}/game-seasons`)?.getAttribute('aria-current')).toBe('page');
      resetAdminRouter(mounter);
    });

    test(`sous /${space}, un MODERATOR lit le refus unique du kit, et son retour reste sous /${space}`, async () => {
      const host = await mountAdminAt(mounter, `/${space}/game-seasons`, MODERATOR, DENIED);

      expect(host.querySelector(DENIED)?.textContent).toBe(translateAdmin('fr', 'admin.denied.title'));
      expect(host.querySelector('[data-admin-game-seasons]')).toBeNull();
      expect(host.querySelector('[data-gameseasons-load-failed]')).toBeNull();
      expect(nav(host, `/${space}/game-seasons`)).toBeNull();
      expect(host.querySelector('[data-admin-back]')?.getAttribute('href')).toBe(`/${space}`);
      resetAdminRouter(mounter);
    });

    test(`sous /${space}, l’en-tête de page du kit porte le fil « Plateforme › Jeu — saisons »`, async () => {
      const host = await mountAdminAt(mounter, `/${space}/game-seasons`, ADMIN, ECRAN);

      expect(host.querySelector('[data-admin-page-header] h1')?.textContent).toBe('Jeu — saisons');
      expect([...host.querySelectorAll('[data-admin-page-header] nav li')].map((item) => item.textContent)).toEqual(['Plateforme', 'Jeu — saisons']);
      expect(host.querySelectorAll('h1').length).toBe(1);
      resetAdminRouter(mounter);
    });
  }

  test('le hub offre la tuile au rang ADMIN, dans l’espace où l’on se trouve', async () => {
    const host = await mountAdminAt(mounter, '/adm', ADMIN, '[data-admin-section]');
    const tile = host.querySelector('[data-admin-section="gameSeasons"]');

    expect(tile?.getAttribute('href') ?? tile?.querySelector('a')?.getAttribute('href')).toBe('/adm/game-seasons');
    resetAdminRouter(mounter);
  });

  test('…et la tuile est rangée sous « Plateforme »', async () => {
    const host = await mountAdminAt(mounter, '/admin', ADMIN, '[data-admin-section]');
    const tile = host.querySelector('[data-admin-section="gameSeasons"]');
    const groupe = tile?.closest('[data-admin-group]');

    expect(groupe?.getAttribute('data-admin-group')).toBe('platform');
    resetAdminRouter(mounter);
  });

  test('sans `canManageGame`, même un ADMIN ne voit pas la tuile et lit le refus unique', async () => {
    const sansDroit = adminIdentityFixture({ role: 'ADMIN', permissions: { canManageGame: false } });
    const hub = await mountAdminAt(mounter, '/adm', sansDroit, '[data-admin-section]');
    expect(hub.querySelector('[data-admin-section="gameSeasons"]')).toBeNull();
    resetAdminRouter(mounter);

    const host = await mountAdminAt(mounter, '/adm/game-seasons', sansDroit, DENIED);
    expect(host.querySelector(DENIED)?.textContent).toBe(translateAdmin('fr', 'admin.denied.title'));
    expect(host.querySelector('[data-admin-game-seasons]')).toBeNull();
    resetAdminRouter(mounter);
  });
});
