import { describe, expect, test } from 'bun:test';

import { createLottieBudget } from './budget';

/**
 * UNE LISTE LONGUE NE MONTE JAMAIS PLUS DE N FILMS (#10815) — le budget borne
 * les couches VIVANTES. Une couche sortie de l'écran garde sa place tant que
 * personne n'en a besoin ; sous pression, la plus anciennement sortie cède.
 */
type Log = { granted: string[]; evicted: string[] };
const log = (): Log => ({ granted: [], evicted: [] });

const claimer = (budget: ReturnType<typeof createLottieBudget>, state: Log) => (id: string) =>
  budget.claim({ grant: () => void state.granted.push(id), evict: () => void state.evicted.push(id) });

describe('le budget des couches Lottie', () => {
  test('accorde une place à chaque couche visible tant que le plafond n’est pas atteint', () => {
    const state = log();
    const budget = createLottieBudget(2);
    const claim = claimer(budget, state);
    claim('a').setVisible(true);
    claim('b').setVisible(true);
    expect(state.granted).toEqual(['a', 'b']);
    expect(budget.holders()).toBe(2);
  });

  test('plafond atteint par des couches à l’écran : la suivante attend, puis prend la place libérée', () => {
    const state = log();
    const budget = createLottieBudget(1);
    const claim = claimer(budget, state);
    const a = claim('a');
    a.setVisible(true);
    claim('b').setVisible(true);
    expect(state.granted).toEqual(['a']);
    a.release();
    expect(state.granted).toEqual(['a', 'b']);
    expect(state.evicted).toEqual([]);
    expect(budget.holders()).toBe(1);
  });

  test('une couche sortie de l’écran garde sa place sans pression, et la retrouve sans rechargement', () => {
    const state = log();
    const budget = createLottieBudget(2);
    const a = claimer(budget, state)('a');
    a.setVisible(true);
    a.setVisible(false);
    a.setVisible(true);
    expect(state.granted).toEqual(['a']);
    expect(state.evicted).toEqual([]);
  });

  test('sous pression, la couche la plus anciennement sortie de l’écran est évincée au profit de celle qui entre', () => {
    const state = log();
    const budget = createLottieBudget(2);
    const claim = claimer(budget, state);
    const a = claim('a');
    const b = claim('b');
    a.setVisible(true);
    b.setVisible(true);
    a.setVisible(false);
    b.setVisible(false);
    claim('c').setVisible(true);
    expect(state.evicted).toEqual(['a']);
    expect(state.granted).toEqual(['a', 'b', 'c']);
    expect(budget.holders()).toBe(2);
  });

  test('une couche en attente qui quitte l’écran perd son tour', () => {
    const state = log();
    const budget = createLottieBudget(1);
    const claim = claimer(budget, state);
    const a = claim('a');
    a.setVisible(true);
    const b = claim('b');
    b.setVisible(true);
    b.setVisible(false);
    a.release();
    expect(state.granted).toEqual(['a']);
    expect(budget.holders()).toBe(0);
  });

  test('une place qui se met en sommeil sert aussitôt la couche qui attendait', () => {
    const state = log();
    const budget = createLottieBudget(1);
    const claim = claimer(budget, state);
    const a = claim('a');
    a.setVisible(true);
    claim('b').setVisible(true);
    a.setVisible(false);
    expect(state.evicted).toEqual(['a']);
    expect(state.granted).toEqual(['a', 'b']);
  });

  test('une couche évincée qui revient à l’écran redemande une place', () => {
    const state = log();
    const budget = createLottieBudget(1);
    const claim = claimer(budget, state);
    const a = claim('a');
    a.setVisible(true);
    a.setVisible(false);
    const b = claim('b');
    b.setVisible(true);
    b.setVisible(false);
    a.setVisible(true);
    expect(state.granted).toEqual(['a', 'b', 'a']);
    expect(state.evicted).toEqual(['a', 'b']);
  });

  test('libérer deux fois ne rend pas deux places', () => {
    const state = log();
    const budget = createLottieBudget(1);
    const a = claimer(budget, state)('a');
    a.setVisible(true);
    a.release();
    a.release();
    expect(budget.holders()).toBe(0);
    a.setVisible(true);
    expect(state.granted).toEqual(['a']);
  });
});
