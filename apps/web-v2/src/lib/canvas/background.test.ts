import { describe, expect, test } from 'bun:test';

import { backgroundCss, backgroundFraming } from './background';
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

/**
 * `backgroundCss` (T6, #6899) — LE SITE UNIQUE de validation d'une valeur de
 * fond v1/v3 (`"RRGGBB"`, `"#RRGGBB"`, `"gradient:RRGGBB:RRGGBB"`), portée de
 * `sceneBackground` (`routes/story.tsx`) : un fond illisible retombe sur le
 * repli de l'APPELANT, jamais sur une valeur CSS invalide.
 */
describe('backgroundCss — la seule porte d’une valeur de fond vers le CSS (T6)', () => {
  test('six chiffres hexadécimaux nus ⇒ `#RRGGBB`', () => {
    expect(backgroundCss('4338CA', 'repli')).toBe('#4338CA');
  });

  test('déjà préfixé `#` ⇒ conservé tel quel', () => {
    expect(backgroundCss('#4338CA', 'repli')).toBe('#4338CA');
  });

  test('`gradient:RRGGBB:RRGGBB` ⇒ un dégradé CSS 135deg', () => {
    expect(backgroundCss('gradient:111111:222222', 'repli')).toBe('linear-gradient(135deg, #111111, #222222)');
  });

  test('un nom de couleur, un hex court, une chaîne vide ou `null`/`undefined` retombent sur le repli de l’appelant', () => {
    expect(backgroundCss('red', 'repli')).toBe('repli');
    expect(backgroundCss('#12', 'repli')).toBe('repli');
    expect(backgroundCss('', 'repli')).toBe('repli');
    expect(backgroundCss(null, 'repli')).toBe('repli');
    expect(backgroundCss(undefined, 'repli')).toBe('repli');
  });

  test('un dégradé aux bornes invalides retombe aussi sur le repli', () => {
    expect(backgroundCss('gradient:zzzzzz:222222', 'repli')).toBe('repli');
    expect(backgroundCss('gradient:111111', 'repli')).toBe('repli');
  });

  test('une valeur non-chaîne (nombre, objet) retombe sur le repli', () => {
    expect(backgroundCss(42, 'repli')).toBe('repli');
    expect(backgroundCss({ background: '4338CA' }, 'repli')).toBe('repli');
  });
});
