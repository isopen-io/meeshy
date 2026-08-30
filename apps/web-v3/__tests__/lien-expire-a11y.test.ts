import { axe } from 'jest-axe';

import { documentDuLienClos } from '@/app/(public)/l/[token]/expired/vue';
import { CAUSES_DE_CLOTURE, type CauseDeCloture } from '@/lib/api/links';

/**
 * Gate B (§ 9.5) sur l'écran `linkExpired` : « 0 violation `axe`
 * `serious`/`critical` sur toute route `(public)` », mesuré dans le harnais que
 * la conception nomme — jest + `jest-axe` — plutôt que sur un rendu approximé.
 *
 * Le document COMPLET est écrit dans le DOM — c'est celui que le gestionnaire de
 * route SERT, octet pour octet (`vue.ts` en est le site unique ; `route.ts` n'y
 * ajoute que l'enveloppe HTTP), coquille comprise : `axe` juge une page, pas un
 * fragment. Les règles qui portent sur la racine — `html-has-lang`,
 * `landmark-one-main`, `region`, `page-has-heading-one` — ne peuvent tomber que
 * là, et ce sont précisément celles qu'un écran servi SANS JavaScript doit
 * tenir : le lecteur du rôle premier n'a rien d'autre que ce document.
 *
 * Les SIX états sont passés au crible, pas seulement le nominal : chacun rend
 * une copie et une suite différentes, donc chacun est une page différente.
 */

const ecrit = (cause: CauseDeCloture): void => {
  document.open();
  document.write(documentDuLienClos({ cause, token: '8fz3-lagos' }));
  document.close();
};

const graves = async (): Promise<readonly string[]> => {
  const rapport = await axe(document.documentElement);
  return rapport.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} — ${violation.help}`);
};

describe('linkExpired face à axe', () => {
  it.each(CAUSES_DE_CLOTURE)('ne porte aucune violation grave dans l’état « %s »', async (cause) => {
    ecrit(cause);

    expect(await graves()).toEqual([]);
  });

  /**
   * Le témoin du témoin. Six lignes vertes ne prouvent rien tant qu'on n'a pas
   * vu la même mécanique ROUGIR : un `axe` mal câblé, une règle désactivée, un
   * document vide rendraient exactement le même « aucune violation ».
   */
  it('rougit sur un document dont la structure est fautive', async () => {
    document.open();
    document.write('<html><body><div onclick="void 0" tabindex="0"><img src="x"></div></body></html>');
    document.close();

    expect(await graves()).not.toEqual([]);
  });
});
