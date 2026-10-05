import { describe, expect, test } from 'bun:test';

import { chromeMayCollapse, dismissesKeyboard } from './keyboard-first';

describe('keyboardFirst — le clavier part AVANT le reste du chrome (#8000)', () => {
  test('clavier ouvert + défilement vers les messages ANCIENS ⇒ le clavier se ferme', () => {
    expect(dismissesKeyboard({ keyboardOpen: true, towardOlder: true })).toBe(true);
  });

  test('clavier ouvert + défilement vers les RÉCENTS ⇒ le clavier reste', () => {
    expect(dismissesKeyboard({ keyboardOpen: true, towardOlder: false })).toBe(false);
  });

  test('clavier fermé ⇒ rien à fermer', () => {
    expect(dismissesKeyboard({ keyboardOpen: false, towardOlder: true })).toBe(false);
  });

  test('un geste COMMENCÉ clavier ouvert ne replie rien d autre, même une fois le clavier parti', () => {
    expect(chromeMayCollapse({ keyboardOpenAtGestureStart: true, keyboardOpen: true })).toBe(false);
    expect(chromeMayCollapse({ keyboardOpenAtGestureStart: true, keyboardOpen: false })).toBe(false);
  });

  test('un clavier ouvert EN COURS de geste retient aussi le repli', () => {
    expect(chromeMayCollapse({ keyboardOpenAtGestureStart: false, keyboardOpen: true })).toBe(false);
  });

  test('clavier fermé du début à la fin ⇒ le chrome peut se replier', () => {
    expect(chromeMayCollapse({ keyboardOpenAtGestureStart: false, keyboardOpen: false })).toBe(true);
  });
});
