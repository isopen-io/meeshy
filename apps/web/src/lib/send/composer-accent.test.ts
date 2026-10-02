import { describe, expect, test } from 'bun:test';

import { SUBSTITUTED_ACCENT_VAR, composerChromeAccentStyle, composerIconTintOf, composerIconTintStyle } from './composer-accent';

describe('composerChromeAccentStyle — le jeton d’ÉTAT de la protection, aucune teinte inventée (#6175, #7667)', () => {
  test('rien d’armé ⇒ undefined (l’appelant garde l’accent hérité)', () => {
    expect(composerChromeAccentStyle(null)).toBeUndefined();
  });

  test('éphémère armé ⇒ --accent pointe sur --color-error (le rouge d’alerte, directive porteur #7667 ; décision #7677)', () => {
    expect(composerChromeAccentStyle('ephemeral')).toEqual({ '--accent': 'var(--color-error)' });
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

describe('composerIconTintOf — UNE loi de teinte d’icône (#9121, miroir `ComposerIconTint`)', () => {
  test('rien d’armé ⇒ la couleur COMMUNE des icônes', () => {
    expect(composerIconTintOf(null)).toBe('var(--color-ios-ink-2)');
  });

  test('une protection armée ⇒ SA couleur', () => {
    expect(composerIconTintOf('ephemeral')).toBe('var(--color-error)');
    expect(composerIconTintOf('viewOnce')).toBe('var(--ios-state-view-once)');
    expect(composerIconTintOf('blur')).toBe('var(--ios-state-concealed)');
  });

  test('un effet de message, sans couleur propre ⇒ la couleur de MARQUE', () => {
    expect(composerIconTintOf('effects')).toBe('var(--color-ios-brand)');
  });

  test('le style pose `--composer-icon` sur la racine, armée ou non', () => {
    expect(composerIconTintStyle(null)).toEqual({ '--composer-icon': 'var(--color-ios-ink-2)' });
    expect(composerIconTintStyle('ephemeral')).toEqual({ '--composer-icon': 'var(--color-error)' });
  });
});
