import { describe, expect, test } from 'bun:test';

import { classifyRelativeTime, relativeTimeTicks, shortRelativeTime } from './relative-time';

/**
 * Vecteurs transcrits de `RelativeTimeFormatterTests.swift:22-54` et
 * `RelativeTimeTests.swift:16-41` — la même échelle, `now` INJECTÉ.
 */
describe("l'heure relative courte", () => {
  const NOW = new Date('2026-09-08T12:00:00.000Z');
  const ago = (seconds: number): Date => new Date(NOW.getTime() - seconds * 1000);

  const vectors: ReadonlyArray<readonly [number, string]> = [
    [20, 'maintenant'],
    [29, 'maintenant'],
    [30, '30s'],
    [45, '45s'],
    [59, '59s'],
    [60, '1 min'],
    [150, '2 min'],
    [3_599, '59 min'],
    [3_600, '1h'],
    [7_200, '2h'],
    [86_399, '23h'],
    [3 * 86_400, '3j'],
    [10 * 86_400, '1sem'],
    [21 * 86_400, '3sem'],
    [45 * 86_400, '1 mois'],
    [75 * 86_400, '2 mois'],
  ];
  for (const [seconds, expected] of vectors) {
    test(`à ${seconds} s dans le passé, rend « ${expected} »`, () => {
      expect(shortRelativeTime(ago(seconds), NOW)).toBe(expected);
    });
  }

  test('un écart futur (horloge en avance) rend « maintenant », jamais un compte négatif', () => {
    expect(shortRelativeTime(new Date(NOW.getTime() + 120_000), NOW)).toBe('maintenant');
  });

  test('à 100 jours (même année), la date absolue ne porte PAS l’année', () => {
    const target = ago(100 * 86_400);
    const rendered = shortRelativeTime(target, NOW, 'fr-FR');
    expect(rendered).not.toContain('2026');
    expect(rendered).not.toContain('2025');
    expect(rendered.length).toBeGreaterThan(0);
  });

  test('au-delà d’un an, la date absolue PORTE l’année', () => {
    const target = new Date('2024-01-15T12:00:00.000Z');
    const rendered = shortRelativeTime(target, NOW, 'fr-FR');
    expect(rendered).toContain('2024');
  });

  /**
   * TÉMOIN DE LOCALE — la date absolue suit `Intl.DateTimeFormat(locale)`
   * (miroir `Locale.current`), jamais un `fr-FR` en dur : à 100 jours, l'ordre
   * anglais place le mois avant le jour.
   */
  test('la locale pilote la date absolue, jamais les libellés d’unité', () => {
    const target = ago(100 * 86_400);
    const en = shortRelativeTime(target, NOW, 'en-US');
    const fr = shortRelativeTime(target, NOW, 'fr-FR');
    expect(en).not.toBe(fr);
    // Les libellés d'unité restent français quelle que soit la locale.
    expect(shortRelativeTime(ago(150), NOW, 'en-US')).toBe('2 min');
  });

  test('classifyRelativeTime range les secondes dans le bon panier', () => {
    expect(classifyRelativeTime(ago(29), NOW)).toEqual({ kind: 'now' });
    expect(classifyRelativeTime(ago(60), NOW)).toEqual({ kind: 'minutes', value: 1 });
    expect(classifyRelativeTime(ago(90 * 86_400 - 1), NOW).kind).toBe('months');
    expect(classifyRelativeTime(ago(90 * 86_400), NOW).kind).toBe('date');
  });
});

/**
 * LE PORTILLON DU TICK (#5694 revue) — `relativeTimeTicks` doit dire NON dès
 * qu'un libellé ne bouge plus à la minute, sans quoi une Lentille de 200
 * lignes re-rend 200 nœuds par minute pour un texte identique
 * (`LentilleRowTimestamp` n'arme son `TimelineView` que sous l'heure).
 */
describe('relativeTimeTicks — le libellé peut-il encore changer à la minute ?', () => {
  const now = new Date('2026-09-08T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  test('« maintenant » ticke', () => {
    expect(relativeTimeTicks(ago(10_000), now)).toBe(true);
  });
  test('les secondes tickent', () => {
    expect(relativeTimeTicks(ago(45_000), now)).toBe(true);
  });
  test('les minutes tickent', () => {
    expect(relativeTimeTicks(ago(59 * 60_000), now)).toBe(true);
  });
  test('les heures NE tickent PLUS — la borne est celle de liveTickWindow', () => {
    expect(relativeTimeTicks(ago(60 * 60_000), now)).toBe(false);
  });
  test('les jours, semaines, mois et la date absolue ne tickent pas', () => {
    for (const ms of [3 * 86_400_000, 14 * 86_400_000, 60 * 86_400_000, 200 * 86_400_000]) {
      expect(relativeTimeTicks(ago(ms), now)).toBe(false);
    }
  });
  test('une estampille dans le FUTUR ticke — elle vaut « maintenant »', () => {
    expect(relativeTimeTicks(new Date(now.getTime() + 60_000), now)).toBe(true);
  });
});
