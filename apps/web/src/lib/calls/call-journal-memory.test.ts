import { beforeEach, describe, expect, test } from 'bun:test';

import { callJournalMemory } from './call-journal-memory';

/**
 * LE JOURNAL D'UN APPEL RESTE DÉPLIÉ QUAND SA BULLE QUITTE L'ÉCRAN (#17878 A1.17) — le fil virtualisé démonte
 * la rangée hors fenêtre ; sans mémoire hors d'elle, le journal revenait replié (iOS `BubbleCallJournalMemory`,
 * Android `rememberSaveable`). Elle ne retient que des identifiants d'appel, bornée.
 */
describe('la mémoire des journaux d’appel', () => {
  beforeEach(() => callJournalMemory.reset());

  test('un journal déplié se retrouve déplié, un autre jamais ouvert reste replié', () => {
    callJournalMemory.setOpen('call-1', true);
    expect(callJournalMemory.isOpen('call-1')).toBe(true);
    expect(callJournalMemory.isOpen('call-2')).toBe(false);
  });

  test('le replier l’oublie', () => {
    callJournalMemory.setOpen('call-1', true);
    callJournalMemory.setOpen('call-1', false);
    expect(callJournalMemory.isOpen('call-1')).toBe(false);
  });

  test('« Voir l’original » se retrouve aussi, par appel', () => {
    callJournalMemory.setOriginal('call-1', true);
    expect(callJournalMemory.isOriginal('call-1')).toBe(true);
    expect(callJournalMemory.isOriginal('call-2')).toBe(false);
    callJournalMemory.setOriginal('call-1', false);
    expect(callJournalMemory.isOriginal('call-1')).toBe(false);
  });

  test('elle est bornée à 32 appels : le plus ancien est oublié', () => {
    for (let index = 0; index < 33; index += 1) callJournalMemory.setOpen(`call-${index}`, true);
    expect(callJournalMemory.isOpen('call-0')).toBe(false);
    expect(callJournalMemory.isOpen('call-1')).toBe(true);
    expect(callJournalMemory.isOpen('call-32')).toBe(true);
  });
});
