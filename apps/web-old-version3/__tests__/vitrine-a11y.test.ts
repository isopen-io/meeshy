import { axe } from 'jest-axe';

import { documentDeLaVitrine } from '@/app/vitrine/vue';

/**
 * Gate B (§ 9.5) sur la VITRINE : « 0 violation `axe` `serious`/`critical` ».
 *
 * POURQUOI ICI, ET PAS DANS `e2e/visual/v3-a11y.spec.ts`. Ce balayage-là lit le
 * manifeste de build et ne visite que les PAGES d'App Router émises dans le
 * groupe `(public)` ; la vitrine est un GESTIONNAIRE DE ROUTE (`app/route.ts`),
 * précisément pour n'émettre qu'une requête avant le premier pixel (§ 12.6).
 * Elle n'apparaît donc dans aucun manifeste, et un gate qui ne la voit pas ne
 * la garde pas. Le harnais que la conception nomme pour ce cas — jest +
 * `jest-axe` sur le document COMPLET, coquille comprise — est le même que celui
 * de `linkExpired`.
 *
 * Le document est écrit tel que le gestionnaire le SERT, octet pour octet :
 * `html-has-lang`, `landmark-one-main`, `region` et `page-has-heading-one` ne
 * peuvent tomber que sur une page entière, et ce sont celles qu'un écran servi
 * SANS JavaScript doit tenir — un visiteur en zone rurale n'a que ce document.
 */

const graves = async (): Promise<readonly string[]> => {
  const rapport = await axe(document.documentElement);
  return rapport.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} — ${violation.help}`);
};

describe('la vitrine face à axe', () => {
  it('ne porte aucune violation grave', async () => {
    document.open();
    document.write(documentDeLaVitrine());
    document.close();

    expect(await graves()).toEqual([]);
  });

  /**
   * Le témoin du témoin. Une ligne verte ne prouve rien tant qu'on n'a pas vu la
   * même mécanique ROUGIR : un `axe` mal câblé rendrait exactement la même
   * phrase.
   */
  it('rougit sur un document dont la structure est fautive', async () => {
    document.open();
    document.write('<html><body><div tabindex="0"><img src="x"></div></body></html>');
    document.close();

    expect(await graves()).not.toEqual([]);
  });
});
