/**
 * Vecteurs inter-plateformes pour `resolveRiverStep` — la navigation à deux
 * axes de la Rivière (amendement R2, directive produit du 2026-08-17).
 *
 * Fixtures : `packages/shared/fixtures/reading-modes/river-step.vectors.json`,
 * générées en EXÉCUTANT la loi (C-023). Chaque cas porte la conversation
 * ENTIÈRE (`input.lanes`) plutôt qu'une géométrie figée : le vecteur prouve
 * ainsi la CHAÎNE `resolveRiverLanes` → `resolveRiverStep`, celle que les
 * miroirs plateforme doivent reproduire de bout en bout.
 *
 * Témoins de couverture (leçon 257) : les quatre directions et les trois
 * verdicts doivent être exercés, et l'enjambement d'une branche morte —
 * l'affordance propre à cette vue — doit être prouvé par un saut de colonne
 * de plus d'un cran.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveRiverLanes,
  resolveRiverStep,
  type ResolveRiverLanesInput,
  type RiverCursor,
  type RiverStep,
  type RiverStepDirection,
} from '../../utils/river-lanes.js';
import { loadVectors, runVectors } from './harness.js';

type RiverStepVectorInput = {
  readonly lanes: ResolveRiverLanesInput;
  readonly cursor: RiverCursor;
  readonly direction: RiverStepDirection;
};

const step = (input: RiverStepVectorInput): RiverStep =>
  resolveRiverStep({
    geometry: resolveRiverLanes(input.lanes),
    cursor: input.cursor,
    direction: input.direction,
  });

runVectors<RiverStepVectorInput, RiverStep>('river-step', step);

const vectors = loadVectors<RiverStepVectorInput, RiverStep>('river-step');

describe('vectors: river-step — couverture des deux axes', () => {
  it('exerce les quatre directions', () => {
    const directions = new Set(vectors.map((vector) => vector.input.direction));
    expect(directions).toEqual(new Set(['left', 'right', 'up', 'down']));
  });

  it('exerce les trois verdicts — `moved`, `edge`, `empty`', () => {
    const reasons = new Set(vectors.map((vector) => vector.expected.reason));
    expect(reasons).toEqual(new Set(['moved', 'edge', 'empty']));
  });

  it('exerce l’enjambement : un pas latéral qui franchit plus d’une colonne', () => {
    const jumps = vectors.filter(
      (vector) =>
        (vector.input.direction === 'left' || vector.input.direction === 'right') &&
        vector.expected.reason === 'moved' &&
        Math.abs(vector.expected.cursor.laneIndex - vector.input.cursor.laneIndex) > 1,
    );

    expect(jumps.length).toBeGreaterThan(0);
  });

  it('exerce le suivi d’une personne par-dessus la mort de sa branche', () => {
    const acrossDeath = vectors.filter((vector) => {
      if (vector.input.direction !== 'down' || vector.expected.reason !== 'moved') return false;
      const geometry = resolveRiverLanes(vector.input.lanes);
      const lane = geometry.lanes.find(
        (candidate) => candidate.laneIndex === vector.input.cursor.laneIndex,
      );
      return (lane?.spans.length ?? 0) > 1;
    });

    expect(acrossDeath.length).toBeGreaterThan(0);
  });

  it('tient l’invariant du sur-place : `edge` et `empty` ne déplacent JAMAIS le curseur', () => {
    vectors
      .filter((vector) => vector.expected.reason !== 'moved')
      .forEach((vector) => {
        expect(vector.expected.cursor).toEqual(vector.input.cursor);
      });
  });

  it('tient l’invariant d’axe : un pas latéral ne change pas d’instant, un pas vertical ne change pas de couloir', () => {
    vectors
      .filter((vector) => vector.expected.reason === 'moved')
      .forEach((vector) => {
        const isHorizontal = vector.input.direction === 'left' || vector.input.direction === 'right';
        if (isHorizontal) {
          expect(vector.expected.cursor.laneIndex).not.toBe(vector.input.cursor.laneIndex);
        } else {
          expect(vector.expected.cursor.laneIndex).toBe(vector.input.cursor.laneIndex);
        }
      });
  });
});
