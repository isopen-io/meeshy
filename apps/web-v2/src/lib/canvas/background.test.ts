import { describe, expect, test } from 'bun:test';

import { backgroundFraming } from './background';
import type { CanvasObject, CanvasScene } from './document';

const object = (overrides: Partial<CanvasObject>): CanvasObject => ({
  id: 'o',
  kind: 'media',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'bg',
  z: 0,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload: {},
  ...overrides,
});

const scene = (objects: readonly CanvasObject[]): CanvasScene => ({ id: 's1', objects });

/** `StoryBackgroundFraming.rendersFilled` (`StoryBackgroundFraming.swift:62`) :
 * l'ABSENCE de cadrage, `"fill"` et toute valeur inconnue REMPLISSENT ; seul
 * `"fit"` ajuste. La première forme du moteur ajustait TOUJOURS — la carte
 * montrait un panorama entier dans une bande là où iOS le montre plein cadre. */
describe('backgroundFraming — le fond REMPLIT, sauf cadrage « fit » déclaré', () => {
  test('aucun porteur de cadrage ⇒ fill', () => {
    expect(backgroundFraming(scene([object({ payload: { mediaId: 'm1' } })]))).toBe('fill');
  });

  test('porteur de fond `transform.videoFitMode: "fit"` ⇒ fit', () => {
    expect(backgroundFraming(scene([object({ id: 'bg', payload: { transform: { videoFitMode: 'fit' } } }), object({ id: 'm', payload: { mediaId: 'm1' } })]))).toBe('fit');
  });

  test('valeur inconnue ou « fill » ⇒ fill', () => {
    expect(backgroundFraming(scene([object({ payload: { transform: { videoFitMode: 'stretch' } } })]))).toBe('fill');
    expect(backgroundFraming(scene([object({ payload: { transform: { videoFitMode: 'fill' } } })]))).toBe('fill');
  });

  test('un cadrage posé sur un objet qui n’est PAS un fond ne compte pas', () => {
    expect(backgroundFraming(scene([object({ plane: 'content', payload: { transform: { videoFitMode: 'fit' } } })]))).toBe('fill');
  });
});
