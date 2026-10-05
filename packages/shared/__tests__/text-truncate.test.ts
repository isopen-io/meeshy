/**
 * Un aperçu de contenu utilisateur se coupe par POINT DE CODE, jamais par unité
 * UTF-16 (#8754).
 *
 * Sept expressions du gateway tronquaient leurs aperçus avec
 * `String.prototype.slice`, qui compte en unités UTF-16. Une coupe tombant au
 * milieu d'une paire de substitution — emoji hors BMP, CJK étendu, drapeau
 * régional — laissait une demi-paire haute orpheline dans la chaîne livrée.
 * Mesuré : `("a".repeat(79) + "😀").slice(0, 80)` finit sur `0xD83D`, rendu `�`
 * dès le premier aller-retour UTF-8, c'est-à-dire dès l'écriture en base ou
 * dans la charge APNs. L'utilisateur voyait un glyphe cassé sur son écran
 * verrouillé.
 *
 * `sliceCodePoints` écarte EN ENTIER le caractère qui déborderait, au lieu de le
 * scinder. L'invariant qui compte en aval est donc préservé —
 * `résultat.length <= max` en unités UTF-16 — et les bornes de la charge APNs
 * comme des colonnes de base restent respectées.
 */

import { describe, it, expect } from 'vitest';
import { sliceCodePoints, sliceCodePointsOrUndefined } from '../utils/text-truncate.js';

/** Le cas mesuré sur `dev` : la limite tombe pile entre les deux moitiés de l'emoji. */
const ON_THE_SEAM = 'a'.repeat(79) + '\u{1F600}' + ' bravo';
const isLoneHighSurrogate = (s: string): boolean => {
  const last = s.charCodeAt(s.length - 1);
  return last >= 0xd800 && last <= 0xdbff;
};

describe('sliceCodePoints — la coupe ne scinde jamais une paire de substitution', () => {
  it('écarte l’emoji qui déborde au lieu de le couper en deux', () => {
    const cut = sliceCodePoints(ON_THE_SEAM, 80);
    expect(isLoneHighSurrogate(cut)).toBe(false);
    expect(cut).toBe('a'.repeat(79));
  });

  it('ce que faisait `slice` — la preuve du défaut, gardée sous les yeux', () => {
    expect(isLoneHighSurrogate(ON_THE_SEAM.slice(0, 80))).toBe(true);
  });

  it('garde l’emoji quand il tient tout entier', () => {
    expect(sliceCodePoints('ok \u{1F600}', 5)).toBe('ok \u{1F600}');
  });

  it('ne coupe pas un drapeau régional entre ses deux paires', () => {
    // 🇫🇷 = U+1F1EB U+1F1F7, soit quatre unités UTF-16.
    const flag = '\u{1F1EB}\u{1F1F7}';
    expect(sliceCodePoints(flag, 3)).toBe('\u{1F1EB}');
    expect(sliceCodePoints(flag, 4)).toBe(flag);
  });

  it('laisse l’ASCII intact — le comportement de `slice` est conservé', () => {
    expect(sliceCodePoints('bonjour', 4)).toBe('bonj');
    expect(sliceCodePoints('bonjour', 7)).toBe('bonjour');
    expect(sliceCodePoints('bonjour', 99)).toBe('bonjour');
  });

  it('rend la chaîne vide pour une limite nulle ou négative', () => {
    expect(sliceCodePoints('bonjour', 0)).toBe('');
    expect(sliceCodePoints('bonjour', -3)).toBe('');
    expect(sliceCodePoints('', 10)).toBe('');
  });

  it('respecte `résultat.length <= max` sur toute la plage utile', () => {
    const mixed = 'Merci \u{1F600} beaucoup \u{1F1EB}\u{1F1F7} \u{20BB7} fin';
    for (let max = 0; max <= mixed.length + 5; max += 1) {
      const cut = sliceCodePoints(mixed, max);
      expect(cut.length).toBeLessThanOrEqual(max);
      expect(isLoneHighSurrogate(cut)).toBe(false);
    }
  });

  it('ne perd rien quand la limite dépasse la chaîne', () => {
    const astral = '\u{1F600}\u{1F601}\u{1F602}';
    expect(sliceCodePoints(astral, 1000)).toBe(astral);
  });
});

describe('sliceCodePointsOrUndefined — une absence reste une absence', () => {
  it('rend `undefined` pour `null` et `undefined`, jamais la chaîne vide', () => {
    expect(sliceCodePointsOrUndefined(null, 80)).toBeUndefined();
    expect(sliceCodePointsOrUndefined(undefined, 80)).toBeUndefined();
  });

  it('distingue la chaîne vide de l’absence — c’était le contrat de `?.slice`', () => {
    expect(sliceCodePointsOrUndefined('', 80)).toBe('');
  });

  it('coupe comme `sliceCodePoints` quand il y a du texte', () => {
    expect(sliceCodePointsOrUndefined(ON_THE_SEAM, 80)).toBe('a'.repeat(79));
    expect(sliceCodePointsOrUndefined('bonjour', 4)).toBe('bonj');
  });
});
