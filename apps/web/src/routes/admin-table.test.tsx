import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminPager } from './admin-table';

/**
 * **LE PIED DE PAGE DES LISTES D'ADMINISTRATION** (#7845) — ses cibles font
 * 44 px, le plancher tactile que le reste de la fiche tient déjà : une liste
 * de l'administration se parcourt aussi sur un téléphone.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadAdminInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

describe('le pied de page d’une liste', () => {
  test('précédent, suivant et la taille de page offrent une cible de 44 px', async () => {
    const host = await mounter.mount(
      <AdminPager language="fr" offset={20} limit={20} count={20} total={60} hasMore pageSizes={[20, 50]} onPage={() => undefined} />,
    );
    const cibles = ['[data-admin-list-prev]', '[data-admin-list-next]', '[data-admin-page-size]'].map(
      (selecteur) => (host.querySelector(selecteur) as HTMLElement | null)?.style.minHeight,
    );
    expect(cibles).toEqual(['44px', '44px', '44px']);
  });
});
