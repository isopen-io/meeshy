import { describe, expect, test } from 'bun:test';

import { createRowRoving, rowKeyMove } from './row-roving';

/**
 * LA LISTE SE PARCOURT AU CLAVIER, UN ARRÊT DE TABULATION (#11227) — la loi
 * PURE du parcours : quelle touche fait quoi, et qui tient l'arrêt.
 */
describe('rowKeyMove — les touches du parcours', () => {
  test('haut et bas changent de rangée, Début et Fin vont aux bouts', () => {
    expect(rowKeyMove({ key: 'ArrowDown', rtl: false })).toEqual({ kind: 'row', to: 'next' });
    expect(rowKeyMove({ key: 'ArrowUp', rtl: false })).toEqual({ kind: 'row', to: 'previous' });
    expect(rowKeyMove({ key: 'Home', rtl: false })).toEqual({ kind: 'row', to: 'first' });
    expect(rowKeyMove({ key: 'End', rtl: false })).toEqual({ kind: 'row', to: 'last' });
  });

  test('droite et gauche passent d’un contrôle de la rangée à l’autre, dans le sens de l’écriture', () => {
    expect(rowKeyMove({ key: 'ArrowRight', rtl: false })).toEqual({ kind: 'control', step: 1 });
    expect(rowKeyMove({ key: 'ArrowLeft', rtl: false })).toEqual({ kind: 'control', step: -1 });
    expect(rowKeyMove({ key: 'ArrowRight', rtl: true })).toEqual({ kind: 'control', step: -1 });
    expect(rowKeyMove({ key: 'ArrowLeft', rtl: true })).toEqual({ kind: 'control', step: 1 });
  });

  test('toute autre touche n’appartient pas au parcours — Entrée, Tab et les lettres passent', () => {
    expect(rowKeyMove({ key: 'Enter', rtl: false })).toBeNull();
    expect(rowKeyMove({ key: 'Tab', rtl: false })).toBeNull();
    expect(rowKeyMove({ key: 'a', rtl: false })).toBeNull();
  });
});

describe('createRowRoving — qui tient l’arrêt de tabulation', () => {
  test('tant qu’aucune rangée n’a eu le focus, chaque rangée est un point d’entrée', () => {
    const roving = createRowRoving();
    expect(roving.holds('a')).toBe(true);
    expect(roving.holds('b')).toBe(true);
  });

  test('la rangée qui reçoit le focus tient seule l’arrêt, et prévient les abonnés', () => {
    const roving = createRowRoving();
    const heard: number[] = [];
    roving.subscribe(() => heard.push(1));
    roving.focus('b');
    expect(roving.holds('a')).toBe(false);
    expect(roving.holds('b')).toBe(true);
    expect(heard).toHaveLength(1);
    roving.focus('b');
    expect(heard).toHaveLength(1);
  });

  test('la rangée qui tenait l’arrêt disparaît : l’arrêt se rend, la liste reste atteignable', () => {
    const roving = createRowRoving();
    roving.focus('b');
    roving.release('a');
    expect(roving.holds('a')).toBe(false);
    roving.release('b');
    expect(roving.holds('a')).toBe(true);
  });
});
