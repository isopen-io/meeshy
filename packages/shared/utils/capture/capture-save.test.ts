import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CAPTURE_ZONES,
  applyFormatChange,
  applyFrameChange,
  applySaveFailed,
  applySaved,
  beginTake,
  captureDestination,
  saveButtonVisible,
  type CaptureDestination,
  type CaptureFormat,
  type CaptureOrigin,
  type CaptureZone,
  type FrameChoice,
  type TakeSaveState,
} from './capture-save';

type Step =
  | { readonly op: 'save' }
  | { readonly op: 'saveFailed'; readonly frameId: FrameChoice; readonly format: CaptureFormat }
  | { readonly op: 'frame'; readonly frameId: FrameChoice }
  | { readonly op: 'format'; readonly format: CaptureFormat };

type Vectors = {
  readonly destinations: readonly {
    readonly zone: CaptureZone;
    readonly savesOriginal: boolean;
    readonly expected: CaptureDestination;
  }[];
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
      return applySaveFailed(state, { frameId: step.frameId, format: step.format });
    case 'frame':
      return applyFrameChange(state, step.frameId);
    case 'format':
      return applyFormatChange(state, step.format);
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

  it('par défaut, une prise hors zone cadre va en retouche et reste dans l’app', () => {
    expect(captureDestination('outside')).toEqual({ gallery: false, then: 'edit', keptInApp: true });
    expect(captureDestination('outside', { savesOriginal: false })).toEqual({ gallery: false, then: 'edit', keptInApp: true });
  });

  it('Réglages › Médias « enregistrer l’original » activé : une prise hors cadre met son original dans la galerie (correction porteur 2026-10-12)', () => {
    expect(captureDestination('outside', { savesOriginal: true })).toEqual({ gallery: true, then: 'edit', keptInApp: false });
  });

  it('une prise par le cadre part en galerie quel que soit le réglage de l’original', () => {
    expect(captureDestination('frame', { savesOriginal: false })).toEqual({ gallery: true, then: 'edit', keptInApp: false });
    expect(captureDestination('frame', { savesOriginal: true })).toEqual({ gallery: true, then: 'edit', keptInApp: false });
  });

  it('les vecteurs couvrent chaque zone, réglage de l’original activé et désactivé', () => {
    const covered = vectors.destinations.map((d) => `${d.zone}:${d.savesOriginal}`).sort();
    expect(covered).toEqual(CAPTURE_ZONES.flatMap((zone) => [`${zone}:false`, `${zone}:true`]).sort());
  });

  it.each(vectors.destinations.map((d) => [`${d.zone}, original ${d.savesOriginal ? 'enregistré' : 'par défaut'}`, d] as const))(
    'destination « %s » = vecteur',
    (_, d) => {
      expect(captureDestination(d.zone, { savesOriginal: d.savesOriginal })).toEqual(d.expected);
    },
  );

  it.each(vectors.sequences.map((s) => [s.name, s] as const))('%s', (_, sequence) => {
    expect(sequence.visible).toHaveLength(sequence.steps.length + 1);
    expect(replay(sequence.origin, sequence.steps)).toEqual(sequence.visible);
  });

  it('les transitions ne mutent jamais l’état reçu', () => {
    const start = beginTake({ zone: 'frame', frameId: 'or-royal', format: 'story' });
    const snapshot = JSON.stringify(start);
    applyFrameChange(start, 'argent');
    applyFormatChange(start, 'square');
    applySaved(applyFrameChange(start, 'argent'));
    applySaveFailed(start, { frameId: 'or-royal', format: 'story' });
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('réenregistrer avec le même cadre et le même format n’empile pas de doublon', () => {
    const twice = applySaved(applySaved(beginTake({ zone: 'outside', frameId: null, format: 'story' })));
    expect(twice.savedWith).toEqual([{ frameId: null, format: 'story' }]);
  });

  it('#10296 : une prise par le cadre marque la paire (cadre, format de la prise)', () => {
    expect(beginTake({ zone: 'frame', frameId: 'or-royal', format: 'square' })).toEqual({
      currentFrame: 'or-royal',
      currentFormat: 'square',
      savedWith: [{ frameId: 'or-royal', format: 'square' }],
    });
  });

  it('#10296 : story enregistrée, carré enregistré, retour à la story — deux versions, aucun doublon', () => {
    const story = beginTake({ zone: 'frame', frameId: 'or-royal', format: 'story' });
    const both = applySaved(applyFormatChange(story, 'square'));
    const back = applySaved(applyFormatChange(both, 'story'));
    expect(back.savedWith).toEqual([
      { frameId: 'or-royal', format: 'story' },
      { frameId: 'or-royal', format: 'square' },
    ]);
    expect(saveButtonVisible(back)).toBe(false);
  });
});
