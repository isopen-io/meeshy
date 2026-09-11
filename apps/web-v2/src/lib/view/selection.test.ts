import { describe, expect, test } from 'bun:test';

import { SELECTION_CAP, copyTextOf, orderedIds, selectionReducer } from './selection';

describe('selectionReducer — mode minimal (#5814, question 5)', () => {
  test('begin(id) ⇒ [id]', () => {
    expect(selectionReducer(null, { type: 'begin', id: 'm1' })).toEqual({ ids: ['m1'] });
  });

  test('toggle ajoute puis retire', () => {
    const step1 = selectionReducer({ ids: ['m1'] }, { type: 'toggle', id: 'm2' });
    expect(step1).toEqual({ ids: ['m1', 'm2'] });
    const step2 = selectionReducer(step1, { type: 'toggle', id: 'm2' });
    expect(step2).toEqual({ ids: ['m1'] });
  });

  test('retirer le DERNIER id quitte la sélection (null)', () => {
    expect(selectionReducer({ ids: ['m1'] }, { type: 'toggle', id: 'm1' })).toBeNull();
  });

  test('end ⇒ null, quel que soit l’état', () => {
    expect(selectionReducer({ ids: ['m1', 'm2'] }, { type: 'end' })).toBeNull();
  });

  test(`101ᵉ id refusé avec reason: 'cap' (plafond ${SELECTION_CAP})`, () => {
    const full: { ids: readonly string[] } = { ids: Array.from({ length: SELECTION_CAP }, (_, i) => `m${i}`) };
    const result = selectionReducer(full, { type: 'toggle', id: 'over' });
    expect(result?.ids.length).toBe(SELECTION_CAP);
    expect(result?.reason).toBe('cap');
  });
});

describe('orderedIds — l’ordre du FIL, jamais l’ordre de sélection', () => {
  test('rend les ids sélectionnés dans l’ordre de `placed`', () => {
    const placed = [{ message: { id: 'a' } }, { message: { id: 'b' } }, { message: { id: 'c' } }];
    expect(orderedIds(placed, new Set(['c', 'a']))).toEqual(['a', 'c']);
  });
});

describe('copyTextOf — les extraits SERVIS, joints par un saut de ligne', () => {
  test('joint dans l’ordre, en ignorant les messages sans texte', () => {
    const served = (id: string): string | undefined => ({ a: 'Bonjour', b: undefined, c: 'Salut' })[id];
    expect(copyTextOf(['a', 'b', 'c'], served)).toBe('Bonjour\nSalut');
  });
});
