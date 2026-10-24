import { describe, expect, test } from 'bun:test';

import { holdsEnd, layoutMoved, settleOffset, type SettleFrame } from './row-settle-flip';

/**
 * #12634 — LES VOISINES D'UNE RANGÉE QUI SORT GLISSENT DEPUIS LÀ OÙ L'ŒIL LES
 * VOYAIT. Le décalage se mesure À L'ÉCRAN : la place dans la liste (`start`)
 * ET la position de la liste dans l'écran (`frameTop`), qui bouge quand le
 * navigateur rabat le défilement d'un fil calé en bas. Une transition sur
 * `transform` ne voyait que la première : les rangées du dessus sautaient, et
 * celles du dessous descendaient puis remontaient.
 */

const frame = (frameTop: number, starts: Record<string, number>, total: number, atEnd = false): SettleFrame => ({
  frameTop,
  starts: new Map(Object.entries(starts)),
  total,
  atEnd,
});

describe('settleOffset — d’où la rangée repart, à l’écran', () => {
  test('fil remonté : la suivante remonte de la hauteur libérée, et repart d’en dessous', () => {
    expect(settleOffset({ previousFrameTop: 0, previousTop: 400, frameTop: 0, start: 300 })).toBe(100);
  });

  test('fil calé en bas : la liste descend de la hauteur rabattue, la rangée du dessus repart d’au-dessus', () => {
    expect(settleOffset({ previousFrameTop: -406, previousTop: 200, frameTop: -215, start: 200 })).toBe(-191);
  });

  test('fil calé en bas : la rangée du dessous ne bouge pas à l’écran — aucun rebond', () => {
    expect(settleOffset({ previousFrameTop: -406, previousTop: 881, frameTop: -215, start: 690 })).toBe(0);
  });
});

describe('layoutMoved — seul un changement de disposition se rejoue, jamais un défilement', () => {
  test('un défilement seul ne déplace aucune rangée dans la liste', () => {
    expect(layoutMoved(frame(0, { a: 0, b: 100 }, 300), frame(-50, { a: 0, b: 100 }, 300))).toBe(false);
  });

  test('une rangée qui change de place dans la liste', () => {
    expect(layoutMoved(frame(0, { a: 0, b: 100 }, 300), frame(0, { a: 0, b: 40 }, 240))).toBe(true);
  });

  test('la hauteur totale qui change (le rabat du défilement suit)', () => {
    expect(layoutMoved(frame(0, { a: 0 }, 300), frame(0, { a: 0 }, 200))).toBe(true);
  });

  test('une rangée montée ou démontée par le défilement ne compte pas', () => {
    expect(layoutMoved(frame(0, { a: 0, b: 100 }, 300), frame(-80, { b: 100, c: 200 }, 300))).toBe(false);
  });
});

/**
 * UN FIL CALÉ EN BAS LE RESTE PENDANT UN RETOUR. À la sortie, le navigateur
 * rabat lui-même le défilement ; au retour d'une rangée refusée, le fil
 * grandit SOUS l'écran et le lecteur se retrouvait au-dessus du bas — puis la
 * première frappe d'un pair le réancrait d'un coup. Le fil se recale donc en
 * bas, et ce recalage est un glissement comme un autre.
 */
describe('holdsEnd — le fil calé en bas qui grandit se recale en bas', () => {
  test('calé en bas, il grandit : il se recale', () => {
    expect(holdsEnd(frame(0, { a: 0 }, 300, true), 400)).toBe(true);
  });

  test('remonté, il grandit : on ne le déplace pas', () => {
    expect(holdsEnd(frame(0, { a: 0 }, 300, false), 400)).toBe(false);
  });

  test('calé en bas, il rétrécit : le navigateur s’en charge', () => {
    expect(holdsEnd(frame(0, { a: 0 }, 300, true), 200)).toBe(false);
  });
});
