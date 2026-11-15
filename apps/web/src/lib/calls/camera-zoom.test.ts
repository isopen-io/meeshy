import { describe, expect, test } from 'bun:test';

import { clampZoom, currentZoom, zoomAfterPinch, zoomAfterWheel, zoomLabel, zoomNudge, zoomRangeOf, type ZoomRange } from './camera-zoom';

/**
 * LE ZOOM DE MA CAMÉRA (#8441) — la contrainte `zoom` de la piste, là où le
 * navigateur la propose (Chrome sur Android, la coque) : ses bornes, le
 * pincement, la molette, les boutons ±, et ce que l'indicateur affiche.
 */

const camera = (zoom: unknown, settings: Record<string, unknown> = {}) => ({ getCapabilities: () => (zoom === undefined ? {} : { zoom }), getSettings: () => settings }) as unknown as MediaStreamTrack;

const RANGE: ZoomRange = { min: 1, max: 8, step: 0.1 };

describe('les bornes', () => {
  test('lues dans les capacités de la caméra', () => {
    expect(zoomRangeOf(camera({ min: 1, max: 8, step: 0.1 }))).toEqual(RANGE);
  });

  test('pas de zoom proposé, un zoom figé ou illisible : rien', () => {
    expect(zoomRangeOf(camera(undefined))).toBeNull();
    expect(zoomRangeOf(camera({ min: 1, max: 1, step: 0.1 }))).toBeNull();
    expect(zoomRangeOf(camera({ min: 'a', max: 3 }))).toBeNull();
    expect(zoomRangeOf({} as MediaStreamTrack)).toBeNull();
    expect(zoomRangeOf(null)).toBeNull();
  });

  test('un pas absent ou nul vaut un centième', () => {
    expect(zoomRangeOf(camera({ min: 1, max: 4 }))).toEqual({ min: 1, max: 4, step: 0.01 });
  });

  test('le zoom courant : celui de la caméra, sinon le minimum', () => {
    expect(currentZoom(camera(RANGE, { zoom: 2.5 }), RANGE)).toBe(2.5);
    expect(currentZoom(camera(RANGE), RANGE)).toBe(1);
  });
});

describe('les gestes', () => {
  test('toute valeur se borne et s’aligne sur le pas', () => {
    expect(clampZoom(RANGE, 0.2)).toBe(1);
    expect(clampZoom(RANGE, 12)).toBe(8);
    expect(clampZoom(RANGE, 2.46)).toBe(2.5);
  });

  test('pincer multiplie le zoom du DÉBUT du geste par l’écart des doigts', () => {
    expect(zoomAfterPinch(RANGE, 2, 1.5)).toBe(3);
    expect(zoomAfterPinch(RANGE, 2, 0.1)).toBe(1);
  });

  test('la molette vers le haut zoome, vers le bas dézoome', () => {
    expect(zoomAfterWheel(RANGE, 2, -100)).toBeGreaterThan(2);
    expect(zoomAfterWheel(RANGE, 2, 100)).toBeLessThan(2);
  });

  test('les boutons ± avancent d’un cran d’un quart, jusqu’aux bornes', () => {
    expect(zoomNudge(RANGE, 2, 1)).toBe(2.5);
    expect(zoomNudge(RANGE, 2, -1)).toBe(1.6);
    expect(zoomNudge(RANGE, 7.9, 1)).toBe(8);
    expect(zoomNudge(RANGE, 1, -1)).toBe(1);
  });
});

describe('l’indicateur', () => {
  test('« 1× », « 1,5× » en français, « 1.5× » en anglais', () => {
    expect(zoomLabel(1, 'fr')).toBe('1×');
    expect(zoomLabel(1.5, 'fr')).toBe('1,5×');
    expect(zoomLabel(1.5, 'en')).toBe('1.5×');
    expect(zoomLabel(2.46, 'en')).toBe('2.5×');
  });
});
