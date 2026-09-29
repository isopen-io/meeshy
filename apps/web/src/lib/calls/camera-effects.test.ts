import { describe, expect, test } from 'bun:test';

import { createCameraEffects, PASSTHROUGH_EFFECTS } from './camera-effects';
import { cameraSourceOf, NO_EFFECTS, type VideoEffects } from './video-effects';
import type { EffectsPipeline } from './video-effects-pipeline';

/**
 * LA CAMÉRA ET SES EFFETS, VUS DU MOTEUR (#8442) — ce que le moteur envoie
 * pour une caméra donnée, ce qu'il relâche, et ce que l'analytique retient.
 */

type FakeTrack = { readonly id: string; readyState: 'live' | 'ended'; stop: () => void; constraints: unknown[]; applyConstraints: (c: unknown) => Promise<void>; getCapabilities: () => Record<string, unknown> };

const camera = (id = 'cam', blur = false): FakeTrack => {
  const self: FakeTrack = {
    id,
    readyState: 'live',
    stop: () => void (self.readyState = 'ended'),
    constraints: [],
    applyConstraints: async (c) => void self.constraints.push(c),
    getCapabilities: () => (blur ? { backgroundBlur: [false, true] } : {}),
  };
  return self;
};

function harness(options: { readonly color?: boolean; readonly effects?: VideoEffects } = {}) {
  let effects = options.effects ?? NO_EFFECTS;
  const built: Array<{ camera: MediaStreamTrack; pipeline: EffectsPipeline & { updates: VideoEffects[]; stopped: boolean } }> = [];
  const port = createCameraEffects({
    effects: () => effects,
    colorSupported: () => options.color ?? true,
    loadPipeline: async () => (source, initial) => {
      const output = camera(`out-${built.length}`) as unknown as MediaStreamTrack;
      const pipeline = { output, filter: () => '', updates: [initial], stopped: false, update: (next: VideoEffects) => void pipeline.updates.push(next), stop: () => void ((pipeline.stopped = true), output.stop()) };
      built.push({ camera: source, pipeline });
      return pipeline;
    },
  });
  return { port, built, set: (next: VideoEffects) => void (effects = next) };
}

const asTrack = (track: FakeTrack) => track as unknown as MediaStreamTrack;

describe('sans effet', () => {
  test('la caméra part telle quelle, et se relâche comme avant', async () => {
    const h = harness();
    const raw = camera();
    expect(await h.port.wrap(asTrack(raw))).toBe(asTrack(raw));
    h.port.release(asTrack(raw));
    expect(raw.readyState).toBe('ended');
    expect(h.built).toEqual([]);
  });

  test('le moteur sans port d’effets (témoins, navigateur sans rien) passe tout droit', async () => {
    const raw = camera();
    expect(await PASSTHROUGH_EFFECTS.wrap(asTrack(raw))).toBe(asTrack(raw));
    expect(await PASSTHROUGH_EFFECTS.refresh(asTrack(raw))).toBe(asTrack(raw));
    PASSTHROUGH_EFFECTS.release(asTrack(raw));
    expect(raw.readyState).toBe('ended');
    expect(PASSTHROUGH_EFFECTS.used()).toEqual([]);
  });
});

describe('un effet de visage (#8551)', () => {
  test('en couleur naturelle, il bâtit quand même le traitement, et l’analytique le nomme', async () => {
    const h = harness({ effects: { ...NO_EFFECTS, faceEffect: 'volcano' } });
    const raw = camera();
    const sent = await h.port.wrap(asTrack(raw));
    expect(sent).toBe(h.built[0]?.pipeline.output as MediaStreamTrack);
    expect(h.port.used()).toEqual(['face:volcano']);
  });
});

describe('un effet de couleur', () => {
  test('la piste envoyée est celle du traitement ; la caméra reste derrière elle', async () => {
    const h = harness({ effects: { ...NO_EFFECTS, preset: 'warm' } });
    const raw = camera();
    const sent = await h.port.wrap(asTrack(raw));
    expect(sent).toBe(h.built[0]?.pipeline.output as MediaStreamTrack);
    expect(cameraSourceOf(sent)).toBe(asTrack(raw));
  });

  test('relâcher la piste traitée arrête le traitement ET la caméra', async () => {
    const h = harness({ effects: { ...NO_EFFECTS, preset: 'warm' } });
    const raw = camera();
    const sent = await h.port.wrap(asTrack(raw));
    h.port.release(sent);
    expect(h.built[0]?.pipeline.stopped).toBe(true);
    expect(raw.readyState).toBe('ended');
  });

  test('poser un effet en cours d’appel bâtit le traitement UNE fois ; les suivants le règlent', async () => {
    const h = harness();
    const raw = camera();
    const first = await h.port.wrap(asTrack(raw));
    h.set({ ...NO_EFFECTS, preset: 'vivid' });
    const second = await h.port.refresh(first);
    expect(second).not.toBe(first);
    h.set({ ...NO_EFFECTS, preset: 'natural' });
    expect(await h.port.refresh(second)).toBe(second);
    expect(h.built).toHaveLength(1);
    expect(h.built[0]?.pipeline.updates.at(-1)).toEqual(NO_EFFECTS);
    expect(raw.readyState).toBe('live');
  });

  test('sans traitement possible, la caméra part telle quelle', async () => {
    const h = harness({ color: false, effects: { ...NO_EFFECTS, preset: 'warm' } });
    const raw = camera();
    expect(await h.port.wrap(asTrack(raw))).toBe(asTrack(raw));
  });

  test('un traitement qui ne se charge pas laisse partir la caméra', async () => {
    const port = createCameraEffects({ effects: () => ({ ...NO_EFFECTS, preset: 'warm' }), colorSupported: () => true, loadPipeline: async () => Promise.reject(new Error('chunk')) });
    const raw = camera();
    expect(await port.wrap(asTrack(raw))).toBe(asTrack(raw));
  });
});

describe('le flou d’arrière-plan', () => {
  test('se règle sur la CAMÉRA, même derrière un traitement', async () => {
    const h = harness({ effects: { ...NO_EFFECTS, preset: 'warm', blur: true } });
    const raw = camera('cam', true);
    await h.port.wrap(asTrack(raw));
    expect(raw.constraints).toEqual([{ advanced: [{ backgroundBlur: true }] }]);
  });

  test('se retire quand on le coupe', async () => {
    const h = harness({ effects: { ...NO_EFFECTS, blur: true } });
    const raw = camera('cam', true);
    const sent = await h.port.wrap(asTrack(raw));
    h.set(NO_EFFECTS);
    await h.port.refresh(sent);
    expect(raw.constraints.at(-1)).toEqual({ advanced: [{ backgroundBlur: false }] });
  });

  test('une caméra qui ne l’offre pas n’est pas sollicitée', async () => {
    const h = harness({ effects: { ...NO_EFFECTS, blur: true } });
    const raw = camera('cam', false);
    await h.port.wrap(asTrack(raw));
    expect(raw.constraints).toEqual([]);
  });
});

describe('ce que l’analytique retient', () => {
  test('les effets actifs, nommés', () => {
    const h = harness({ effects: { ...NO_EFFECTS, preset: 'cool', blur: true } });
    expect(h.port.used()).toEqual(['filter:cool', 'background-blur']);
  });
});
