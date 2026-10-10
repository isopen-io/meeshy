import { describe, expect, test } from 'bun:test';

import {
  SCENE_TRANSITIONS,
  SCENE_TRANSITION_MS,
  readSceneTransition,
  rehearsalTimeline,
  sceneTransitionKeyframes,
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
