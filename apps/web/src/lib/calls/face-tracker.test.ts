import { describe, expect, test } from 'bun:test';

import { heuristicFaceBox, smoothFaceBox } from './face-effects';
import { browserResize, createFaceTracker, detectFace, faceDetectorOf, type FaceDetectorPort } from './face-tracker';

/**
 * LE VISAGE, IMAGE APRÈS IMAGE (#8551, #8552) — le détecteur du navigateur
 * quand il existe, une image sur cinq, sa réponse lissée ; sinon, ou s'il
 * échoue, la boîte supposée. Jamais d'attente : l'image courante se dessine
 * avec ce qu'on sait déjà.
 */

const frame = { width: 1280, height: 720 };
const source = {} as CanvasImageSource;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const detectorAt = (box: { x: number; y: number; width: number; height: number }) => {
  const calls: number[] = [];
  const port: FaceDetectorPort = {
    detect: async () => {
      calls.push(1);
      return [{ boundingBox: box }];
    },
  };
  return { port, calls };
};

describe('sans détecteur', () => {
  test('la boîte supposée, au centre', () => {
    const tracker = createFaceTracker(null);
    expect(tracker.next(source, frame, 0)).toEqual(heuristicFaceBox(frame));
  });

  test('le navigateur sans FaceDetector n’en offre aucun', () => {
    expect(faceDetectorOf({})).toBeNull();
  });
});

describe('avec détecteur', () => {
  test('il ne tourne qu’une image sur cinq, jamais deux fois à la fois, et la boîte glisse vers ce qu’il a vu', async () => {
    const seen = { x: 100, y: 80, width: 200, height: 260 };
    const detector = detectorAt(seen);
    const tracker = createFaceTracker(detector.port);
    const first = tracker.next(source, frame, 0);
    await flush();
    const moves = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((index) => tracker.next(source, frame, index));
    await flush();
    expect(detector.calls).toHaveLength(2);
    expect((moves.at(-1)?.x ?? 0) < first.x).toBe(true);
  });

  test('un échec du détecteur retombe sur la boîte supposée', async () => {
    const tracker = createFaceTracker({ detect: async () => Promise.reject(new Error('busy')) });
    tracker.next(source, frame, 0);
    await flush();
    expect(tracker.next(source, frame, 1)).toEqual(heuristicFaceBox(frame));
  });

  test('une capture demande le visage une fois ; sans visage vu, la boîte supposée', async () => {
    const seen = { x: 10, y: 20, width: 30, height: 40 };
    expect(await detectFace(detectorAt(seen).port, source, frame)).toEqual(seen);
    expect(await detectFace({ detect: async () => [] }, source, frame)).toEqual(heuristicFaceBox(frame));
    expect(await detectFace(null, source, frame)).toEqual(heuristicFaceBox(frame));
  });
});

describe('sur une image réduite (#9100)', () => {
  test('le détecteur lit une image de 320 px de large, et la boîte revient à l’échelle de l’image', async () => {
    const reduced = { tag: 'reduced' } as unknown as CanvasImageSource;
    const widths: number[] = [];
    let closed = 0;
    const read: CanvasImageSource[] = [];
    const tracker = createFaceTracker(
      {
        detect: async (image) => {
          read.push(image);
          return [{ boundingBox: { x: 100, y: 40, width: 50, height: 60 } }];
        },
      },
      {
        resize: async (_image, { to }) => {
          widths.push(to);
          return { image: reduced, width: to, close: () => void (closed += 1) };
        },
      },
    );
    tracker.next(source, frame, 0);
    await flush();
    await flush();
    const box = tracker.next(source, frame, 1);
    expect(widths).toEqual([320]);
    expect(read).toEqual([reduced]);
    expect(closed).toBe(1);
    expect(box).toEqual(smoothFaceBox(heuristicFaceBox(frame), { x: 400, y: 160, width: 200, height: 240 }));
  });

  test('une image déjà petite part telle quelle', async () => {
    const widths: number[] = [];
    const tracker = createFaceTracker({ detect: async () => [] }, { resize: async (image, { from, to }) => (widths.push(to), { image, width: from, close: () => undefined }) });
    tracker.next(source, { width: 320, height: 240 }, 0);
    await flush();
    expect(widths).toEqual([]);
  });
});

describe('la réduction du navigateur (#9100)', () => {
  test('sans createImageBitmap, l’image part telle quelle, à sa largeur', async () => {
    const reduced = await browserResize({})(source, { from: 1280, to: 320 });
    expect(reduced.image).toBe(source);
    expect(reduced.width).toBe(1280);
  });

  test('avec createImageBitmap, une image de 320 px de large, rendue à la fermeture', async () => {
    const asked: unknown[] = [];
    let closed = false;
    const reduced = await browserResize({
      createImageBitmap: async (_image, options) => {
        asked.push(options);
        return { width: 320, height: 180, close: () => void (closed = true) } as unknown as ImageBitmap;
      },
    })(source, { from: 1280, to: 320 });
    expect(asked).toEqual([{ resizeWidth: 320, resizeQuality: 'low' }]);
    expect(reduced.width).toBe(320);
    reduced.close();
    expect(closed).toBe(true);
  });
});
