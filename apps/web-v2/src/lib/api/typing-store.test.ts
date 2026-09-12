import { describe, expect, test } from 'bun:test';

import { createTypingStore, typistNamesOf, typistsOf, TYPING_SAFETY_TIMEOUT_MS } from './typing-store';

describe('typing-store (#5793) — le réducteur pur de la frappe reçue', () => {
  test('start ajoute un frappeur avec une échéance de sécurité de 15 s', () => {
    const store = createTypingStore();
    store.getState().start('c-1', { userId: 'u-amina', displayName: 'Amina Diallo' }, 1_000);
    expect(typistsOf(store.getState(), 'c-1', 1_000)).toEqual([
      { userId: 'u-amina', displayName: 'Amina Diallo', expiresAt: 1_000 + TYPING_SAFETY_TIMEOUT_MS },
    ]);
  });

  test('un second start du MÊME frappeur REMPLACE son entrée, ne la double jamais', () => {
    const store = createTypingStore();
    store.getState().start('c-1', { userId: 'u-amina', displayName: 'Amina Diallo' }, 1_000);
    store.getState().start('c-1', { userId: 'u-amina', displayName: 'Amina Diallo' }, 4_000);
    const typists = typistsOf(store.getState(), 'c-1', 4_000);
    expect(typists).toHaveLength(1);
    expect(typists[0]?.expiresAt).toBe(4_000 + TYPING_SAFETY_TIMEOUT_MS);
  });

  test('stop retire SEULEMENT le frappeur nommé — la ligne survit tant qu’il en reste un autre', () => {
    const store = createTypingStore();
    store.getState().start('c-1', { userId: 'u-amina', displayName: 'Amina Diallo' }, 1_000);
    store.getState().start('c-1', { userId: 'u-kwame', displayName: 'Kwame Mensah' }, 1_000);
    store.getState().stop('c-1', 'u-amina');
    const typists = typistsOf(store.getState(), 'c-1', 1_000);
    expect(typists.map((t) => t.userId)).toEqual(['u-kwame']);
  });

  test('une entrée PÉRIMÉE (échéance dépassée) disparaît du sélecteur — même sans `stop`', () => {
    const store = createTypingStore();
    store.getState().start('c-1', { userId: 'u-amina', displayName: 'Amina Diallo' }, 1_000);
    expect(typistsOf(store.getState(), 'c-1', 1_000 + TYPING_SAFETY_TIMEOUT_MS + 1)).toEqual([]);
  });

  test('conversation inconnue : liste vide, jamais une exception', () => {
    const store = createTypingStore();
    expect(typistsOf(store.getState(), 'c-absente', 0)).toEqual([]);
  });

  test('stop sur un frappeur absent ne mute rien (référence identique)', () => {
    const store = createTypingStore();
    const before = store.getState();
    store.getState().stop('c-1', 'u-amina');
    expect(store.getState()).toBe(before);
  });
});

/** LA CARTE QUE L'ÉCRAN DE LISTE DISTRIBUE (revue-correction #5793) — la ligne
 * 2 de la Lentille, précédence `typing > … > aperçu`
 * (`targets/lentille.md:502-511`). */
describe('typistNamesOf (#5793) — qui écrit, par conversation', () => {
  test('rend le nom du PREMIER frappeur vivant de chaque conversation', () => {
    const store = createTypingStore();
    store.getState().start('c-1', { userId: 'u-amina', displayName: 'Amina Diallo' }, 1_000);
    store.getState().start('c-1', { userId: 'u-kwame', displayName: 'Kwame Mensah' }, 1_000);
    store.getState().start('c-2', { userId: 'u-fatou', displayName: 'Fatou Ba' }, 1_000);

    expect(typistNamesOf(store.getState(), 'u-viewer', 1_000)).toEqual({
      'c-1': 'Amina Diallo',
      'c-2': 'Fatou Ba',
    });
  });

  test('SOI-MÊME n’apparaît jamais — même quand on est le seul à écrire', () => {
    const store = createTypingStore();
    store.getState().start('c-1', { userId: 'u-viewer', displayName: 'Vous' }, 1_000);
    expect(typistNamesOf(store.getState(), 'u-viewer', 1_000)).toEqual({});
  });

  test('une entrée PÉRIMÉE ne rend aucune ligne', () => {
    const store = createTypingStore();
    store.getState().start('c-1', { userId: 'u-amina', displayName: 'Amina Diallo' }, 1_000);
    expect(typistNamesOf(store.getState(), 'u-viewer', 1_000 + TYPING_SAFETY_TIMEOUT_MS + 1)).toEqual({});
  });
});
