import { describe, expect, test } from 'bun:test';

import { focusStampLabel } from './stamp';

/**
 * Vecteurs transcrits de `FocalFocusTimestampTests.swift:28-56` — vendredi
 * 21 août 2026, 15:00, comme `now`.
 */
const now = new Date(2026, 7, 21, 15, 0);
const at = (y: number, m: number, d: number, h = 12, min = 0): Date => new Date(y, m - 1, d, h, min);
const label = (sentAt: Date, time = '12:45'): string =>
  focusStampLabel({ sentAt, now, timeString: time, locale: 'fr-FR' });

describe('focusStampLabel', () => {
  test("aujourd'hui -> mot + heure", () => {
    expect(label(at(2026, 8, 21, 9, 30))).toBe("Aujourd'hui 12:45");
  });

  test('hier -> mot + heure', () => {
    expect(label(at(2026, 8, 20, 18, 45), '18:45')).toBe('Hier 18:45');
  });

  test('avant-hier -> mot + heure', () => {
    expect(label(at(2026, 8, 19))).toBe('Avant-hier 12:45');
  });

  test('dans la semaine (3 jours, rang bas) -> nom du jour', () => {
    expect(label(at(2026, 8, 18, 23, 40), '23:40')).toBe('Mardi 23:40');
  });

  test('dans la semaine (6 jours, rang haut — bascule testee au rang, pas seulement a 3)', () => {
    expect(label(at(2026, 8, 15))).toBe('Samedi 12:45');
  });

  test('au-dela de la semaine (7 jours) -> date abregee, annee en cours omise', () => {
    expect(label(at(2026, 8, 14, 14, 41), '14:41')).toBe('Ven. 14 août · 14:41');
  });

  test("annee differente -> l'annee s'ajoute", () => {
    expect(label(at(2025, 10, 3, 14, 41), '14:41')).toBe('Ven. 3 oct. 2025 · 14:41');
  });

  test('les mots sont INJECTES, jamais recalcules', () => {
    const en = focusStampLabel({
      sentAt: at(2026, 8, 21),
      now,
      timeString: '12:45',
      locale: 'en-US',
      today: 'Today',
      yesterday: 'Yesterday',
      dayBeforeYesterday: '2 days ago',
    });
    expect(en).toBe('Today 12:45');
  });
});
