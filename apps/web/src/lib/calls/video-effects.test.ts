import { describe, expect, test } from 'bun:test';

import { blurCapable, blurOffered, cameraBlur, colorPipelineSupported, effectsFilter, effectsOffered, effectsUsedOf, FACE_EFFECTS, frameSettings, needsFramePipeline, needsFrames, NO_EFFECTS, segmentationSupported, setVideoEffects, VIDEO_PRESETS, videoEffectsStore, type VideoEffects } from './video-effects';

/**
 * LES EFFETS DE MA VIDÉO (#8442) — les règles, sans DOM : ce qu'un préréglage
 * et la luminosité font à l'image, quand un traitement est nécessaire, ce que
 * le navigateur sait faire, et ce que l'analytique retient.
 */

const effects = (overrides: Partial<VideoEffects> = {}): VideoEffects => ({ ...NO_EFFECTS, ...overrides });

describe('les préréglages', () => {
  test('cinq préréglages, dans l’ordre d’iOS : naturel, chaud, froid, vif, doux', () => {
    expect(VIDEO_PRESETS).toEqual(['natural', 'warm', 'cool', 'vivid', 'muted']);
  });

  test('naturel, luminosité neutre : aucun filtre, aucun traitement', () => {
    expect(effectsFilter(NO_EFFECTS)).toBe('none');
    expect(needsFramePipeline(NO_EFFECTS)).toBe(false);
  });

  test('chaque autre préréglage a SON filtre, distinct des autres', () => {
    const filters = VIDEO_PRESETS.filter((preset) => preset !== 'natural').map((preset) => effectsFilter(effects({ preset })));
    expect(filters.every((filter) => filter !== 'none')).toBe(true);
    expect(new Set(filters).size).toBe(filters.length);
  });

  test('la luminosité s’ajoute au préréglage, et se borne à ±50 %', () => {
    expect(effectsFilter(effects({ brightness: 0.2 }))).toBe('brightness(1.2)');
    expect(effectsFilter(effects({ brightness: 3 }))).toBe('brightness(1.5)');
    expect(effectsFilter(effects({ brightness: -3 }))).toBe('brightness(0.5)');
    expect(effectsFilter(effects({ preset: 'vivid', brightness: 0.1 }))).toMatch(/ brightness\(1\.1\)$/);
  });

  test('seul le flou ne demande pas de traitement de couleur (il se fait à la source)', () => {
    expect(needsFramePipeline(effects({ blur: true }))).toBe(false);
    expect(needsFramePipeline(effects({ preset: 'warm' }))).toBe(true);
    expect(needsFramePipeline(effects({ brightness: -0.1 }))).toBe(true);
  });
});

describe('les effets de visage (#8551)', () => {
  test('six choix, dans l’ordre partagé avec iOS : aucun, lissage, crapaud, ange, démon, éruption', () => {
    expect(FACE_EFFECTS).toEqual(['none', 'smoothing', 'toad', 'angel', 'demon', 'volcano']);
    expect(NO_EFFECTS.faceEffect).toBe('none');
  });

  test('un effet de visage demande le traitement des images, même en couleur naturelle', () => {
    expect(needsFramePipeline(effects({ faceEffect: 'volcano' }))).toBe(true);
    expect(effectsFilter(effects({ faceEffect: 'volcano' }))).toBe('none');
  });

  test('changer d’effet garde la couleur et la luminosité choisies', () => {
    videoEffectsStore.setState({ effects: effects({ preset: 'warm', brightness: 0.2 }) });
    setVideoEffects({ faceEffect: 'angel' });
    expect(videoEffectsStore.getState().effects).toEqual(effects({ preset: 'warm', brightness: 0.2, faceEffect: 'angel' }));
    videoEffectsStore.setState({ effects: NO_EFFECTS });
  });
});

describe('ce que le navigateur sait faire', () => {
  const canvasWithFilter = { getContext: () => ({ filter: 'none' }) };

  test('le traitement de couleur demande des images traitables ET un filtre de canevas', () => {
    expect(colorPipelineSupported({ MediaStreamTrackProcessor: class {}, MediaStreamTrackGenerator: class {}, OffscreenCanvas: class {}, createCanvas: () => canvasWithFilter })).toBe(true);
    expect(colorPipelineSupported({ createCanvas: () => ({ getContext: () => ({ filter: 'none' }), captureStream: () => ({}) }) })).toBe(true);
    expect(colorPipelineSupported({ createCanvas: () => ({ getContext: () => ({}), captureStream: () => ({}) }) })).toBe(false);
    expect(colorPipelineSupported({ createCanvas: () => ({ getContext: () => ({ filter: 'none' }) }) })).toBe(false);
  });

  test('le flou d’arrière-plan natif se lit dans les capacités de la caméra', () => {
    const cameraWith = (backgroundBlur: unknown) => ({ getCapabilities: () => ({ backgroundBlur }) }) as unknown as MediaStreamTrack;
    expect(blurCapable(cameraWith([false, true]))).toBe(true);
    expect(blurCapable(cameraWith([false]))).toBe(false);
    expect(blurCapable(cameraWith(undefined))).toBe(false);
    expect(blurCapable({} as MediaStreamTrack)).toBe(false);
    expect(blurCapable(null)).toBe(false);
  });

  test('« Effets » n’existe que si l’un des deux est possible', () => {
    expect(effectsOffered({ color: false, blur: false })).toBe(false);
    expect(effectsOffered({ color: true, blur: false })).toBe(true);
    expect(effectsOffered({ color: false, blur: true })).toBe(true);
  });
});

