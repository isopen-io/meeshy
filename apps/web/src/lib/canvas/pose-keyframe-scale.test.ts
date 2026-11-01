import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { CanvasKeyframe, CanvasObject } from './document';
import { objectPose } from './pose';

/**
 * L'échelle d'une image clé MULTIPLIE celle de l'objet (#14316). iOS et Android
 * rejouent le MÊME fichier : une plateforme ne peut pas relire une story animée
 * autrement que son auteur sans qu'un témoin rougisse.
 */
type Vector = {
  readonly _label: string;
  readonly objectScale: number;
  readonly startTime: number;
  readonly at: number;
  readonly keyframes: readonly CanvasKeyframe[];
  readonly renderedScale: number;
};

const FILE = fileURLToPath(new URL('../../../../../packages/shared/fixtures/keyframe-scale.vectors.json', import.meta.url));
const vectors = (JSON.parse(readFileSync(FILE, 'utf8')) as { readonly vectors: readonly Vector[] }).vectors;

const objectOf = (vector: Vector): CanvasObject => ({
  id: 'o1',
  kind: 'text',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'content',
  z: 0,
  transform: { scale: vector.objectScale, rotation: 0, opacity: 1 },
  timing: { start: vector.startTime, keyframes: vector.keyframes },
  payload: {},
});

describe("objectPose — l'échelle d'une image clé multiplie celle de l'objet (#14316)", () => {
  test('le fichier partagé est lu et couvre le facteur interpolé', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(9);
    expect(vectors.some((v) => v.keyframes.length >= 2)).toBe(true);
  });

  for (const vector of vectors) {
    test(vector._label, () => {
      expect(objectPose(objectOf(vector), vector.at).scale).toBeCloseTo(vector.renderedScale, 9);
    });
  }
});
