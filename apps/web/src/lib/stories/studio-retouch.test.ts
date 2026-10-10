import { describe, expect, test } from 'bun:test';

import { STUDIO_RETOUCH_SIZE, renderStudioRetouch, retouchedFileName, studioTextOps } from './studio-retouch';
import { emptyStudioPage, pageWithText, pageWithVisual, type StudioVisualAsset } from './studio-page';
import { IDENTITY_POSE } from './studio-pose';

const asset = (overrides: Partial<StudioVisualAsset> = {}): StudioVisualAsset => ({
  previewUrl: 'blob:photo',
  mediaType: 'image',
  upload: { phase: 'uploading', progress: 0 },
  caption: '',
  pose: IDENTITY_POSE,
  aspectRatio: 4 / 3,
  ...overrides,
});

/** Un canvas FACTICE qui journalise ce qu'on lui demande de peindre. */
function recordingCanvas() {
  const calls: string[] = [];
  const context = {
    fillStyle: '',
    filter: 'none',
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    fillRect: () => calls.push('fillRect'),
    drawImage: () => calls.push('drawImage'),
    fillText: (text: string) => calls.push(`fillText:${text}`),
    measureText: (text: string) => ({ width: text.length * 10 }),
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    scale: () => undefined,
    getImageData: () => ({ data: new Uint8ClampedArray(0) }),
  } as unknown as CanvasRenderingContext2D;
  return { calls, context };
}

/** LA RETOUCHE D'UNE IMAGE DU FIL (#8416) — « Terminé » rend la scène entière,
 * à sa taille réelle, en JPEG. */
describe('renderStudioRetouch', () => {
  test('la taille réelle d’une scène 9:16, grand côté 1920', () => {
    expect(STUDIO_RETOUCH_SIZE).toEqual({ width: 1080, height: 1920 });
  });

  test('peint le fond, puis les TEXTES par-dessus, et rend un JPEG', async () => {
    const { calls, context } = recordingCanvas();
    const page = pageWithText(pageWithVisual(emptyStudioPage('page-1', 'text-1', 'fr'), 'visual', asset()), 'text-1', 'Salut');
    let asked: { type: string; quality: number } | null = null;
    const blob = await renderStudioRetouch(page, {
      createCanvas: () => ({
        context,
        toBlob: async (type, quality) => {
          asked = { type, quality };
          return new Blob(['jpeg'], { type });
        },
      }),
      loadImage: async () => ({}) as CanvasImageSource,
    });
    expect(blob?.type).toBe('image/jpeg');
    expect(asked).toEqual({ type: 'image/jpeg', quality: 0.9 });
    expect(calls.indexOf('fillText:Salut')).toBeGreaterThan(calls.lastIndexOf('drawImage'));
  });

  test('une image RECADRÉE repart au cadre de son recadrage, ses pixels gardés seuls (#9136)', async () => {
    const { context } = recordingCanvas();
    const drawn: number[][] = [];
    (context as unknown as { drawImage: (...args: unknown[]) => void }).drawImage = (_image, ...rest) => drawn.push(rest as number[]);
    let size: readonly number[] = [];
    const crop = { x: 0.125, y: 0, width: 0.75, height: 1 };
    const page = pageWithVisual(emptyStudioPage('page-1', 'text-1', 'fr'), 'visual', asset({ crop }));
    await renderStudioRetouch(page, {
      createCanvas: (width, height) => {
        size = [width, height];
        return { context, toBlob: async (type) => new Blob(['jpeg'], { type }) };
      },
      loadImage: async () => ({ naturalWidth: 400, naturalHeight: 300 }) as unknown as CanvasImageSource,
    });
    expect(size).toEqual([1920, 1920]);
    const net = drawn.find((args) => args.length === 8);
    expect(net?.slice(0, 4)).toEqual([50, 0, 300, 300]);
  });

  test('sans canvas, aucun rendu inventé', async () => {
    const page = pageWithVisual(emptyStudioPage('page-1', 'text-1', 'fr'), 'visual', asset());
    expect(await renderStudioRetouch(page, { createCanvas: () => null, loadImage: async () => null })).toBeNull();
  });
});

describe('studioTextOps — un texte écrit, à sa pose, dans son style', () => {
  test('un texte vide ne se peint pas ; un texte écrit garde sa couleur et sa pose', () => {
    expect(studioTextOps(emptyStudioPage('page-1', 'text-1', 'fr'))).toEqual([]);
    const [op] = studioTextOps(pageWithText(emptyStudioPage('page-1', 'text-1', 'fr'), 'text-1', 'Salut'));
    expect(op).toMatchObject({ text: 'Salut', x: 0.5, y: 0.5, color: '#FFFFFF' });
  });
});

describe('retouchedFileName', () => {
  test('garde le nom, marque la retouche, finit en .jpg', () => {
    expect(retouchedFileName('vacances.PNG')).toBe('vacances-retouche.jpg');
    expect(retouchedFileName('sans-extension')).toBe('sans-extension-retouche.jpg');
  });
});

describe('une image pas encore mesurée se mesure au rendu', () => {
  test('le rapport se relit sur l’image décodée', async () => {
    const { aspectRatio: _unmeasured, ...unmeasured } = asset();
    const page = pageWithVisual(emptyStudioPage('page-1', 'text-1', 'fr'), 'visual', unmeasured);
    const blob = await renderStudioRetouch(page, {
      createCanvas: () => ({ context: recordingCanvas().context, toBlob: async (type) => new Blob(['x'], { type }) }),
      loadImage: async () => ({ naturalWidth: 4, naturalHeight: 3 }) as unknown as CanvasImageSource,
    });
    expect(blob).not.toBeNull();
  });
});
