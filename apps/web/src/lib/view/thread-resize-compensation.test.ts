import { describe, expect, test } from 'bun:test';
import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';

import { compensatesResize, keepReadingInPlace } from './thread-resize-compensation';

/**
 * #9216, #9219 — la rangée qui change de taille AU-DESSUS de ce qu'on lit est
 * compensée, re-mesurée ou non, dans les deux sens de défilement. Le cas qui a
 * ouvert ce témoin : l'ancienne tête du fil, à cheval sur le haut de l'écran
 * quand l'historique arrive, PERD son séparateur de jour (−40 px) — le
 * virtualiseur, par défaut, ne la compensait pas, et tout ce qu'on lisait
 * remontait de 40 px. La mesure en pixels vit dans
 * `scripts/check-thread-virtualization.mjs` (critère 5).
 */
describe('compensatesResize', () => {
  test('une rangée À CHEVAL sur le haut de l’écran est compensée — le cas de l’ancienne tête qui perd son séparateur', () => {
    expect(compensatesResize({ start: 4400, viewportTop: 4500 })).toBe(true);
  });

  test('une rangée entièrement au-dessus est compensée', () => {
    expect(compensatesResize({ start: 100, viewportTop: 4500 })).toBe(true);
  });

  test('une rangée qui commence AU haut de l’écran ou plus bas ne l’est pas — c’est elle qu’on lit', () => {
    expect(compensatesResize({ start: 4500, viewportTop: 4500 })).toBe(false);
    expect(compensatesResize({ start: 4600, viewportTop: 4500 })).toBe(false);
  });
});

describe('keepReadingInPlace — le haut de l’écran est celui du virtualiseur', () => {
  const item = (start: number): VirtualItem => ({ key: 'm', index: 0, start, end: start + 88, size: 88, lane: 0 });
  const instance = (scrollOffset: number | null, scrollAdjustments: number) =>
    ({ scrollOffset, scrollAdjustments }) as unknown as Virtualizer<HTMLElement, Element>;

  test('l’offset COMPTE les compensations déjà écrites dans le même lot de mesures', () => {
    expect(keepReadingInPlace(item(4520), -40, instance(4500, 0))).toBe(false);
    expect(keepReadingInPlace(item(4520), -40, instance(4500, 38))).toBe(true);
  });

  test('un virtualiseur sans offset connu ne compense rien au-dessus de zéro', () => {
    expect(keepReadingInPlace(item(0), 10, instance(null, 0))).toBe(false);
  });
});
