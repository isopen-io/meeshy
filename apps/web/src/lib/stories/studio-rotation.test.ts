import { describe, expect, test } from 'bun:test';

import { buildPreviewCanvasDocument } from './story-document';
import { studioBackgroundToolActions } from './studio-background-tools';
import { studioCompositePlan } from './studio-composite-plan';
import { emptyStudioPage, pageWithBackgroundTurned, pageWithVisual, type StudioPage, type StudioVisualAsset } from './studio-page';
import { IDENTITY_POSE } from './studio-pose';
import { renderStudioRetouch, studioRetouchSize } from './studio-retouch';
import { studioRetouchReturn } from './studio-retouch-finish';

/**
 * UNE PIÈCE RETOUCHÉE PIVOTE (#9160, miroir de « Pivoter » —
 * `ComposerMediaActionRow`, `StoryMediaRotation.turned` iOS) : un quart de
 * tour dans le sens du glyphe ⟲ (antihoraire), écrit en degrés de [0, 360) ;
 * la scène le montre et « Terminé » le cuit dans la pièce, image et vidéo.
 */
const photo = (overrides: Partial<StudioVisualAsset> = {}): StudioVisualAsset => ({
  previewUrl: 'blob:photo',
  mediaType: 'image',
  upload: { phase: 'uploading', progress: 0 },
  caption: '',
  pose: IDENTITY_POSE,
  aspectRatio: 4 / 3,
  ...overrides,
});

const pageOf = (asset: StudioVisualAsset): StudioPage => pageWithVisual(emptyStudioPage('page-1', 'text-1', 'fr'), 'visual', asset);

describe('le quart de tour', () => {
  test('quatre touchers font le tour, dans le sens d’iOS : 270, 180, 90, puis rien', () => {
    const turns = [1, 2, 3, 4].map((count) => Array.from({ length: count }).reduce<StudioPage>((page) => pageWithBackgroundTurned(page), pageOf(photo())).background?.rotation);
    expect(turns).toEqual([270, 180, 90, undefined]);
  });

  test('sans fond, rien ne pivote', () => {
    const page = emptyStudioPage('page-1', 'text-1', 'fr');
    expect(pageWithBackgroundTurned(page)).toBe(page);
  });

  test('la retouche sert « Pivoter » à côté de « Retirer », image comme vidéo', () => {
    expect(studioBackgroundToolActions({ offersPhoto: true, overlayFree: true, retouching: true })).toEqual(['rotate', 'remove']);
    expect(studioBackgroundToolActions({ offersPhoto: true, overlayFree: true, retouching: false })).not.toContain('rotate');
  });
});

describe('le rendu de la pièce pivotée', () => {
  test('un 4:3 pivoté se pose debout (3:4) dans la carte, et se peint tourné', () => {
    const plan = studioCompositePlan(pageWithBackgroundTurned(pageOf(photo())));
    const net = plan?.filter((op) => op.kind === 'image').at(-1);
    expect(net).toMatchObject({ rotation: 270 });
    if (net?.kind !== 'image') throw new Error('pas d’image');
    const card = 9 / 16;
    const shownWidth = net.height / card;
    const shownHeight = net.width * card;
    expect(shownWidth).toBeCloseTo(1, 6);
    expect(shownHeight).toBeCloseTo(0.75, 6);
    expect((net.width * 1080) / (net.height * 1920)).toBeCloseTo(4 / 3, 6);
  });

  test('une VIDÉO pivotée se repeint tournée à chaque image du rendu', () => {
    const video = pageWithBackgroundTurned(pageOf(photo({ mediaType: 'video', previewUrl: 'blob:video', aspectRatio: 16 / 9 })));
    const net = studioCompositePlan(video, { video: true })?.filter((op) => op.kind === 'image').at(-1);
    expect(net).toMatchObject({ src: 'blob:video', rotation: 270 });
  });

  test('un demi-tour garde ses proportions', () => {
    const turned = pageWithBackgroundTurned(pageWithBackgroundTurned(pageOf(photo())));
    const net = studioCompositePlan(turned)?.filter((op) => op.kind === 'image').at(-1);
    expect(net).toMatchObject({ rotation: 180, width: 1 });
  });

  test('une image recadrée PUIS pivotée repart au cadre pivoté', () => {
    const page = pageWithBackgroundTurned(pageOf(photo({ crop: { x: 0, y: 0, width: 0.5, height: 1 } })));
    expect(studioRetouchSize(page)).toEqual({ width: 1920, height: 1280 });
  });

  test('« Terminé » peint le fond tourné d’un quart', async () => {
    const turns: number[] = [];
    const context = {
      fillStyle: '',
      filter: 'none',
      font: '',
      textAlign: 'center',
      textBaseline: 'middle',
      fillRect: () => undefined,
      drawImage: () => undefined,
      fillText: () => undefined,
      measureText: () => ({ width: 0 }),
      save: () => undefined,
      restore: () => undefined,
      translate: () => undefined,
      rotate: (angle: number) => turns.push(angle),
      scale: () => undefined,
      getImageData: () => ({ data: new Uint8ClampedArray(0) }),
    } as unknown as CanvasRenderingContext2D;
    await renderStudioRetouch(pageWithBackgroundTurned(pageOf(photo())), {
      createCanvas: () => ({ context, toBlob: async (type) => new Blob(['jpeg'], { type }) }),
      loadImage: async () => ({ naturalWidth: 400, naturalHeight: 300 }) as unknown as CanvasImageSource,
    });
    expect(turns.some((angle) => Math.abs(angle - (270 * Math.PI) / 180) < 1e-9)).toBe(true);
  });

  test('une pièce seulement pivotée n’est pas intacte : elle se rend', () => {
    const taken = new File([new Uint8Array([1])], 'prise.jpg', { type: 'image/jpeg' });
    const page = pageWithBackgroundTurned(pageOf(photo({ file: taken })));
    expect(studioRetouchReturn({ capturing: true, page, original: taken })).toBe('render-image');
  });

  test('l’aperçu de la scène porte la rotation du fond, là où iOS la lit (transform.rotation)', () => {
    const document = buildPreviewCanvasDocument({ texts: [], background: { source: 'blob:photo', mediaType: 'image', aspectRatio: 4 / 3, rotation: 270 } });
    const background = document?.scenes[0]?.objects.find((object) => object.id === 'background');
    expect(background?.transform.rotation).toBe(270);
  });
});
