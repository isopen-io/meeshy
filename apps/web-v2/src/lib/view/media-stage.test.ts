import { describe, expect, test } from 'bun:test';

import {
  CARDED_STAGE,
  FILMSTRIP_RESERVED_HEIGHT,
  fullStageBox,
  filmstripIndexAtPlayhead,
  filmstripLeadingInset,
  filmstripMaxScrollOffset,
  filmstripScrollOffset,
  longPressArmed,
  prefetchRange,
  rendersFullPixels,
  resolveStageDrag,
  showsPausedBadge,
  stageAfter,
} from './media-stage';

/** T3 — la loi d'immersion (`StagePresentation.swift`). */
describe('stageAfter — StagePresentation.after(door:)', () => {
  test('tap depuis carded ⇒ full non pausé', () => {
    expect(stageAfter(CARDED_STAGE, 'tap')).toEqual({ kind: 'full', pausedOnEntry: false });
  });

  test('tap depuis full ⇒ carded, quel que soit pausedOnEntry', () => {
    expect(stageAfter({ kind: 'full', pausedOnEntry: true }, 'tap')).toEqual(CARDED_STAGE);
    expect(stageAfter({ kind: 'full', pausedOnEntry: false }, 'tap')).toEqual(CARDED_STAGE);
  });

  test('longPress ⇒ full PAUSÉ depuis les DEUX états', () => {
    expect(stageAfter(CARDED_STAGE, 'longPress')).toEqual({ kind: 'full', pausedOnEntry: true });
    expect(stageAfter({ kind: 'full', pausedOnEntry: false }, 'longPress')).toEqual({ kind: 'full', pausedOnEntry: true });
  });

  test('swipeUp depuis carded ⇒ full non pausé ; depuis full ⇒ identité', () => {
    expect(stageAfter(CARDED_STAGE, 'swipeUp')).toEqual({ kind: 'full', pausedOnEntry: false });
    const full = { kind: 'full', pausedOnEntry: true } as const;
    expect(stageAfter(full, 'swipeUp')).toBe(full);
  });
});

describe('resolveStageDrag — MediaStageGestures.resolveDrag', () => {
  test('dominance verticale requise : dx > dy ⇒ ignored', () => {
    expect(resolveStageDrag({ dx: 200, dy: 40, presentation: CARDED_STAGE, threshold: 150 })).toBe('ignored');
  });

  test('dy ≤ -threshold, non-full ⇒ entersFull', () => {
    expect(resolveStageDrag({ dx: 10, dy: -160, presentation: CARDED_STAGE, threshold: 150 })).toBe('entersFull');
  });

  test('même geste depuis full ⇒ follows (pas de second entersFull)', () => {
    const full = { kind: 'full', pausedOnEntry: false } as const;
    expect(resolveStageDrag({ dx: 10, dy: -160, presentation: full, threshold: 150 })).toBe('follows');
  });

  test('dy ≥ threshold ⇒ dismisses, dans LES DEUX états', () => {
    expect(resolveStageDrag({ dx: 0, dy: 160, presentation: CARDED_STAGE, threshold: 150 })).toBe('dismisses');
    expect(resolveStageDrag({ dx: 0, dy: 160, presentation: { kind: 'full', pausedOnEntry: false }, threshold: 150 })).toBe(
      'dismisses',
    );
  });

  test('dy sous le seuil ⇒ follows', () => {
    expect(resolveStageDrag({ dx: 0, dy: 100, presentation: CARDED_STAGE, threshold: 150 })).toBe('follows');
  });
});

describe('longPressArmed — MediaStageGestures.longPressArmed', () => {
  test('actif, non transformé ⇒ armé', () => {
    expect(longPressArmed(true, false)).toBe(true);
  });
  test('actif MAIS transformé (zoom/pan en cours) ⇒ désarmé', () => {
    expect(longPressArmed(true, true)).toBe(false);
  });
  test('inactif ⇒ désarmé', () => {
    expect(longPressArmed(false, false)).toBe(false);
  });
});

describe('showsPausedBadge — MediaStagePause.showsBadge', () => {
  test('full pausé sur un média LISIBLE qui ne joue pas ⇒ true', () => {
    expect(showsPausedBadge({ kind: 'full', pausedOnEntry: true }, true, false)).toBe(true);
  });
  test('jamais sur une photo (playable=false)', () => {
    expect(showsPausedBadge({ kind: 'full', pausedOnEntry: true }, false, false)).toBe(false);
  });
  test('jamais pendant la lecture', () => {
    expect(showsPausedBadge({ kind: 'full', pausedOnEntry: true }, true, true)).toBe(false);
  });
  test('jamais depuis carded', () => {
    expect(showsPausedBadge(CARDED_STAGE, true, false)).toBe(false);
  });
});

