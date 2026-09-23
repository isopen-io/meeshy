import { describe, expect, test } from 'bun:test';

import { SUBSTITUTED_ACCENT_VAR, composerChromeAccentStyle } from './composer-accent';

describe('composerChromeAccentStyle — le jeton d’ÉTAT de la protection, aucune teinte inventée (#6175, #7667)', () => {
  test('rien d’armé ⇒ undefined (l’appelant garde l’accent hérité)', () => {
    expect(composerChromeAccentStyle(null)).toBeUndefined();
  });

  test('éphémère armé ⇒ --accent pointe sur --ios-state-ephemeral (la flamme du fil)', () => {
    expect(composerChromeAccentStyle('ephemeral')).toEqual({ '--accent': 'var(--ios-state-ephemeral)' });
  });

  test('vue unique ⇒ --accent pointe sur --ios-state-view-once (le « 1 » cerclé du fil)', () => {
    expect(composerChromeAccentStyle('viewOnce')).toEqual({ '--accent': 'var(--ios-state-view-once)' });
  });

  test('flou ⇒ --accent pointe sur --ios-state-concealed (le flou du fil)', () => {
    expect(composerChromeAccentStyle('blur')).toEqual({ '--accent': 'var(--ios-state-concealed)' });
  });

  test('effets ⇒ --accent pointe sur --color-ios-brand (indigo500, brandPrimaryHex)', () => {
    expect(composerChromeAccentStyle('effects')).toEqual({ '--accent': 'var(--color-ios-brand)' });
  });

  test('la table couvre les quatre états non nuls, un jeton DISTINCT par état', () => {
    expect(Object.keys(SUBSTITUTED_ACCENT_VAR).sort()).toEqual(['blur', 'effects', 'ephemeral', 'viewOnce']);
    expect(new Set(Object.values(SUBSTITUTED_ACCENT_VAR)).size).toBe(4);
  });
});
