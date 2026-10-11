import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { mountAdminAt, resetAdminRouter } from '@/test-support/admin-router';

/**
 * **LE CALENDRIER DES SAISONS, BLOC DE « BARÈME DE POINTS »** (#10232) — aucune route neuve (budget du module
 * d'entrée) : le bloc se monte sous le panneau du barème, dans `/admin/engagement-scale` ET `/adm/engagement-scale`,
 * à qui porte `canManageGame` (BIGBOSS et ADMIN) ; une matrice sans cette permission ne le voit pas ; un MODERATOR
 * est refusé par la section elle-même. `fetch` répond 503 pour ne dépendre d'aucun réseau — les lectures, l'édition,
 * les propositions et l'export ont leurs témoins dans `admin-game-seasons.test.tsx`.
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
const BLOCK = '[data-admin-game-seasons-block]';
const SCREEN = '[data-admin-screen="engagement-scale"]';
const DENIED = '[data-admin-shell] main#contenu p.text-screen';

describe('le calendrier des saisons dans /admin|/adm/engagement-scale', () => {
  for (const space of ['admin', 'adm'] as const) {
    test(`sous /${space}, un ADMIN avec canManageGame voit le bloc sous le barème`, async () => {
      const host = await mountAdminAt(mounter, `/${space}/engagement-scale`, ADMIN, BLOCK);
      expect(host.querySelector(`${SCREEN} ${BLOCK} h2`)?.textContent).toBe(translateAdmin('fr', 'admin.gameSeasons.title'));
      expect(host.querySelectorAll('h1').length).toBe(1);
      resetAdminRouter(mounter);
    });

    test(`sous /${space}, une matrice SANS canManageGame ne montre pas le bloc`, async () => {
      const sansDroit = adminIdentityFixture({ role: 'ADMIN', permissions: { canManageGame: false } });
      const host = await mountAdminAt(mounter, `/${space}/engagement-scale`, sansDroit, SCREEN);
      expect(host.querySelector(BLOCK)).toBeNull();
      resetAdminRouter(mounter);
    });

    test(`sous /${space}, un MODERATOR est refusé par la section : ni barème ni bloc`, async () => {
      const host = await mountAdminAt(mounter, `/${space}/engagement-scale`, MODERATOR, DENIED);
      expect(host.querySelector(SCREEN)).toBeNull();
      expect(host.querySelector(BLOCK)).toBeNull();
      resetAdminRouter(mounter);
    });
  }

  test('aucune route /game-seasons : l’adresse n’existe pas', async () => {
    const { ROUTES } = await import('@/routes/route-table');
    expect(Object.values(ROUTES).filter((route) => route.pattern.includes('game-seasons'))).toEqual([]);
  });
});
