import { describe, expect, test } from 'bun:test';

import { callJournalHeight, JOURNAL_HEIGHT_MAX, JOURNAL_HEIGHT_MIN } from './call-journal-height';

describe('la hauteur du journal dans la pilule', () => {
  test('une part de la fenêtre, jamais sous un plancher lisible', () => {
    expect(callJournalHeight(844)).toBeCloseTo(844 * 0.45, 5);
    expect(callJournalHeight(320)).toBe(JOURNAL_HEIGHT_MIN);
    expect(callJournalHeight(0)).toBe(JOURNAL_HEIGHT_MIN);
  });

  test('et jamais au-dessus d’un plafond : la grille de groupe garde sa place', () => {
    expect(callJournalHeight(1366)).toBe(JOURNAL_HEIGHT_MAX);
    expect([JOURNAL_HEIGHT_MIN, JOURNAL_HEIGHT_MAX]).toEqual([160, 440]);
  });
});

