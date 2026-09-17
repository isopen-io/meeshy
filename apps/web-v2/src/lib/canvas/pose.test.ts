import { describe, expect, test } from 'bun:test';

import type { CanvasObject } from './document';
import { anchorPoint, applyEasing, fadeFactor, isWithinWindow, keyframeOverrides, objectPose, visibilityWindow } from './pose';

const objectOf = (overrides: Partial<CanvasObject> & Pick<CanvasObject, 'anchor'>): CanvasObject => ({
  id: 'o1',
  kind: 'text',
  plane: 'content',
  z: 0,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload: {},
  ...overrides,
});

// T-D1 — l'ancre.
describe('objectPose / anchorPoint — l’ancre (T-D1)', () => {
  test("free {x:0.25,y:0.75} ⇒ {0.25,0.75}", () => {
    expect(anchorPoint(objectOf({ anchor: { t: 'free', x: 0.25, y: 0.75 } }))).toEqual({ x: 0.25, y: 0.75 });
  });

  test('band top ⇒ {0.5, 0.08}', () => {
    expect(anchorPoint(objectOf({ anchor: { t: 'band', edge: 'top' } }))).toEqual({ x: 0.5, y: 0.08 });
  });

  test('band bottom ⇒ {0.5, 0.92}', () => {
    expect(anchorPoint(objectOf({ anchor: { t: 'band', edge: 'bottom' } }))).toEqual({ x: 0.5, y: 0.92 });
  });
});

// T-D2 — la pose de base est le transform.
describe('objectPose — la pose de base est le transform (T-D2)', () => {
  test('sans timing : scale/rotation/opacity = transform, visible à tout t', () => {
    const object = objectOf({ anchor: { t: 'free', x: 0.5, y: 0.5 }, transform: { scale: 1.5, rotation: 20, opacity: 0.8 } });
    for (const t of [0, 1, 100]) {
      const pose = objectPose(object, t);
      expect(pose.scale).toBe(1.5);
      expect(pose.rotation).toBe(20);
      expect(pose.opacity).toBe(0.8);
      expect(pose.visible).toBe(true);
    }
  });
});

// T-D3 — la fenêtre temporelle est une porte NETTE.
describe('objectPose — la fenêtre temporelle est une porte nette (T-D3)', () => {
  const base = objectOf({ anchor: { t: 'free', x: 0.5, y: 0.5 } });

  test('timing.start: 2, payload.duration: 3 ⇒ visible faux à 1.99, vrai à 2, vrai à 4.99, faux à 5', () => {
    const object: CanvasObject = { ...base, timing: { start: 2 }, payload: { duration: 3 } };
    expect(isWithinWindow(object, 1.99)).toBe(false);
    expect(isWithinWindow(object, 2)).toBe(true);
    expect(isWithinWindow(object, 4.99)).toBe(true);
    expect(isWithinWindow(object, 5)).toBe(false);
  });

  test('timing.end: 4 sans duration ⇒ faux à 4', () => {
    const object: CanvasObject = { ...base, timing: { end: 4 } };
    expect(isWithinWindow(object, 3.99)).toBe(true);
    expect(isWithinWindow(object, 4)).toBe(false);
  });

  test('sans bornes ⇒ toujours visible', () => {
    expect(isWithinWindow(base, 0)).toBe(true);
    expect(isWithinWindow(base, 1e6)).toBe(true);
  });

  test('visibilityWindow expose {start,end}', () => {
    expect(visibilityWindow({ ...base, timing: { start: 2 }, payload: { duration: 3 } })).toEqual({ start: 2, end: 5 });
    expect(visibilityWindow(base)).toEqual({ start: 0, end: Infinity });
  });
});

// T-D4 — les fondus.
describe('objectPose — les fondus (T-D4)', () => {
  test('fadeIn: 1, start: 2, fadeOut: 1, duration: 4 (end=6) ⇒ opacity(2.5)=0.5×, opacity(5.5)=0.5×, milieu=transform.opacity', () => {
    const object: CanvasObject = {
      ...objectOf({ anchor: { t: 'free', x: 0.5, y: 0.5 }, transform: { scale: 1, rotation: 0, opacity: 1 } }),
      timing: { start: 2 },
      payload: { duration: 4, fadeIn: 1, fadeOut: 1 },
    };
    expect(objectPose(object, 2.5).opacity).toBeCloseTo(0.5, 9);
    expect(objectPose(object, 5.5).opacity).toBeCloseTo(0.5, 9);
    expect(objectPose(object, 4).opacity).toBeCloseTo(1, 9);
  });

  test('fadeFactor rend undefined hors fenêtre de fondu', () => {
    const object: CanvasObject = { ...objectOf({ anchor: { t: 'free', x: 0.5, y: 0.5 } }), timing: { start: 0 }, payload: { duration: 10 } };
    expect(fadeFactor(object, 5)).toBeUndefined();
  });
});

