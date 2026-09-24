import { describe, expect, test } from 'bun:test';

import { SERVED_TEXT_STYLES, sceneTextAppearance } from '@/lib/canvas/text-appearance';
import fr from '@/lib/interface-catalogs/catalog-fr';

import { STUDIO_STYLE_KEYS } from './story-compose-editor';

/**
 * **UNE FAMILLE À MOITIÉ SERVIE EST PIRE QUE SON ABSENCE** (#6951) — si le
 * studio la PROPOSE et que le lecteur ne la PEINT pas, l'auteur publie une
 * apparence qui ne lui reviendra jamais ; si le lecteur la peint et que le
 * studio ne la propose pas, personne sur le web ne peut l'écrire. Les deux
 * listes sont donc la MÊME, et ce témoin est le seul endroit qui le dit à
 * l'exécution — `satisfies` ne couvre que la compilation, et les deux gates
 * du dépôt couvrent des ensembles disjoints.
 */
describe('le rail d’édition propose exactement ce que le moteur peint', () => {
  test('une clé de libellé par famille servie, pas une de plus', () => {
    expect(Object.keys(STUDIO_STYLE_KEYS).sort()).toEqual([...SERVED_TEXT_STYLES].sort());
  });

  /** Dix-huit pastilles côte à côte : deux libellés identiques rendraient une
   * famille INCHOISISSABLE. Le type prouve que la clé existe — pas que le mot
   * qu'elle rend diffère du voisin, et c'est le seul risque d'un lot qui
   * ajoute treize libellés d'un coup. */
  test('dix-huit libellés distincts, sinon deux pastilles se confondent', () => {
    const libelles = SERVED_TEXT_STYLES.map((style) => fr[STUDIO_STYLE_KEYS[style]]);
    expect(new Set(libelles).size).toBe(libelles.length);
  });

  /** La pastille se PEINT dans sa propre famille : le nom d'une police ne dit
   * rien tant qu'on ne la voit pas. Treize des dix-huit exigent un fichier. */
  test('treize pastilles portent une famille que le système n’a pas', () => {
    const avecFichier = SERVED_TEXT_STYLES.filter((style) =>
      (sceneTextAppearance({ textStyle: style }).fontFamily ?? '').includes('var(--font-native)'),
    );
    expect(avecFichier.length).toBe(13);
  });
});
