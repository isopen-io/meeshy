import { describe, expect, test } from 'bun:test';

import { contraste, resout } from './couleur.mjs';

/**
 * LES ENCRES TRANSLUCIDES DU SDK (#8879). Les rôles d'iOS (`textMuted`,
 * `--ios-edge`, `--ios-scrim`) sont des `color-mix(…, transparent)` : une
 * encre à 80 % d'indigo700 ne se mesure pas seule, elle se mesure COMPOSÉE sur
 * le fond où elle se pose. Sans cette résolution, pointer un rôle de la table
 * vers le SDK rendait « non résolu » — une infraction permanente pour une
 * encre lisible.
 */
describe('resout — une couleur mélangée à `transparent`', () => {
  test('rend un hexadécimal à huit chiffres qui porte son alpha', () => {
    const table = { '--encre': 'color-mix(in srgb, #4338ca 80%, transparent)' };
    expect(resout(table, '--encre')).toBe('#4338cacc');
  });

  test('`white` et `black` se lisent comme leurs hexadécimaux', () => {
    const table = { '--filet': 'color-mix(in srgb, white 6%, transparent)', '--voile': 'color-mix(in srgb, black 50%, transparent)' };
    expect(resout(table, '--filet')).toBe('#ffffff0f');
    expect(resout(table, '--voile')).toBe('#00000080');
  });

  test('un alias vers une encre translucide garde son alpha', () => {
    const table = { '--muet': 'var(--ios-ink-2)', '--ios-ink-2': 'color-mix(in srgb, #4338ca 80%, transparent)' };
    expect(resout(table, '--muet')).toBe('#4338cacc');
  });
});

describe('contraste — une encre translucide se compose sur son fond', () => {
  test('indigo700 à 80 % sur #f8f7ff tient le rapport mesuré par iOS (4,76:1)', () => {
    expect(Math.round(contraste('#4338cacc', '#f8f7ff') * 100) / 100).toBeCloseTo(4.76, 1);
  });

  test("l'ordre des arguments ne change rien : le translucide est toujours l'encre", () => {
    expect(contraste('#f8f7ff', '#4338cacc')).toBe(contraste('#4338cacc', '#f8f7ff'));
  });

  test('deux translucides ne se mesurent pas : le rapport est nul, donc sous tout seuil', () => {
    expect(contraste('#ffffff80', '#00000080')).toBe(0);
  });
});