// T-D5 — les keyframes, canal par canal (rang ≠ premier).
describe('objectPose — les keyframes, canal par canal (T-D5)', () => {
  const build = (overrides?: Record<string, unknown>): CanvasObject => ({
    ...objectOf({ anchor: { t: 'free', x: 0.5, y: 0.5 }, transform: { scale: 1, rotation: 0, opacity: 1 } }),
    timing: { start: 0, keyframes: [{ time: 1, scale: 2 }, { time: 3, scale: 4, ...overrides }] },
  });

  test('t=0.5 ⇒ scale = transform.scale (AVANT le premier keyframe du canal)', () => {
    expect(objectPose(build(), 0.5).scale).toBe(1);
  });

  test('t=2 ⇒ 3 (linéaire, easing du keyframe BAS — sans easing déclaré)', () => {
    expect(objectPose(build(), 2).scale).toBeCloseTo(3, 9);
  });

  test('t=2 avec keyframe BAS easeIn ⇒ 2 + 2 × 0.25 = 2.5', () => {
    const object = build();
    const lowered: CanvasObject = {
      ...object,
      timing: { start: 0, keyframes: [{ time: 1, scale: 2, easing: 'easeIn' }, { time: 3, scale: 4 }] },
    };
    expect(objectPose(lowered, 2).scale).toBeCloseTo(2.5, 9);
  });

  test('t=10 ⇒ 4 (clamp après le dernier point)', () => {
    expect(objectPose(build(), 10).scale).toBeCloseTo(4, 9);
  });

  test('keyframes non triés ⇒ même résultat', () => {
    const object: CanvasObject = {
      ...objectOf({ anchor: { t: 'free', x: 0.5, y: 0.5 }, transform: { scale: 1, rotation: 0, opacity: 1 } }),
      timing: { start: 0, keyframes: [{ time: 3, scale: 4 }, { time: 1, scale: 2 }] },
    };
    expect(objectPose(object, 2).scale).toBeCloseTo(3, 9);
  });

  test("easing: 'spring' ⇒ linéaire (iOS ne le connaît pas, § 9 Q3)", () => {
    expect(applyEasing('spring', 0.5)).toBeCloseTo(0.5, 9);
  });
});

// T-D6 — la position n'est écrasée que si x ET y sont résolus.
describe('objectPose — la position n’est écrasée que si x ET y sont résolus (T-D6)', () => {
  test('x seul (sans y) ⇒ x/y restent l’ancre de base', () => {
    const object: CanvasObject = {
      ...objectOf({ anchor: { t: 'free', x: 0.1, y: 0.1 } }),
      timing: { start: 0, keyframes: [{ time: 0, x: 0.9 }] },
    };
    const overrides = keyframeOverrides(object.timing?.keyframes, 5, 0);
    expect(overrides.x).toBeUndefined();
    expect(overrides.y).toBeUndefined();
    const pose = objectPose(object, 5);
    expect(pose.x).toBe(0.1);
    expect(pose.y).toBe(0.1);
  });

  test('x ET y ⇒ {0.9, 0.1}', () => {
    const object: CanvasObject = {
      ...objectOf({ anchor: { t: 'free', x: 0.1, y: 0.1 } }),
      timing: { start: 0, keyframes: [{ time: 0, x: 0.9, y: 0.1 }] },
    };
    const pose = objectPose(object, 5);
    expect(pose.x).toBe(0.9);
    expect(pose.y).toBe(0.1);
  });

  test('startTime décale l’horloge (local = t − start)', () => {
    const object: CanvasObject = {
      ...objectOf({ anchor: { t: 'free', x: 0.1, y: 0.1 } }),
      timing: { start: 10, keyframes: [{ time: 0, x: 0.9, y: 0.1 }] },
    };
    // local = t - start ; avant start, local est clampé à 0 (max(0, t-start)) donc >= time:0 toujours
    expect(objectPose(object, 10).x).toBe(0.9);
    expect(objectPose(object, 0).x).toBe(0.9);
  });
});
