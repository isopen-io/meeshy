import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { mountAdminAt, resetAdminRouter } from '@/test-support/admin-router';

/**
 * **LE BARÈME DE POINTS, PAR LE ROUTEUR, DANS LES DEUX ESPACES** (#8906,
 * #8876) — écrit sur dev pour un menu à plat, il vit désormais dans la section
 * « Plateforme » du menu groupé. Ce témoin garde le CÂBLAGE de la fusion : la
 * route existe sous `/admin` ET `/adm` (D-76), le menu l'offre dans l'espace
 * où l'on est et la surligne, le hub l'offre, et le rang d'administration la
 * garde — un MODERATOR qui tape l'adresse lit « réservé aux administrateurs »,
 * pas un 403, et son retour reste dans son espace.
 *
 * Le panneau lit la passerelle : `fetch` répond 503 d'emblée, pour que ce
 * témoin ne dépende d'aucun réseau — les lectures et l'édition ont leurs
 * témoins dans `admin-engagement-scale.test.tsx`.
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
const ECRAN = '[data-scale-load-failed], [data-admin-engagement-scale]';
const DENIED = '[data-admin-shell] main#contenu p.text-screen';

const nav = (host: Element, href: string) => host.querySelector(`[data-admin-sidebar] [data-admin-nav][href="${href}"]`);

describe('Barème de points — /admin/engagement-scale et /adm/engagement-scale', () => {
  for (const space of ['admin', 'adm'] as const) {
    test(`sous /${space}, l’écran s’ouvre pour un ADMIN, sous son titre, et le menu le surligne dans l’espace courant`, async () => {
      const host = await mountAdminAt(mounter, `/${space}/engagement-scale`, ADMIN, ECRAN);

      expect(host.querySelector('h1')?.textContent).toBe('Barème de points');
      expect(nav(host, `/${space}/engagement-scale`)?.getAttribute('aria-current')).toBe('page');
      resetAdminRouter(mounter);
    });

    test(`sous /${space}, un MODERATOR lit le refus unique du kit, et son retour reste sous /${space}`, async () => {
      const host = await mountAdminAt(mounter, `/${space}/engagement-scale`, MODERATOR, DENIED);

      expect(host.querySelector(DENIED)?.textContent).toBe(translateAdmin('fr', 'admin.denied.title'));
      expect(host.querySelector('[data-admin-engagement-scale]')).toBeNull();
      expect(nav(host, `/${space}/engagement-scale`)).toBeNull();
      expect(host.querySelector('[data-admin-back]')?.getAttribute('href')).toBe(`/${space}`);
      resetAdminRouter(mounter);
    });

    test(`sous /${space}, l’en-tête de page du kit porte le fil « Plateforme › Barème de points »`, async () => {
      const host = await mountAdminAt(mounter, `/${space}/engagement-scale`, ADMIN, ECRAN);

      expect(host.querySelector('[data-admin-page-header] h1')?.textContent).toBe('Barème de points');
      expect([...host.querySelectorAll('[data-admin-page-header] nav li')].map((item) => item.textContent)).toEqual(['Plateforme', 'Barème de points']);
      expect(host.querySelectorAll('h1').length).toBe(1);
      resetAdminRouter(mounter);
    });
  }

  test('le hub offre la tuile au rang ADMIN, dans l’espace où l’on se trouve', async () => {
    const host = await mountAdminAt(mounter, '/adm', ADMIN, '[data-admin-section]');
    const tile = host.querySelector('[data-admin-section="engagementScale"]');

    expect(tile?.getAttribute('href') ?? tile?.querySelector('a')?.getAttribute('href')).toBe('/adm/engagement-scale');
    resetAdminRouter(mounter);
  });

  test('…et la tuile est rangée sous « Plateforme »', async () => {
    const host = await mountAdminAt(mounter, '/admin', ADMIN, '[data-admin-section]');
    const tile = host.querySelector('[data-admin-section="engagementScale"]');
    const groupe = tile?.closest('[data-admin-group]');

    expect(groupe?.getAttribute('data-admin-group')).toBe('platform');
    resetAdminRouter(mounter);
  });
});
