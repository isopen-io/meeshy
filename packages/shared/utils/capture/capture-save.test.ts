import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CAPTURE_ZONES,
  applyFrameChange,
  applySaveFailed,
  applySaved,
  beginTake,
  captureDestination,
  saveButtonVisible,
  type CaptureDestination,
  type CaptureOrigin,
  type CaptureZone,
  type FrameChoice,
  type TakeSaveState,
} from './capture-save';

type Step =
  | { readonly op: 'save' }
  | { readonly op: 'saveFailed'; readonly frameId: FrameChoice }
  | { readonly op: 'frame'; readonly frameId: FrameChoice };

type Vectors = {
  readonly destinations: readonly { readonly zone: CaptureZone; readonly expected: CaptureDestination }[];
  readonly sequences: readonly {
    readonly name: string;
    readonly origin: CaptureOrigin;
    readonly steps: readonly Step[];
    readonly visible: readonly boolean[];
  }[];
};

const vectors = JSON.parse(
  readFileSync(resolve(__dirname, '../../fixtures/capture-save/capture-save.vectors.json'), 'utf8'),
) as Vectors;

const apply = (state: TakeSaveState, step: Step): TakeSaveState => {
  switch (step.op) {
    case 'save':
      return applySaved(state);
    case 'saveFailed':
      return applySaveFailed(state, step.frameId);
    case 'frame':
      return applyFrameChange(state, step.frameId);
  }
};

const replay = (origin: CaptureOrigin, steps: readonly Step[]): readonly boolean[] =>
  steps
    .reduce<readonly TakeSaveState[]>((states, step) => [...states, apply(states[states.length - 1], step)], [beginTake(origin)])
    .map(saveButtonVisible);

describe('la loi d’enregistrement d’une prise — directive porteur 2026-10-12 (#10284)', () => {
  it('une prise par la zone cadre part en galerie puis en retouche', () => {
    expect(captureDestination('frame')).toEqual({ gallery: true, then: 'edit', keptInApp: false });
  });

  it('une prise hors zone cadre va en retouche et reste dans l’app, jamais en galerie', () => {
    expect(captureDestination('outside')).toEqual({ gallery: false, then: 'edit', keptInApp: true });
  });

  it('les vecteurs couvrent chaque zone', () => {
    expect(vectors.destinations.map((d) => d.zone).sort()).toEqual([...CAPTURE_ZONES].sort());
  });

  it.each(vectors.destinations.map((d) => [d.zone, d] as const))('destination « %s » = vecteur', (_, d) => {
    expect(captureDestination(d.zone)).toEqual(d.expected);
  });

  it.each(vectors.sequences.map((s) => [s.name, s] as const))('%s', (_, sequence) => {
    expect(sequence.visible).toHaveLength(sequence.steps.length + 1);
    expect(replay(sequence.origin, sequence.steps)).toEqual(sequence.visible);
  });

  it('les transitions ne mutent jamais l’état reçu', () => {
    const start = beginTake({ zone: 'frame', frameId: 'or-royal' });
    const snapshot = JSON.stringify(start);
    applyFrameChange(start, 'argent');
    applySaved(applyFrameChange(start, 'argent'));
    applySaveFailed(start, 'or-royal');
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('réenregistrer avec le même cadre n’empile pas de doublon', () => {
    const twice = applySaved(applySaved(beginTake({ zone: 'outside', frameId: null })));
    expect(twice.savedWith).toEqual([null]);
  });
});
