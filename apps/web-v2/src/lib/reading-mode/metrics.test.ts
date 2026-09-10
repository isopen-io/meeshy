import { describe, expect, test } from 'bun:test';

import {
  FOCUS_CARD_HORIZONTAL_INSET,
  FOCUS_CHIP_HEIGHT,
  IDENTITY_CHIP_HEIGHT,
  IDENTITY_OVERHANG,
  FOCUS_STRIP_OVERHANG,
  ROW_PADDING_HORIZONTAL,
  ROW_PADDING_VERTICAL,
  TEXT_INDENT,
  sceneStyleVars,
} from './metrics';

/**
 * `sceneStyleVars()` — la SEULE porte par laquelle une cote de la scène du
 * fil atteint le CSS (§5.4/§4.4 de la spécification #5648).
 *
 * L'ensemble RENDU dépasse volontairement les douze clés énumérées au §4.4
 * de la spécification : `--focus-chip-fill-dark`/`-light` s'y ajoutent,
 * parce que `.focus-chip` (§5.6) doit rester réactif au basculement
 * clair/sombre par la MÊME mécanique CSS-only que `.focus-card` (`:root.light
 * …`) sans qu'un composant relise `currentScheme()` — et le §4.4, silencieux
 * sur ces deux clés, ne peut pas prescrire de les omettre : « son SILENCE
 * n'est pas une prescription » (`CLAUDE.md` § MeeshyComposer, même principe
 * ici pour la table de vues). Documenté dans le rapport de livraison.
 */
describe('sceneStyleVars', () => {
  test('rend les cotes attendues, calculées depuis les constantes dérivées', () => {
    expect(sceneStyleVars()).toEqual({
      '--focus-fill-dark': '0.16',
      '--focus-fill-light': '0.1',
      '--focus-chip-fill-dark': '0.18',
      '--focus-chip-fill-light': '0.14',
      '--focus-card-radius': '18px',
      '--focus-card-inset-x': '10px',
      '--focus-card-inset-y': '3px',
      '--scene-flatten-ms': '450ms',
      '--reveal-fade-ms': '280ms',
      '--focus-chip-h': '24px',
      '--focus-chip-minw': '32px',
      '--focus-chip-inset': '4px',
      '--focus-chip-pad-x': '7px',
      '--focus-text-indent': '41px',
      '--focus-identity-overhang': '20px',
      '--focus-strip-overhang': '15px',
    });
  });

  test('les formules restent des calculs, jamais des littéraux recopiés', () => {
    expect(FOCUS_STRIP_OVERHANG).toBe(FOCUS_CHIP_HEIGHT / 2 + ROW_PADDING_VERTICAL);
    expect(IDENTITY_OVERHANG).toBe(IDENTITY_CHIP_HEIGHT / 2 + ROW_PADDING_VERTICAL);
    const vars = sceneStyleVars() as Record<string, string>;
    expect(vars['--focus-card-inset-x']).toBe(`${ROW_PADDING_HORIZONTAL - FOCUS_CARD_HORIZONTAL_INSET}px`);
    // Le retrait qui ramène les superpositions sur le CORPS de la rangée
    // (gouttière d'avatar comprise) est la cote de la rangée elle-même, pas
    // un nombre à part — correction de revue #5648.
    expect(vars['--focus-text-indent']).toBe(`${TEXT_INDENT}px`);
  });
});
