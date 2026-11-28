import { describe, expect, test } from 'bun:test';

import { enterKeyIntent } from './ime-enter';

const key = (over: Partial<{ key: string; shiftKey: boolean; isComposing: boolean; keyCode: number }> = {}) => ({
  key: 'Enter',
  shiftKey: false,
  isComposing: false,
  keyCode: 13,
  ...over,
});

describe('Entrée et méthode de saisie (#20752)', () => {
  test('un Entrée ordinaire soumet', () => {
    expect(enterKeyIntent(key(), { multiline: true })).toBe('submit');
    expect(enterKeyIntent(key(), { multiline: false })).toBe('submit');
  });

  test('un Entrée pendant une composition confirme le candidat, il ne soumet pas', () => {
    expect(enterKeyIntent(key({ isComposing: true, keyCode: 229 }), { multiline: true })).toBe('composing');
  });

  test('Safari : la composition est déjà close mais la touche porte encore 229', () => {
    expect(enterKeyIntent(key({ isComposing: false, keyCode: 229 }), { multiline: true })).toBe('composing');
    expect(enterKeyIntent(key({ isComposing: false, keyCode: 229 }), { multiline: false })).toBe('composing');
  });

  test('Maj+Entrée insère une ligne dans un champ multiligne et soumet un champ à une ligne', () => {
    expect(enterKeyIntent(key({ shiftKey: true }), { multiline: true })).toBe('none');
    expect(enterKeyIntent(key({ shiftKey: true }), { multiline: false })).toBe('submit');
  });

  test('une autre touche ne concerne pas la règle, même sous 229', () => {
    expect(enterKeyIntent(key({ key: 'a', keyCode: 229, isComposing: true }), { multiline: true })).toBe('none');
  });
});
