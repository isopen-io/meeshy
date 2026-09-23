import { describe, expect, test } from 'bun:test';

import { FIXTURES_LOADED_AT, parisCalendarDay, resolveThreadAnchor, resolveThreadMoment } from './fixtures-base';

/**
 * `resolveThreadAnchor` (#5797) — extraite de l'IIFE qui calculait
 * `THREAD_ANCHOR` pour pouvoir figer artificiellement, de part et d'autre
 * d'une frontière de jour parisienne, l'instant `at` qui lui est passé.
 * `sections.test.ts` (« resolveLensSections — sur les fixtures web-v2 »)
 * flakait quand ce même calcul — fait UNE fois au chargement du module, sur
 * son propre `new Date()` — retombait d'un jour calendaire parisien
 * différent de celui capturé, plus tard, par le second `new Date()` du
 * test : cette suite prouve que le calcul lui-même reste correct quel que
 * soit l'instant où il tombe par rapport à minuit à Paris, et que
 * `FIXTURES_LOADED_AT` (l'instant désormais PARTAGÉ entre l'ancre et ses
 * consommateurs) en est un `Date` valide — le fait qu'il n'existe plus
 * qu'UN SEUL `new Date()` élimine la fenêtre de flake elle-même.
 */
describe('resolveThreadAnchor — robuste à la traversée de minuit parisien (#5797)', () => {
  const THREAD_SPAN_MINUTES = 96;

  test('at juste AVANT minuit parisien (23:58 CEST) ⇒ l’ancre reste le même jour calendaire parisien', () => {
    const at = new Date('2026-09-08T21:58:00.000Z'); // 23:58 Europe/Paris (CEST, UTC+2)
    const anchor = resolveThreadAnchor(at, THREAD_SPAN_MINUTES);
    expect(parisCalendarDay(anchor)).toBe(parisCalendarDay(at));
  });

  test('at juste APRÈS minuit parisien (00:02 CEST) ⇒ l’ancre reste le même jour calendaire parisien', () => {
    const at = new Date('2026-09-08T22:02:00.000Z'); // 00:02 Europe/Paris le lendemain
    const anchor = resolveThreadAnchor(at, THREAD_SPAN_MINUTES);
    expect(parisCalendarDay(anchor)).toBe(parisCalendarDay(at));
  });

  test('at à minuit parisien pile ⇒ l’ancre reste le même jour calendaire parisien', () => {
    const at = new Date('2026-09-08T22:00:00.000Z'); // 00:00:00 Europe/Paris pile
    const anchor = resolveThreadAnchor(at, THREAD_SPAN_MINUTES);
    expect(parisCalendarDay(anchor)).toBe(parisCalendarDay(at));
  });

  test('at loin de tout minuit (14:00 CEST) ⇒ l’ancre est exactement minutesAgo(spanMinutes)', () => {
    const at = new Date('2026-09-08T12:00:00.000Z'); // 14:00 Europe/Paris
    const anchor = resolveThreadAnchor(at, THREAD_SPAN_MINUTES);
    expect(anchor.getTime()).toBe(at.getTime() - THREAD_SPAN_MINUTES * 60_000);
  });

  test("FIXTURES_LOADED_AT est l'instant UNIQUE du module, un Date valide", () => {
    expect(FIXTURES_LOADED_AT).toBeInstanceOf(Date);
    expect(Number.isNaN(FIXTURES_LOADED_AT.getTime())).toBe(false);
  });
});

/**
 * `resolveThreadMoment` (#7411) — la SECONDE moitié de l'invariant. #5797
 * garantissait « le fil reste dans le jour parisien de `at` » en TRANSLATANT
 * tout le fil jusqu'à minuit : entre 00:00 et 01:36 à Paris, les messages
 * « écrits il y a 2 à 82 minutes » tombaient donc APRÈS `at`, dans le futur.
 * Un message envoyé par un gate se rangeait alors AVANT eux, et
 * `check-thread-chrome.mjs` lisait la langue d'une bulle de fixture
 * (CI de dev, 00:00:26 à Paris, run 35658332188). Un instant du fil est donc
 * jugé sur DEUX propriétés à la fois : le jour parisien de `at`, et jamais
 * après `at`.
 */
describe('resolveThreadMoment — jamais dans le futur, jamais hors du jour parisien (#7411)', () => {
  const THREAD_SPAN_MINUTES = 96;
  const momentAt = (at: Date, minutesAgo: number): Date =>
    resolveThreadMoment({
      at,
      anchor: resolveThreadAnchor(at, THREAD_SPAN_MINUTES),
      spanMinutes: THREAD_SPAN_MINUTES,
      minutesAgo,
    });
  const WRITTEN = [96, 82, 15, 10, 5, 2] as const;

  test('juste APRÈS minuit parisien (00:00:30 CEST) ⇒ aucun instant du fil n’est après `at`', () => {
    const at = new Date('2026-09-21T22:00:30.000Z');
    const future = WRITTEN.filter((minutesAgo) => momentAt(at, minutesAgo).getTime() > at.getTime());
    expect(future).toEqual([]);
  });

  test('juste APRÈS minuit parisien (00:10 CEST) ⇒ chaque instant du fil reste dans le jour parisien de `at`', () => {
    const at = new Date('2026-09-21T22:10:00.000Z');
    const days = WRITTEN.map((minutesAgo) => parisCalendarDay(momentAt(at, minutesAgo)));
    expect(new Set(days)).toEqual(new Set([parisCalendarDay(at)]));
  });

  test('dans la fenêtre de minuit (00:10 CEST) ⇒ l’ORDRE d’écriture est conservé, strictement', () => {
    const at = new Date('2026-09-21T22:10:00.000Z');
    const times = [240, 120, ...WRITTEN].map((minutesAgo) => momentAt(at, minutesAgo).getTime());
    const increasing = times.every((time, i) => i === 0 || time > (times[i - 1] ?? Number.NEGATIVE_INFINITY));
    expect(increasing).toBe(true);
  });

  test('loin de tout minuit (14:00 CEST) ⇒ chaque instant est exactement minutesAgo(n)', () => {
    const at = new Date('2026-09-21T12:00:00.000Z');
    const offsets = [240, 120, ...WRITTEN].map((minutesAgo) => (at.getTime() - momentAt(at, minutesAgo).getTime()) / 60_000);
    expect(offsets).toEqual([240, 120, ...WRITTEN]);
  });
});
