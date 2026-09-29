import { describe, expect, test } from 'bun:test';

import { heuristicFaceBox } from './face-effects';
import { createFaceTracker, detectFace, faceDetectorOf, type FaceDetectorPort } from './face-tracker';

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
