import { describe, expect, test } from 'bun:test';

import {
  SCROLL_SAMPLE_MS,
  bindDecimatedScroll,
  createContentScrollAccumulator,
  createListingScrollAccumulator,
} from './scroll-accumulator';

/**
 * LE DÉFILEMENT, AGRÉGÉ PAR PASSAGE (#10509, décision § 5) — échantillonné
 * à ≤ 10 Hz, cumulé par additions d'entiers, rien ne part avant la fin.
 */
describe('createListingScrollAccumulator', () => {
  test('distance, durée active et histogramme de vitesse : l’histogramme somme la durée active', () => {
    const acc = createListingScrollAccumulator(0);
    acc.sample(0, 0);
    acc.sample(30, 100);
    acc.sample(130, 200);
    acc.sample(330, 300);
    acc.sample(830, 400);
    const summary = acc.summary(400);
    expect(summary.distancePt).toBe(830);
    expect(summary.activeScrollMs).toBe(400);
    expect(summary.velocityHistogram).toEqual([100, 100, 100, 100]);
    expect(summary.velocityHistogram.reduce((a, b) => a + b, 0)).toBe(summary.activeScrollMs);
    expect(summary.durationMs).toBe(400);
  });

  test('changements de direction et part de distance remontée', () => {
    const acc = createListingScrollAccumulator(0);
    acc.sample(0, 0);
    acc.sample(300, 100);
    acc.sample(200, 200);
    acc.sample(400, 300);
    const summary = acc.summary(300);
    expect(summary.directionChanges).toBe(2);
    expect(summary.upDistanceRatio).toBe(0.17);
  });

  test('un arrêt d’au moins une seconde compte, et n’entre pas dans la durée active', () => {
    const acc = createListingScrollAccumulator(0);
    acc.sample(0, 0);
    acc.sample(100, 100);
    acc.sample(200, 1500);
    const summary = acc.summary(1500);
    expect(summary.stops).toBe(1);
    expect(summary.activeScrollMs).toBe(100);
  });

  test('un lancer (≥ 4 000 pt/s) compte une fois par geste', () => {
    const acc = createListingScrollAccumulator(0);
    acc.sample(0, 0);
    acc.sample(500, 100);
    acc.sample(1000, 200);
    acc.sample(1010, 300);
    acc.sample(1600, 400);
    expect(acc.summary(400).flings).toBe(2);
  });

  test('cartes rendues et visibles, position maximale, rafraîchissements, pages, fin atteinte', () => {
    const acc = createListingScrollAccumulator(0);
    acc.noteItem(0, false);
    acc.noteItem(4, true);
    acc.noteItem(4, true);
    acc.noteRefresh();
    acc.notePagination();
    acc.noteReachedEnd();
    const summary = acc.summary(10);
    expect(summary.itemsRendered).toBe(2);
    expect(summary.itemsViewable).toBe(1);
    expect(summary.maxPosition).toBe(4);
    expect(summary.refreshes).toBe(1);
    expect(summary.paginations).toBe(1);
    expect(summary.reachedEnd).toBe(true);
  });

  test('un nouveau segment repart de zéro sans perdre la position courante', () => {
    const acc = createListingScrollAccumulator(0);
    acc.sample(0, 0);
    acc.sample(100, 100);
    acc.reset(100);
    acc.sample(150, 200);
    const summary = acc.summary(200);
    expect(summary.distancePt).toBe(50);
    expect(summary.durationMs).toBe(100);
  });

  test('1 000 échantillons : l’état reste borné (aucune liste ne grandit)', () => {
    const acc = createListingScrollAccumulator(0);
    for (let i = 0; i < 1000; i += 1) {
      acc.sample(i * 10, i * 100);
      acc.noteItem(i, true);
    }
    expect(acc.summary(100_000).itemsRendered).toBeLessThanOrEqual(1000);
  });
});

describe('bindDecimatedScroll — ≤ 10 Hz, aucun travail par événement', () => {
  test('1 000 événements scroll en une seconde ⇒ au plus 11 échantillons', () => {
    const listeners: Array<() => void> = [];
    const target = {
      scrollTop: 0,
      clientHeight: 100,
      scrollHeight: 100_000,
      addEventListener: (_: string, run: () => void, options: unknown) => {
        expect(options).toEqual({ passive: true });
        listeners.push(run);
      },
      removeEventListener: () => undefined,
    };
    let frame: ((at: number) => void) | null = null;
    let clock = 0;
    const samples: number[] = [];
    const stop = bindDecimatedScroll(target, (top) => samples.push(top), {
      raf: (run) => {
        frame = run;
        return 1;
      },
      cancel: () => undefined,
    });
    for (let i = 0; i < 1000; i += 1) {
      clock = i;
      target.scrollTop = i;
      listeners.forEach((run) => run());
      const due = frame as ((at: number) => void) | null;
      frame = null;
      due?.(clock);
    }
    expect(samples.length).toBeLessThanOrEqual(11);
    expect(samples.length).toBeGreaterThan(5);
    stop();
    expect(SCROLL_SAMPLE_MS).toBe(100);
  });
});

describe('createContentScrollAccumulator — le défilement DANS un contenu', () => {
  test('carrousel : glissements et index maximal atteint', () => {
    const acc = createContentScrollAccumulator({ contentKind: 'carousel', itemsTotal: 5, startedAt: 0 });
    acc.noteIndex(1);
    acc.noteIndex(2);
    acc.noteIndex(1);
    acc.noteIndex(1);
    expect(acc.summary(3000)).toEqual({
      contentKind: 'carousel',
      itemsTotal: 5,
      maxIndexReached: 2,
      swipes: 3,
      maxScrollFraction: 0,
      readThroughFraction: 0,
      durationMs: 3000,
    });
  });

  test('texte long : la fraction lue est la plus profonde atteinte', () => {
    const acc = createContentScrollAccumulator({ contentKind: 'long_text', itemsTotal: 1, startedAt: 0 });
    acc.noteFraction(0.4, 0.6);
    acc.noteFraction(0.2, 0.4);
    const summary = acc.summary(1000);
    expect(summary.maxScrollFraction).toBe(0.4);
    expect(summary.readThroughFraction).toBe(0.6);
  });
});
