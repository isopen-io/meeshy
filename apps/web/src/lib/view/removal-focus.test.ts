import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { focusTargetAfterRemoval, focusTargetAfterRemovals } from './removal-focus';

/**
 * #12632, #12634 — LE FOCUS QUITTE LA RANGÉE QUI PART. Il passe à la voisine
 * la plus proche qui RESTE et que le clavier atteint ; sinon au composeur.
 */

beforeAll(() => ensureHappyDomRegistered());
afterAll(async () => releaseHappyDomIfRegistered());

const thread = (rows: readonly { readonly id: string; readonly focusable?: boolean }[]): HTMLElement => {
  const root = document.createElement('div');
  root.innerHTML = `${rows
    .map((row) => `<div data-row="${row.id}"${row.focusable === false ? '' : ' tabindex="0"'}></div>`)
    .join('')}<div data-composer><textarea></textarea></div>`;
  return root;
};

const rowOf = (element: HTMLElement | null): string | undefined => element?.dataset.row;

describe('focusTargetAfterRemovals', () => {
  test('une rangée : la précédente reprend le focus', () => {
    expect(rowOf(focusTargetAfterRemoval('m-2', thread([{ id: 'm-1' }, { id: 'm-2' }, { id: 'm-3' }])))).toBe('m-1');
  });

  test('la première rangée : la suivante', () => {
    expect(rowOf(focusTargetAfterRemoval('m-1', thread([{ id: 'm-1' }, { id: 'm-2' }])))).toBe('m-2');
  });

  test('une sélection : la plus proche qui reste, jamais une autre rangée qui part', () => {
    const root = thread([{ id: 'm-1' }, { id: 'm-2' }, { id: 'm-3' }, { id: 'm-4' }]);
    expect(rowOf(focusTargetAfterRemovals(new Set(['m-1', 'm-2', 'm-3']), root))).toBe('m-4');
  });

  test('une voisine que le clavier n’atteint pas (rangée système) est sautée', () => {
    const root = thread([{ id: 'm-1' }, { id: 's-1', focusable: false }, { id: 'm-2' }]);
    expect(rowOf(focusTargetAfterRemoval('m-2', root))).toBe('m-1');
  });

  test('plus aucune rangée : le champ du composeur', () => {
    const root = thread([{ id: 'm-1' }]);
    expect(focusTargetAfterRemoval('m-1', root)?.tagName).toBe('TEXTAREA');
  });
});
