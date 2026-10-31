import { describe, expect, test } from 'bun:test';

import { brandAudioPlan, playBrandAudio } from './scene-export-branding-audio';
import { brandedTimeline, makeBrandingPlan } from './scene-export-branding-plan';

const withIntro = brandedTimeline({ plan: makeBrandingPlan({ hasIntro: true, hasAuthorOutro: true }), storyMs: 10_000 });
const withoutIntro = brandedTimeline({ plan: makeBrandingPlan({ hasIntro: false, hasAuthorOutro: false }), storyMs: 10_000 });

describe('le son de la marque dans la piste de l\'export', () => {
  test("l'ouverture entre à zéro et s'estompe sur le fondu ; la fermeture entre à la 2e phase de la carte d'auteur", () => {
    const plan = brandAudioPlan({ timeline: withIntro, lengthMs: withIntro.totalMs });
    expect(plan.jingles).toEqual([
      { kind: 'intro', whenS: 0, fadeOut: { startS: 1.2, endS: 1.7 } },
      { kind: 'outro', whenS: (withIntro.outroStartMs + 1_500) / 1000, fadeOut: null },
    ]);
  });

  test("sans intro : seule la fermeture ; sans identité elle entre avec le logo", () => {
    const plan = brandAudioPlan({ timeline: withoutIntro, lengthMs: withoutIntro.totalMs });
    expect(plan.jingles).toEqual([{ kind: 'outro', whenS: withoutIntro.outroStartMs / 1000, fadeOut: null }]);
  });

  test('le son de la story s\'éteint sur le fondu de la carte de fin', () => {
    expect(brandAudioPlan({ timeline: withIntro, lengthMs: withIntro.totalMs }).storyFade).toEqual({ startS: withIntro.outroStartMs / 1000, endS: (withIntro.outroStartMs + 1_500) / 1000 });
  });

  test('un export tronqué avant l\'entrée d\'un jingle (une part d\'« Imager ») ne le programme pas', () => {
    const plan = brandAudioPlan({ timeline: withIntro, lengthMs: 3_000 });
    expect(plan.jingles.map((jingle) => jingle.kind)).toEqual(['intro']);
  });
});

type Call = readonly [string, ...unknown[]];

function fakeContext() {
  const calls: Call[] = [];
  const param = (name: string) => ({
    setValueAtTime: (value: number, at: number) => calls.push([`${name}.set`, value, at]),
    linearRampToValueAtTime: (value: number, at: number) => calls.push([`${name}.ramp`, value, at]),
  });
  const context = {
    createGain: () => {
      calls.push(['gain']);
      return { gain: param('gain'), connect: (target: unknown) => calls.push(['gain.connect', target === destination ? 'destination' : 'bus']) };
    },
    createBuffer: (channels: number, length: number, rate: number) => {
      calls.push(['buffer', channels, length, rate]);
      return { getChannelData: () => new Float32Array(length) };
    },
    createBufferSource: () => ({
      buffer: null as unknown,
      connect: () => undefined,
      start: (when: number) => calls.push(['source.start', when]),
      stop: () => calls.push(['source.stop']),
    }),
  };
  const destination = {};
  return { context: context as unknown as BaseAudioContext, destination: destination as unknown as AudioNode, calls };
}

describe('la programmation des jingles sur le graphe Web Audio', () => {
  test('chaque jingle est un buffer mono 48 kHz de la bonne durée, posé à son instant, avec le fondu d\'ouverture', () => {
    const { context, destination, calls } = fakeContext();
    const plan = brandAudioPlan({ timeline: withIntro, lengthMs: withIntro.totalMs });
    playBrandAudio({ context, destination, startAt: 10, plan });
    expect(calls.filter((call) => call[0] === 'buffer')).toEqual([
      ['buffer', 1, 105_600, 48_000],
      ['buffer', 1, 96_000, 48_000],
    ]);
    expect(calls.filter((call) => call[0] === 'source.start').map((call) => call[1])).toEqual([10, 10 + (withIntro.outroStartMs + 1_500) / 1000]);
    expect(calls).toContainEqual(['gain.set', 1, 11.2]);
    expect(calls).toContainEqual(['gain.ramp', 0, 11.7]);
  });

  test('le bus de la story s\'éteint de 1 à 0 sur le fondu de la fin, et les sons de la story passent par lui', () => {
    const { context, destination, calls } = fakeContext();
    const plan = brandAudioPlan({ timeline: withIntro, lengthMs: withIntro.totalMs });
    const { storyBus } = playBrandAudio({ context, destination, startAt: 0, plan });
    expect(storyBus).toBeDefined();
    const start = withIntro.outroStartMs / 1000;
    expect(calls).toContainEqual(['gain.set', 1, start]);
    expect(calls).toContainEqual(['gain.ramp', 0, start + 1.5]);
  });

  test('l\'arrêt coupe les jingles', () => {
    const { context, destination, calls } = fakeContext();
    const { stop } = playBrandAudio({ context, destination, startAt: 0, plan: brandAudioPlan({ timeline: withIntro, lengthMs: withIntro.totalMs }) });
    stop();
    expect(calls.filter((call) => call[0] === 'source.stop')).toHaveLength(2);
  });
});
