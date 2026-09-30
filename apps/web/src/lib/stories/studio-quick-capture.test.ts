import { describe, expect, test } from 'bun:test';

import {
  cameraFlashPlan,
  cameraVideoMime,
  quickCaptureArmedTap,
  quickCaptureHintLines,
  quickCaptureOffered,
  quickCaptureRelease,
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

describe("quickCaptureHintLines — la photo en DEUX temps (#8711, jumelle web #8715)", () => {
  test('story et post : l’indication dit les deux temps de la photo, puis la vidéo', () => {
    expect(quickCaptureHintLines('POST')).toEqual(quickCaptureHintLines('STORY'));
    expect(quickCaptureHintLines('STORY')).toEqual([
      { glyph: 'viewfinder', key: 'story.studio.camera.quick.tapArm' },
      { glyph: 'camera', key: 'story.studio.camera.quick.tapAgain' },
      { glyph: 'video', key: 'story.studio.camera.quick.holdFilm' },
    ]);
  });

  test('un réel attend du mouvement : seule la vidéo est nommée', () => {
    expect(quickCaptureHintLines('REEL')).toEqual([{ glyph: 'video', key: 'story.studio.camera.quick.videoOnly' }]);
  });
});

describe('quickCaptureArmedTap — le second toucher, n’importe où sur le viseur armé (#8711)', () => {
  const armed = (overrides: Partial<Parameters<typeof quickCaptureArmedTap>[0]> = {}) =>
    quickCaptureArmedTap({ live: true, recording: false, busy: false, kind: 'STORY', ...overrides });

  test('viseur vivant, rien en cours, format photo : la photo part', () => {
    expect(armed()).toBe('take-photo');
    expect(armed({ kind: 'POST' })).toBe('take-photo');
  });

  const ignored: readonly (readonly [string, Partial<Parameters<typeof quickCaptureArmedTap>[0]>])[] = [
    ['un viseur qui ne voit pas encore', { live: false }],
    ['un film en cours', { recording: true }],
    ['une prise déjà en cours', { busy: true }],
    ['un réel, qui ne prend pas de photo', { kind: 'REEL' }],
  ];
  for (const [label, overrides] of ignored) {
    test(`ignoré avec ${label}`, () => {
      expect(armed(overrides)).toBe('ignore');
    });
  }
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
