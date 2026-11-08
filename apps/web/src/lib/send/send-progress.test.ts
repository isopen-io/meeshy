import { describe, expect, test } from 'bun:test';

import { createSendProgressStore, transferFraction } from './send-progress';

describe('la progression d’envoi par message (#16134)', () => {
  test('deux envois en vol gardent chacun SA fraction', () => {
    const store = createSendProgressStore();
    store.getState().report('cm-a', 0.25);
    store.getState().report('cm-b', 0.8);
    expect(store.getState().fractions).toEqual({ 'cm-a': 0.25, 'cm-b': 0.8 });
  });

  test('la fraction est bornée entre 0 et 1', () => {
    const store = createSendProgressStore();
    store.getState().report('cm-a', 7);
    store.getState().report('cm-b', -3);
    expect(store.getState().fractions).toEqual({ 'cm-a': 1, 'cm-b': 0 });
  });

  test('un gain inférieur à 1 % ne notifie personne', () => {
    const store = createSendProgressStore();
    let notified = 0;
    store.getState().report('cm-a', 0.5);
    store.subscribe(() => (notified += 1));
    store.getState().report('cm-a', 0.504);
    expect(notified).toBe(0);
    store.getState().report('cm-a', 0.52);
    expect(notified).toBe(1);
  });

  test('clear retire la fraction du seul message visé', () => {
    const store = createSendProgressStore();
    store.getState().report('cm-a', 0.5);
    store.getState().report('cm-b', 0.5);
    store.getState().clear('cm-a');
    expect(store.getState().fractions).toEqual({ 'cm-b': 0.5 });
  });

  test('la progression d’un message pondère chaque fichier par son poids', () => {
    expect(transferFraction([100, 300], [1, 0])).toBeCloseTo(0.25);
    expect(transferFraction([100, 300], [1, 0.5])).toBeCloseTo(0.625);
    expect(transferFraction([], [])).toBe(0);
  });
});
