import { describe, expect, test } from 'bun:test';

import {
  READER_BOTTOM_INSET,
  READER_CARD_CORNER_RADIUS,
  READER_HEADER_INSET,
  READER_SIDE_INSET,
  readerCardFraming,
} from './framing';

/**
 * `readerCardFraming` (#6899) — `StoryCanvasFraming.resolve`
 * (`StoryCanvasFraming.swift:180-275`) appliqué au lecteur avec les cotes de
 * `readerCanvasFraming` (`StoryViewerView+Canvas.swift:1183-1201`). La scène
 * garde ses bornes INTRINSÈQUES 9:16 (l'ajustement du viewport entier) ; la
 * carte n'est qu'une ÉCHELLE et un DÉCALAGE — c'est ce qui laisse l'appui long
 * passer en plein bord sans re-mesurer la scène (son verdict est calculé dans
 * les bornes intrinsèques, qui ne bougent pas).
 */

const IPHONE = { width: 390, height: 844 };

describe('les cotes du lecteur iOS', () => {
  test('en-tête 72 (sous la zone sûre), bas 64, côtés 8, coins 22', () => {
    expect([READER_HEADER_INSET, READER_BOTTOM_INSET, READER_SIDE_INSET, READER_CARD_CORNER_RADIUS]).toEqual([72, 64, 8, 22]);
  });
});

describe('readerCardFraming — la carte au repos', () => {
  test('la scène intrinsèque est l’ajustement 9:16 du viewport, centré', () => {
    const framing = readerCardFraming({ viewport: IPHONE, safeTop: 0, presentation: 'carded' });
    expect(framing.canvas.width).toBeCloseTo(390, 5);
    expect(framing.canvas.height).toBeCloseTo(390 / (9 / 16), 5);
    expect(framing.canvas.x).toBeCloseTo(0, 5);
    expect(framing.canvas.y).toBeCloseTo((844 - 390 / (9 / 16)) / 2, 5);
  });

  test('la carte tient dans la région [72 … 844−64] × [8 … 390−8], centrée dans cette région', () => {
    const framing = readerCardFraming({ viewport: IPHONE, safeTop: 0, presentation: 'carded' });
    const regionHeight = 844 - 64 - 72;
    const regionWidth = 390 - 16;
    const cardHeight = framing.canvas.height * framing.scale;
    const cardWidth = framing.canvas.width * framing.scale;
    expect(cardHeight).toBeLessThanOrEqual(regionHeight + 1e-6);
    expect(cardWidth).toBeLessThanOrEqual(regionWidth + 1e-6);
    const cardCenterY = 844 / 2 + framing.offsetY;
    expect(cardCenterY).toBeCloseTo(72 + regionHeight / 2, 5);
  });

  test('la zone sûre haute s’AJOUTE à l’en-tête (`topInset + 72`)', () => {
    const sansZone = readerCardFraming({ viewport: IPHONE, safeTop: 0, presentation: 'carded' });
    const avecZone = readerCardFraming({ viewport: IPHONE, safeTop: 47, presentation: 'carded' });
    expect(avecZone.scale).toBeLessThan(sansZone.scale);
    const regionHeight = 844 - 64 - (47 + 72);
    expect(844 / 2 + avecZone.offsetY).toBeCloseTo(47 + 72 + regionHeight / 2, 5);
  });

  test('coins de 22 À L’ÉCRAN : le rayon du calque non mis à l’échelle est compensé', () => {
    const framing = readerCardFraming({ viewport: IPHONE, safeTop: 0, presentation: 'carded' });
    expect(framing.cornerRadius * framing.scale).toBeCloseTo(22, 5);
  });

  test('jamais d’agrandissement au-delà des bornes intrinsèques', () => {
    const framing = readerCardFraming({ viewport: { width: 2000, height: 900 }, safeTop: 0, presentation: 'carded' });
    expect(framing.scale).toBeLessThanOrEqual(1);
  });
});

describe('readerCardFraming — l’appui long (chrome masqué) passe en plein bord', () => {
  test('`free` ⇒ identité : échelle 1, aucun décalage, coins droits', () => {
    const framing = readerCardFraming({ viewport: IPHONE, safeTop: 47, presentation: 'free' });
    expect({ scale: framing.scale, offsetY: framing.offsetY, cornerRadius: framing.cornerRadius }).toEqual({ scale: 1, offsetY: 0, cornerRadius: 0 });
  });

  test('les bornes intrinsèques NE BOUGENT PAS entre carte et plein bord', () => {
    const carded = readerCardFraming({ viewport: IPHONE, safeTop: 47, presentation: 'carded' });
    const free = readerCardFraming({ viewport: IPHONE, safeTop: 47, presentation: 'free' });
    expect(free.canvas).toEqual(carded.canvas);
  });

  test('un viewport non mesuré (0×0) ⇒ identité sur une scène vide, jamais `NaN`', () => {
    const framing = readerCardFraming({ viewport: { width: 0, height: 0 }, safeTop: 0, presentation: 'carded' });
    expect(framing).toEqual({ canvas: { x: 0, y: 0, width: 0, height: 0 }, scale: 1, offsetY: 0, cornerRadius: 0 });
  });
});
