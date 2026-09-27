import { describe, expect, test } from 'bun:test';

import { SELF_SPEAKER_COLOR, SPEAKER_PALETTE, speakerColor } from './call-speaker-color';

/**
 * UNE COULEUR PAR PERSONNE (#8393) — le nom d'un locuteur dans les
 * sous-titres et le liseré de sa vignette dans la grille portent la MÊME
 * couleur, dérivée de son identifiant : stable d'un rendu à l'autre, d'un
 * appareil à l'autre, sans rien stocker.
 */

describe('speakerColor', () => {
  test('stable : le même identifiant rend toujours la même couleur', () => {
    expect(speakerColor('65f0c0ffee00000000000001')).toBe(speakerColor('65f0c0ffee00000000000001'));
  });

  test('toujours une couleur de la palette', () => {
    const ids = Array.from({ length: 50 }, (_, index) => `user-${index}`);
    expect(ids.every((id) => SPEAKER_PALETTE.includes(speakerColor(id)))).toBe(true);
  });

  test('des personnes différentes se distinguent : six locuteurs couvrent au moins quatre couleurs', () => {
    const colors = new Set(['awa', 'bintou', 'kofi', 'nadia', 'amina', 'kwame'].map(speakerColor));
    expect(colors.size).toBeGreaterThanOrEqual(4);
  });

  test('ma couleur est à part, hors palette des autres', () => {
    expect(SPEAKER_PALETTE.includes(SELF_SPEAKER_COLOR)).toBe(false);
  });

  test('un identifiant vide rend une couleur, jamais une erreur', () => {
    expect(SPEAKER_PALETTE.includes(speakerColor(''))).toBe(true);
  });
});
