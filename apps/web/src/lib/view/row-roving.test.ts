import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { createRowRoving, moveRowFocus, ROW_PRIMARY_ATTRIBUTE, rowKeyMove } from './row-roving';

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

describe('moveRowFocus — une rangée qui sort n’est plus au parcours (#11574)', () => {
  beforeAll(() => ensureHappyDomRegistered());
  afterAll(() => releaseHappyDomIfRegistered());

  const listOf = (ids: readonly string[], leaving: string) => {
    const list = document.createElement('ul');
    list.id = 'contenu';
    ids.forEach((id) => {
      const row = document.createElement('li');
      row.setAttribute('data-row', id);
      if (id === leaving) {
        row.setAttribute('data-row-exiting', '');
        row.setAttribute('inert', '');
        row.setAttribute('aria-hidden', 'true');
      }
      const link = document.createElement('a');
      link.href = `#${id}`;
      link.setAttribute(ROW_PRIMARY_ATTRIBUTE, '');
      row.append(link);
      list.append(row);
    });
    document.body.replaceChildren(list);
    const rowOf = (id: string) => list.querySelector<HTMLElement>(`[data-row="${id}"]`)!;
    return rowOf;
  };

  test('bas saute la rangée en train de partir et pose le focus sur la suivante', () => {
    const rowOf = listOf(['a', 'b', 'c'], 'b');
    rowOf('a').querySelector<HTMLElement>('a')!.focus();
    const taken = moveRowFocus({ row: rowOf('a'), from: document.activeElement, move: { kind: 'row', to: 'next' } });
    expect(taken).toBe(true);
    expect(document.activeElement?.closest('[data-row]')?.getAttribute('data-row')).toBe('c');
  });

  test('Fin ne vise jamais la dernière rangée si elle part', () => {
    const rowOf = listOf(['a', 'b', 'c'], 'c');
    rowOf('a').querySelector<HTMLElement>('a')!.focus();
    moveRowFocus({ row: rowOf('a'), from: document.activeElement, move: { kind: 'row', to: 'last' } });
    expect(document.activeElement?.closest('[data-row]')?.getAttribute('data-row')).toBe('b');
  });
});
