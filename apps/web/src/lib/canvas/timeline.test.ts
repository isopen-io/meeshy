import { describe, expect, test } from 'bun:test';

import type { CanvasObject, CanvasScene } from './document';
import { hasTimedObjects, sceneDurationSeconds } from './timeline';

const object = (overrides: Partial<CanvasObject>): CanvasObject => ({
  id: 'o1',
  kind: 'text',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'content',
  z: 0,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload: {},
  ...overrides,
});

const scene = (objects: readonly CanvasObject[], overrides?: Partial<CanvasScene>): CanvasScene => ({ id: 's1', objects, ...overrides });

// T-D7 — miroir hasTimeWindow (scene-motion.ts:24-32), RÉUTILISÉ.
describe('hasTimedObjects — quand une scène a une horloge (T-D7)', () => {
  test('un objet sans aucune marque temporelle ⇒ faux', () => {
    expect(hasTimedObjects(scene([object({})]))).toBe(false);
  });

  test('timing.start/end ⇒ vrai', () => {
    expect(hasTimedObjects(scene([object({ timing: { start: 1 } })]))).toBe(true);
  });

  test('keyframes non vides ⇒ vrai', () => {
    expect(hasTimedObjects(scene([object({ timing: { keyframes: [{ time: 0, x: 0.1 }] } })]))).toBe(true);
  });

  test('payload.fadeIn/fadeOut > 0 ⇒ vrai', () => {
    expect(hasTimedObjects(scene([object({ payload: { fadeIn: 1 } })]))).toBe(true);
    expect(hasTimedObjects(scene([object({ payload: { fadeOut: 1 } })]))).toBe(true);
  });

  test('duration sur un NON-média ⇒ vrai (sur un média, ne qualifie que le fichier)', () => {
    expect(hasTimedObjects(scene([object({ kind: 'sticker', payload: { duration: 2 } })]))).toBe(true);
    expect(hasTimedObjects(scene([object({ kind: 'media', payload: { duration: 2 } })]))).toBe(false);
  });
});

describe('sceneDurationSeconds (T-D7)', () => {
  test('timelineDuration AUTORITAIRE quand positif fini', () => {
    expect(sceneDurationSeconds(scene([object({ timing: { start: 0, end: 100 } })], { timelineDuration: 9 }))).toBe(9);
  });

  test('sans timelineDuration ⇒ la fin résolue la plus tardive des objets temporisés', () => {
    const s = scene([object({ timing: { start: 0, end: 3 } }), object({ id: 'o2', timing: { start: 1 }, payload: { duration: 5 } })]);
    expect(sceneDurationSeconds(s)).toBe(6);
  });

  test('aucun objet temporisé ⇒ null', () => {
    expect(sceneDurationSeconds(scene([object({})]))).toBeNull();
  });

  test('timelineDuration à 0 ou négatif ⇒ ignoré, repli sur les objets', () => {
    expect(sceneDurationSeconds(scene([object({ timing: { start: 0, end: 3 } })], { timelineDuration: 0 }))).toBe(3);
  });
});
