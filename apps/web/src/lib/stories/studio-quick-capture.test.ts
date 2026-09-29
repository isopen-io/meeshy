import { describe, expect, test } from 'bun:test';

import {
  cameraFlashPlan,
  cameraVideoMime,
  quickCaptureHintKey,
  quickCaptureOffered,
  quickCaptureRelease,
  quickCaptureTap,
} from './studio-quick-capture';

const offered = (overrides: Partial<Parameters<typeof quickCaptureOffered>[0]> = {}) =>
  quickCaptureOffered({ pageBlank: true, toolOpen: false, timelineOpen: false, retouching: false, locked: false, cameraOpen: false, ...overrides });

/** LA CAPTURE RAPIDE SUR UNE SCÈNE VIDE (#8654, jumelle de #8653). */
describe('quickCaptureOffered — le geste n’existe que sur une scène vide', () => {
  test('scène vide, rien d’ouvert : offert', () => {
    expect(offered()).toBe(true);
  });

  const refusals: readonly (readonly [string, Partial<Parameters<typeof quickCaptureOffered>[0]>])[] = [
    ['une scène qui porte quelque chose', { pageBlank: false }],
    ['un outil ouvert', { toolOpen: true }],
    ['la frise ouverte', { timelineOpen: true }],
    ['une retouche d’image', { retouching: true }],
    ['l’envoi en cours', { locked: true }],
    ['la caméra déjà ouverte', { cameraOpen: true }],
  ];
  for (const [label, overrides] of refusals) {
    test(`refusé avec ${label}`, () => {
      expect(offered(overrides)).toBe(false);
    });
  }
});

describe('quickCaptureTap / quickCaptureHintKey — un geste, une intention', () => {
  test('story et post : le toucher ouvre ET prend la photo', () => {
    expect(quickCaptureTap('STORY')).toBe('photo');
    expect(quickCaptureTap('POST')).toBe('photo');
    expect(quickCaptureHintKey('STORY')).toBe('story.studio.camera.quick.photoOrVideo');
  });

  test('un réel attend du mouvement : le toucher ouvre sans rien prendre', () => {
    expect(quickCaptureTap('REEL')).toBe('arm');
    expect(quickCaptureHintKey('REEL')).toBe('story.studio.camera.quick.videoOnly');
  });
});

describe('quickCaptureRelease — relâcher l’appui long', () => {
  test('pendant le film : la prise se clôt et se pose', () => {
    expect(quickCaptureRelease({ recording: true })).toBe('close-take');
  });

  test('avant que la caméra filme : rien n’est pris', () => {
    expect(quickCaptureRelease({ recording: false })).toBe('cancel-pending');
  });
});

describe('cameraFlashPlan — le flash fait vraiment de la lumière', () => {
  test('flash coupé : rien', () => {
    expect(cameraFlashPlan({ flash: false, facing: 'user', torch: false })).toBe('off');
    expect(cameraFlashPlan({ flash: false, facing: 'environment', torch: true })).toBe('off');
  });

  test('caméra avant : le sol devient blanc', () => {
    expect(cameraFlashPlan({ flash: true, facing: 'user', torch: true })).toBe('screen');
  });

  test('caméra arrière : la torche quand le matériel la sert, sinon le sol blanc', () => {
    expect(cameraFlashPlan({ flash: true, facing: 'environment', torch: true })).toBe('torch');
    expect(cameraFlashPlan({ flash: true, facing: 'environment', torch: false })).toBe('screen');
  });
});

describe('cameraVideoMime — un conteneur que la passerelle accepte', () => {
  test('mp4 d’abord (WebKit), webm ensuite (Chromium)', () => {
    expect(cameraVideoMime(() => true)).toBe('video/mp4');
    expect(cameraVideoMime((type) => type.startsWith('video/webm'))).toBe('video/webm;codecs=vp9,opus');
    expect(cameraVideoMime((type) => type === 'video/webm')).toBe('video/webm');
  });

  test('aucun conteneur servi : le défaut du navigateur', () => {
    expect(cameraVideoMime(() => false)).toBeUndefined();
  });
});
