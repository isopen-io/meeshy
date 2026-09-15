import { describe, expect, test } from 'bun:test';

import { SUBSTITUTED_ACCENT_VAR, composerChromeAccentStyle } from './composer-accent';

describe('composerChromeAccentStyle — trois jetons déjà dérivés, aucune teinte inventée (#6175)', () => {
  test('rien d’armé ⇒ undefined (l’appelant garde l’accent hérité)', () => {
    expect(composerChromeAccentStyle(null)).toBeUndefined();
  });

  test('éphémère armé ⇒ --accent pointe sur --color-error', () => {
    expect(composerChromeAccentStyle('ephemeral')).toEqual({ '--accent': 'var(--color-error)' });
  });

  test('flou ⇒ --accent pointe sur --color-i600 (indigo600, trackingAccentHex)', () => {
    expect(composerChromeAccentStyle('blur')).toEqual({ '--accent': 'var(--color-i600)' });
  });

  test('effets ⇒ --accent pointe sur --color-ios-brand (indigo500, brandPrimaryHex)', () => {
    expect(composerChromeAccentStyle('effects')).toEqual({ '--accent': 'var(--color-ios-brand)' });
  });

  test('la table couvre les trois états non nuls, un jeton par état', () => {
    expect(Object.keys(SUBSTITUTED_ACCENT_VAR).sort()).toEqual(['blur', 'effects', 'ephemeral']);
  });
});
