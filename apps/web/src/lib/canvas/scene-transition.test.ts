import { describe, expect, test } from 'bun:test';

import {
  SCENE_SLIDE_TRAVEL,
  SCENE_TRANSITION_IDENTITY,
  SCENE_TRANSITIONS,
  SCENE_TRANSITION_MS,
  SCENE_ZOOM_SCALE,
  readSceneTransition,
  rehearsalTimeline,
  sceneTransitionKeyframes,
  sceneTransitionPose,
  sceneTransitionWire,
} from './scene-transition';

/** Miroir de `StoryTransitionEffect` + `StoryRenderer.applyOpening/applyClosing` (iOS). */
describe('scene-transition — le fil CanvasV3 de l’ouverture et de la fermeture', () => {
  test('les quatre effets d’iOS, dans l’ordre des puces', () => {
    expect(SCENE_TRANSITIONS).toEqual(['fade', 'zoom', 'slide', 'reveal']);
  });
  test('`{ type }` se lit et s’écrit comme iOS (`CanvasV3Migration.swift`)', () => {
    expect(sceneTransitionWire('zoom')).toEqual({ type: 'zoom' });
    expect(readSceneTransition({ type: 'reveal' })).toBe('reveal');
  });
  test('une valeur inconnue ou absente ne joue rien', () => {
    expect(readSceneTransition(undefined)).toBeNull();
    expect(readSceneTransition({ type: 'spin' })).toBeNull();
    expect(readSceneTransition({})).toBeNull();
  });
});

describe('sceneTransitionKeyframes — les mêmes formes que le lecteur iOS', () => {
  test('fondu : l’opacité monte à l’ouverture, redescend à la fermeture', () => {
    expect(sceneTransitionKeyframes('fade', 'opening')).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(sceneTransitionKeyframes('fade', 'closing')).toEqual([{ opacity: 1 }, { opacity: 0 }]);
  });
  test('zoom : part de 1,08 et retombe ; se rezoome en sortant', () => {
    expect(sceneTransitionKeyframes('zoom', 'opening')).toEqual([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }]);
    expect(sceneTransitionKeyframes('zoom', 'closing')).toEqual([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }]);
  });
  test('glissement : entre depuis 8 % de la largeur, sort du côté opposé', () => {
    expect(sceneTransitionKeyframes('slide', 'opening')).toEqual([{ transform: 'translateX(8%)' }, { transform: 'translateX(0)' }]);
    expect(sceneTransitionKeyframes('slide', 'closing')).toEqual([{ transform: 'translateX(0)' }, { transform: 'translateX(-8%)' }]);
  });
  test('révélation : un cercle qui couvre les coins s’ouvre, puis se resserre', () => {
    expect(sceneTransitionKeyframes('reveal', 'opening')).toEqual([
      { clipPath: 'circle(0% at 50% 50%)' },
      { clipPath: 'circle(70.72% at 50% 50%)' },
    ]);
    expect(sceneTransitionKeyframes('reveal', 'closing')).toEqual([
      { clipPath: 'circle(70.72% at 50% 50%)' },
      { clipPath: 'circle(0% at 50% 50%)' },
    ]);
  });
});

describe('rehearsalTimeline — ouverture, une courte pause, fermeture (`StoryTransitionRehearsal`)', () => {
  test('les deux : 1,2 s, 0,6 s, 1,2 s', () => {
    expect(SCENE_TRANSITION_MS).toBe(1200);
    expect(rehearsalTimeline({ opening: 'fade', closing: 'zoom' })).toEqual({ closingStartMs: 1800, totalMs: 3000 });
  });
  test('sans ouverture, la pause puis la fermeture', () => {
    expect(rehearsalTimeline({ opening: null, closing: 'fade' })).toEqual({ closingStartMs: 600, totalMs: 1800 });
  });
  test('sans fermeture, l’ouverture puis la pause', () => {
    expect(rehearsalTimeline({ opening: 'slide', closing: null })).toEqual({ closingStartMs: 1800, totalMs: 1800 });
  });
});

describe('sceneTransitionPose — l’ouverture et la fermeture échantillonnées à l’instant (export, #13880)', () => {
  const pose = (opening: string | null, closing: string | null, elapsedMs: number, durationMs = 6000) =>
    sceneTransitionPose({ opening: opening as never, closing: closing as never, elapsedMs, durationMs });

  test('sans transition, ni avant ni après : la scène telle quelle', () => {
    expect(pose(null, null, 0)).toEqual(SCENE_TRANSITION_IDENTITY);
    expect(pose('fade', 'fade', 3000)).toEqual(SCENE_TRANSITION_IDENTITY);
  });
  test('fondu : l’opacité monte sur 1,2 s à l’ouverture, redescend sur les 1,2 dernières', () => {
    expect(pose('fade', null, 0).opacity).toBe(0);
    expect(pose('fade', null, 600).opacity).toBeCloseTo(0.5);
    expect(pose(null, 'fade', 6000 - 300).opacity).toBeCloseTo(0.25);
    expect(pose(null, 'fade', 6000).opacity).toBe(0);
  });
  test('zoom : part de 1,08 (le même que les keyframes), retombe à 1 ; se rezoome en sortant', () => {
    expect(pose('zoom', null, 0).scale).toBeCloseTo(SCENE_ZOOM_SCALE);
    expect(pose('zoom', null, 600).scale).toBeCloseTo(1.04);
    expect(pose(null, 'zoom', 6000).scale).toBeCloseTo(SCENE_ZOOM_SCALE);
  });
  test('glissement : entre depuis +8 % de la largeur, sort vers −8 %', () => {
    expect(pose('slide', null, 0).translateX).toBeCloseTo(SCENE_SLIDE_TRAVEL);
    expect(pose(null, 'slide', 6000).translateX).toBeCloseTo(-SCENE_SLIDE_TRAVEL);
  });
  test('révélation : le cercle s’ouvre, puis se referme', () => {
    expect(pose('reveal', null, 600).reveal).toBeCloseTo(0.5);
    expect(pose('reveal', null, 1200).reveal).toBeNull();
    expect(pose(null, 'reveal', 6000 - 600).reveal).toBeCloseTo(0.5);
  });
  test('slide courte : la fermeture prend la main sur ce qu’elle anime, l’ouverture garde le reste (iOS clearOpeningFill)', () => {
    const both = pose('fade', 'zoom', 1000, 2000);
    expect(both.opacity).toBeCloseTo(1000 / 1200);
    expect(both.scale).toBeCloseTo(1 + 0.08 * (200 / 1200));
    const sameProperty = pose('slide', 'zoom', 1000, 2000);
    expect(sameProperty.translateX).toBe(0);
  });
  test('les keyframes de la répétition gardent leurs formes, désormais dérivées des mêmes constantes', () => {
    expect(sceneTransitionKeyframes('zoom', 'opening')[0]).toEqual({ transform: 'scale(1.08)' });
    expect(sceneTransitionKeyframes('slide', 'closing')[1]).toEqual({ transform: 'translateX(-8%)' });
  });
});
