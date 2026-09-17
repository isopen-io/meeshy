import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { parseCanvasDocument, type CanvasObject } from '@/lib/canvas/document';

import { sceneFootprint } from './footprint';

/**
 * `sceneFootprint` (T11, #6899) — LE MESUREUR de production injecté dans
 * {@link import('./image-only').imageOnlyPresentation}. **Elle échoue
 * FERMÉE** : sous `happy-dom`, qui ne fait pas de mise en page réelle,
 * `getBoundingClientRect()` rend systématiquement 0×0 — un texte y est donc
 * TOUJOURS jugé non mesurable, exactement le comportement attendu d'un hôte
 * qui n'a encore rien peint (§ « échoue fermé », `image-only.ts`).
 */

const scenesOf = (objects: readonly unknown[]) => {
  const doc = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects }] });
  const object = doc?.scenes[0]?.objects[0];
  if (object === undefined) throw new Error('vecteur de test invalide');
  return object;
};

let host: HTMLElement;

beforeAll(() => {
  ensureHappyDomRegistered();
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
});

afterEach(() => {
  host.innerHTML = '';
});

afterAll(async () => {
  host.remove();
  await releaseHappyDomIfRegistered();
});

describe('sceneFootprint — un `media` se déduit de sa formule, jamais du DOM', () => {
  test('l’ancre × la taille du canvas, la taille 60% de la largeur / le rapport déclaré', () => {
    const object = scenesOf([
      { id: 'm', kind: 'media', anchor: { t: 'free', x: 0.3, y: 0.7 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { postMediaId: 'x', aspectRatio: 2 } },
    ]);
    const footprint = sceneFootprint({ object, canvasSize: { width: 1000, height: 2000 }, preferredLanguages: ['fr'], host });
    expect(footprint).toEqual({ position: { x: 300, y: 1400 }, size: { width: 600, height: 300 } });
  });

  test('sans rapport déclaré, un carré (aspect 1) par défaut', () => {
    const object = scenesOf([{ id: 'm', kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { postMediaId: 'x' } }]);
    const footprint = sceneFootprint({ object, canvasSize: { width: 1000, height: 1000 }, preferredLanguages: ['fr'], host });
    expect(footprint).toEqual({ position: { x: 500, y: 500 }, size: { width: 600, height: 600 } });
  });
});

describe('sceneFootprint — un `text` se MESURE, et échoue FERMÉ sans mise en page réelle', () => {
  test('sous happy-dom (0×0), un texte n’est jamais mesurable', () => {
    const object = scenesOf([{ id: 't', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { text: 'x' } }]);
    const footprint = sceneFootprint({ object, canvasSize: { width: 1080, height: 1920 }, preferredLanguages: ['fr'], host });
    expect(footprint).toBeNull();
  });

  test('un texte VIDE (résolu) n’est jamais mesurable — rien à peindre', () => {
    const object = scenesOf([{ id: 't', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { text: '' } }]);
    const footprint = sceneFootprint({ object, canvasSize: { width: 1080, height: 1920 }, preferredLanguages: ['fr'], host });
    expect(footprint).toBeNull();
  });

  test('la mesure ne laisse AUCUN nœud résiduel dans l’hôte', () => {
    const object = scenesOf([{ id: 't', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { text: 'x' } }]);
    sceneFootprint({ object, canvasSize: { width: 1080, height: 1920 }, preferredLanguages: ['fr'], host });
    expect(host.childElementCount).toBe(0);
  });
});

describe('sceneFootprint — sticker/place/drawing ne sont pas encore mesurables (#6901)', () => {
  for (const kind of ['sticker', 'place', 'drawing'] as const) {
    test(`${kind} ⇒ null`, () => {
      const object = scenesOf([{ id: 'o', kind, anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: {} }]) as CanvasObject;
      const footprint = sceneFootprint({ object, canvasSize: { width: 1080, height: 1920 }, preferredLanguages: ['fr'], host });
      expect(footprint).toBeNull();
    });
  }
});
