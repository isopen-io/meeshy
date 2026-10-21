import { beforeAll, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { translateLinkFamilies } from '@/lib/i18n-link-families-catalog';

import { ROUTES } from './route-table';

/**
 * LE FORMULAIRE D'UN LIEN DE PARTAGE LIT SES LIBELLÉS HORS DU CATALOGUE COMMUN
 * (#10322) — les clés `links.create.*` vivent dans le catalogue des familles de
 * liens, qui lève s'il est lu avant d'être chargé. Les deux écrans qui montent
 * le formulaire (la création, et la fiche qui monte l'édition) doivent donc le
 * charger AVEC leur chunk : ni `tsc` ni un témoin de rendu ne voient un écran
 * qui planterait à l'ouverture.
 */

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
});

test('la fiche « /links/share/$link », qui monte l’édition, charge le catalogue avec son chunk', async () => {
  await ROUTES.shareLink.screen();
  expect(translateLinkFamilies('fr', 'links.create.section.access.subtitle').length).toBeGreaterThan(0);
});