describe('ce que le traitement des images reçoit (#8471, #8441)', () => {
  test('le flou se fait à la source quand la caméra l’offre : aucune image à traiter', () => {
    const settings = frameSettings(effects({ blur: true }), { nativeBlur: true, zoom: 1 });
    expect(settings.segmentBlur).toBe(false);
    expect(needsFrames(settings)).toBe(false);
  });

  test('sans flou de caméra, le flou se fait par segmentation : les images passent par le traitement', () => {
    const settings = frameSettings(effects({ blur: true }), { nativeBlur: false, zoom: 1 });
    expect(settings.segmentBlur).toBe(true);
    expect(needsFrames(settings)).toBe(true);
  });

  test('le zoom numérique recadre l’image envoyée : au-delà de 1×, les images passent par le traitement', () => {
    expect(needsFrames(frameSettings(NO_EFFECTS, { nativeBlur: false, zoom: 2 }))).toBe(true);
    expect(needsFrames(frameSettings(NO_EFFECTS, { nativeBlur: false, zoom: 1 }))).toBe(false);
  });

  test('naturel, sans visage, sans flou ni zoom : la caméra part brute', () => {
    expect(needsFrames(frameSettings(NO_EFFECTS, { nativeBlur: false, zoom: 1 }))).toBe(false);
    expect(needsFrames(frameSettings(effects({ preset: 'warm' }), { nativeBlur: false, zoom: 1 }))).toBe(true);
  });

  test('un zoom hors bornes se ramène à 1× au moins', () => {
    expect(frameSettings(NO_EFFECTS, { nativeBlur: false, zoom: 0.4 }).zoom).toBe(1);
    expect(frameSettings(NO_EFFECTS, { nativeBlur: false, zoom: Number.NaN }).zoom).toBe(1);
  });
});

describe('le flou offert (#8471)', () => {
  const cameraWith = (backgroundBlur: unknown) => ({ getCapabilities: () => ({ backgroundBlur }) }) as unknown as MediaStreamTrack;
  const able = { MediaStreamTrackProcessor: class {}, MediaStreamTrackGenerator: class {}, OffscreenCanvas: class {}, Worker: class {}, WebAssembly: {}, createCanvas: () => ({ getContext: (kind: string) => (kind === 'webgl2' ? {} : { filter: 'none' }) }) };

  test('le flou natif de la caméra se lit dans ses capacités', () => {
    expect(cameraBlur(cameraWith([false, true]))).toBe(true);
    expect(cameraBlur(cameraWith([false]))).toBe(false);
    expect(cameraBlur(null)).toBe(false);
  });

  test('il est offert par la caméra, sinon par la segmentation', () => {
    expect(blurOffered(cameraWith([false, true]), false)).toBe(true);
    expect(blurOffered(cameraWith([false]), true)).toBe(true);
    expect(blurOffered(cameraWith([false]), false)).toBe(false);
    expect(blurOffered(null, true)).toBe(false);
  });

  test('la segmentation demande un traitement des images, un worker, WebAssembly et WebGL2', () => {
    expect(segmentationSupported(able)).toBe(true);
    expect(segmentationSupported({ ...able, Worker: undefined })).toBe(false);
    expect(segmentationSupported({ ...able, WebAssembly: undefined })).toBe(false);
    expect(segmentationSupported({ ...able, createCanvas: () => ({ getContext: (kind: string) => (kind === 'webgl2' ? null : { filter: 'none' }) }) })).toBe(false);
    expect(segmentationSupported({ ...able, MediaStreamTrackProcessor: undefined })).toBe(false);
  });
});

describe('ce que l’analytique retient', () => {
  test('rien quand rien n’est actif', () => {
    expect(effectsUsedOf(NO_EFFECTS)).toEqual([]);
  });

  test('le préréglage, la luminosité et le flou, nommés', () => {
    expect(effectsUsedOf(effects({ preset: 'warm', brightness: 0.1, blur: true }))).toEqual(['filter:warm', 'brightness', 'background-blur']);
  });

  test('l’effet de visage, nommé par son identifiant', () => {
    expect(effectsUsedOf(effects({ faceEffect: 'demon' }))).toEqual(['face:demon']);
    expect(effectsUsedOf(effects({ faceEffect: 'smoothing', preset: 'cool' }))).toEqual(['filter:cool', 'face:smoothing']);
  });
});
