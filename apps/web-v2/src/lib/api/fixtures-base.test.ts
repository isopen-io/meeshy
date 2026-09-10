import { describe, expect, test } from 'bun:test';

import { FIXTURES_LOADED_AT, parisCalendarDay, resolveThreadAnchor } from './fixtures-base';

/**
 * `resolveThreadAnchor` (#5797) — extraite de l'IIFE qui calculait
 * `THREAD_ANCHOR` pour pouvoir figer artificiellement, de part et d'autre
 * d'une frontière de jour parisienne, l'instant `at` qui lui est passé.
 * `sections.test.ts` (« resolveLensSections — sur les fixtures web-v3 »)
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
