import { describe, expect, test } from 'bun:test';

import { enterConfirmsComposition } from './composition-enter';
import type { CompositionKeyEvent } from './composition-enter';

const keydown = (init: Partial<CompositionKeyEvent>): CompositionKeyEvent => ({ key: 'Enter', isComposing: false, keyCode: 0, ...init });

describe('enterConfirmsComposition — Entrée qui confirme une saisie à méthode de saisie (#20752)', () => {
  test('un Entrée ordinaire ne confirme rien', () => {
    expect(enterConfirmsComposition(keydown({ key: 'Enter', keyCode: 13 }))).toBe(false);
  });

  test('un Entrée pendant une composition la confirme', () => {
    expect(enterConfirmsComposition(keydown({ key: 'Enter', isComposing: true }))).toBe(true);
  });

  test('sous Safari, la composition est déjà close mais la touche porte encore le code 229', () => {
    expect(enterConfirmsComposition(keydown({ key: 'Enter', isComposing: false, keyCode: 229 }))).toBe(true);
  });

  test('une autre touche au code 229 (clavier virtuel) ne compte pas', () => {
    expect(enterConfirmsComposition(keydown({ key: 'a', keyCode: 229 }))).toBe(false);
    expect(enterConfirmsComposition(keydown({ key: 'Unidentified', isComposing: true, keyCode: 229 }))).toBe(false);
  });
});
