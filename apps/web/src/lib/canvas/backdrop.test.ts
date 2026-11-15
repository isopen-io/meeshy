import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_SCENE_BACKDROP,
  DEFAULT_SCENE_FIT_MODE,
  SCENE_BACKDROPS,
  SCENE_BACKDROP_TINT,
  SCENE_FIT_MODES,
  sceneBackdropOf,
  sceneFitModeOf,
} from './backdrop';
import { backgroundBackdrop } from './background';
import type { CanvasObject, CanvasScene } from './document';

const object = (overrides: Partial<CanvasObject>): CanvasObject => ({
  id: 'o',
  kind: 'media',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'content',
  z: 0,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload: {},
  ...overrides,
});

const scene = (objects: readonly CanvasObject[]): CanvasScene => ({ id: 's1', objects });

/** Le CONTRAT du panneau Cadre (#8414), commun au web et à iOS : deux champs
 * du `transform` du porteur de fond, `videoFitMode` et `backdrop`. */
describe('le contrat du Cadre — deux cadrages, cinq fonds, leurs teintes', () => {
  test('Ajuster puis Remplir, Ajuster par défaut', () => {
    expect(SCENE_FIT_MODES).toEqual(['fit', 'fill']);
    expect(DEFAULT_SCENE_FIT_MODE).toBe('fit');
  });

  test('flou, noir, blanc, indigo, sable — flou par défaut', () => {
    expect(SCENE_BACKDROPS).toEqual(['blur', 'black', 'white', 'indigo', 'sand']);
    expect(DEFAULT_SCENE_BACKDROP).toBe('blur');
  });

  test('les quatre teintes pleines sont celles du contrat', () => {
    expect(SCENE_BACKDROP_TINT).toEqual({ black: '#000000', white: '#F5F5F4', indigo: '#312E81', sand: '#FDE68A' });
  });

  test('une valeur absente ou inconnue se relit « flou » et « ajuster »', () => {
    expect(sceneBackdropOf(undefined)).toBe('blur');
    expect(sceneBackdropOf('violet')).toBe('blur');
    expect(sceneBackdropOf('sand')).toBe('sand');
    expect(sceneFitModeOf(undefined)).toBe('fit');
    expect(sceneFitModeOf('stretch')).toBe('fit');
    expect(sceneFitModeOf('fill')).toBe('fill');
  });
});

describe('backgroundBackdrop — le fond choisi se relit sur le porteur de fond', () => {
  test('`transform.backdrop` du fond ⇒ ce fond', () => {
    expect(backgroundBackdrop(scene([object({ payload: { isBackground: true, transform: { videoFitMode: 'fit', backdrop: 'indigo' } } })]))).toBe(
      'indigo',
    );
  });

  test('absent ⇒ flou', () => {
    expect(backgroundBackdrop(scene([object({ payload: { isBackground: true, transform: { videoFitMode: 'fit' } } })]))).toBe('blur');
  });

  test('un fond posé sur un objet qui n’est PAS un fond ne compte pas', () => {
    expect(backgroundBackdrop(scene([object({ payload: { transform: { backdrop: 'black' } } })]))).toBe('blur');
  });
});