/** T4 — la pellicule (FilmstripMetrics). */
describe('la pellicule — FilmstripMetrics', () => {
  test('filmstripLeadingInset(390) = 390 − 54 − 12 = 324', () => {
    expect(filmstripLeadingInset(390)).toBe(324);
  });

  test('filmstripScrollOffset(3) = 180', () => {
    expect(filmstripScrollOffset(3)).toBe(180);
  });

  test('filmstripIndexAtPlayhead(179, 6) = 3', () => {
    expect(filmstripIndexAtPlayhead(179, 6)).toBe(3);
  });

  test('filmstripMaxScrollOffset(6, 390) est un multiple du pas 60', () => {
    expect(filmstripMaxScrollOffset(6, 390) % 60).toBe(0);
  });

  /**
   * #6345 — round-trip sélection → défilement → sélection. C'est LUI qui
   * garantit que l'effet de `MediaFilmstrip` (`scrollLeft =
   * filmstripScrollOffset(currentIndex)`) ne redéclenche jamais son propre
   * `onScroll` en boucle : le défilement programmatique retombe exactement
   * sur l'index qui l'a produit.
   */
  test('round-trip : filmstripIndexAtPlayhead(filmstripScrollOffset(i), n) === i', () => {
    const count = 6;
    for (let i = 0; i < count; i += 1) {
      expect(filmstripIndexAtPlayhead(filmstripScrollOffset(i), count)).toBe(i);
    }
  });

  test('FILMSTRIP_RESERVED_HEIGHT = itemSide + 2×verticalPadding + bottomPadding = 54+20+6 = 80', () => {
    expect(FILMSTRIP_RESERVED_HEIGHT).toBe(80);
  });

  test('rendersFullPixels(1) = true, rendersFullPixels(2) = false', () => {
    expect(rendersFullPixels(1)).toBe(true);
    expect(rendersFullPixels(2)).toBe(false);
  });

  test('prefetchRange(0, 6) = [0, 1] ; (5, 6) = [4, 5] ; (3, 0) = null', () => {
    expect(prefetchRange(0, 6)).toEqual([0, 1]);
    expect(prefetchRange(5, 6)).toEqual([4, 5]);
    expect(prefetchRange(3, 0)).toBeNull();
  });
});

/**
 * `fullStageBox` (revue-correction #6902) — LE CENTRE DE LA BOÎTE RETOMBE AU
 * CENTRE DU VIEWPORT, quelle que soit la hauteur du couloir haut. Le témoin
 * s'écrit sur un `topInset` NON NUL : à zéro, la loi juste et un simple
 * `fitScene` rendent le même verdict, donc le témoin ne pourrait pas tomber.
 */
describe('fullStageBox — une page qui prend le VIEWPORT, décalée de son couloir', () => {
  const RATIO = 9 / 16;

  test('390 × 844, couloir haut de 56 : la boîte est celle du viewport, remontée de 56', () => {
    const box = fullStageBox({ viewport: { width: 390, height: 844 }, ratio: RATIO, topInset: 56 });
    expect(Math.round(box.width)).toBe(390);
    expect(Math.round(box.height)).toBe(693);
    expect(Math.round(box.left)).toBe(0);
    // offsetY = (844 − 693,33) / 2 = 75,33 ; moins le couloir ⇒ 19,33
    expect(Math.round(box.top)).toBe(19);
  });

  test('le centre de la boîte, RAMENÉ dans le repère du viewport, est le centre du viewport', () => {
    for (const topInset of [0, 44, 56, 103]) {
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 320, height: 568 },
        { width: 844, height: 390 },
      ]) {
        const box = fullStageBox({ viewport, ratio: RATIO, topInset });
        const centerX = box.left + box.width / 2;
        const centerY = topInset + box.top + box.height / 2;
        expect(Math.abs(centerX - viewport.width / 2)).toBeLessThanOrEqual(0.001);
        expect(Math.abs(centerY - viewport.height / 2)).toBeLessThanOrEqual(0.001);
      }
    }
  });

  test('une seule échelle, jamais de rognage — la boîte TIENT dans le viewport', () => {
    const box = fullStageBox({ viewport: { width: 844, height: 390 }, ratio: RATIO, topInset: 56 });
    expect(box.width).toBeLessThanOrEqual(844);
    expect(box.height).toBeLessThanOrEqual(390);
    expect(Math.abs(box.width / box.height - RATIO)).toBeLessThan(0.001);
  });

  test('un viewport non mesuré (0 × 0) ⇒ boîte nulle, jamais une division par zéro', () => {
    expect(fullStageBox({ viewport: { width: 0, height: 0 }, ratio: RATIO, topInset: 56 })).toEqual({ width: 0, height: 0, left: 0, top: -56 });
  });
});
