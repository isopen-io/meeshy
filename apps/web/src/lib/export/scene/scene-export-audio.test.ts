import { describe, expect, test } from 'bun:test';

import { playSoundSchedule, soundSchedule, type ScheduledPlay } from './scene-export-audio';
import type { ExportSound } from './scene-export-plan';

const RATE = 8_000;

/** Une piste synthétique : une sinusoïde d'amplitude 0,5 — de quoi mesurer un niveau. */
const tone = (seconds: number): Float32Array => Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / RATE));

/**
 * Le banc de mesure : rend le programme comme le ferait le graphe Web Audio
 * (départ, décalage, durée, boucle, gain), sur une piste mono, puis on lit le
 * niveau RMS d'une fenêtre. C'est la piste MIXÉE que l'export enregistre.
 */
function render(plays: readonly ScheduledPlay[], clips: ReadonlyMap<string, Float32Array>, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (const play of plays) {
    const clip = clips.get(play.src);
    if (clip === undefined) continue;
    const first = Math.round(play.whenS * RATE);
    const count = Math.round(play.durationS * RATE);
    for (let i = 0; i < count && first + i < out.length; i += 1) {
      const elapsed = i / RATE;
      const local = play.loop
        ? play.loopStartS + ((play.offsetS - play.loopStartS + elapsed) % (play.loopEndS - play.loopStartS))
        : play.offsetS + elapsed;
      const sample = clip[Math.floor(local * RATE)] ?? 0;
      out[first + i] = (out[first + i] ?? 0) + gainAt(play, play.whenS + elapsed) * sample;
    }
  }
  return out;
}

/** Le gain du graphe à l'instant : la courbe programmée (paliers puis rampes linéaires), sinon le gain fixe. */
function gainAt(play: ScheduledPlay, atS: number): number {
  const points = play.envelope;
  const first = points[0];
  if (first === undefined || atS < first.atS) return play.gain;
  const next = points.findIndex((point) => point.atS > atS);
  if (next === -1) return points[points.length - 1]?.gain ?? play.gain;
  const lo = points[next - 1] ?? first;
  const hi = points[next] ?? lo;
  return lo.gain + ((hi.gain - lo.gain) * (atS - lo.atS)) / Math.max(1e-9, hi.atS - lo.atS);
}

const rms = (pcm: Float32Array, fromS: number, toS: number): number => {
  const slice = pcm.subarray(Math.round(fromS * RATE), Math.round(toS * RATE));
  return slice.length === 0 ? 0 : Math.sqrt(slice.reduce((sum, value) => sum + value * value, 0) / slice.length);
};

const sound = (overrides: Partial<ExportSound> & Pick<ExportSound, 'src'>): ExportSound => ({
  role: 'foreground-audio',
  objectId: null,
  startMs: 0,
  endMs: 10_000,
  trimStartMs: 0,
  trimEndMs: null,
  loop: false,
  gain: 1,
  ...overrides,
});

describe('la piste son mixée — elle JOUE, à sa place et à son niveau', () => {
  const clips = new Map([
    ['music', tone(4)],
    ['voice', tone(2)],
  ]);
  const durations = new Map([
    ['music', 4],
    ['voice', 2],
  ]);

  test('son de fond en boucle + vocal posé : la piste n’est jamais muette là où ils jouent', () => {
    const plays = soundSchedule({
      sounds: [sound({ src: 'music', role: 'background-track', loop: true, gain: 0.4 }), sound({ src: 'voice', startMs: 3_000, gain: 0.9 })],
      clipDurationsS: durations,
      lengthMs: 10_000,
    });
    const pcm = render(plays, clips, 10);
    expect(rms(pcm, 0, 3)).toBeGreaterThan(0.1);
    expect(rms(pcm, 3, 5)).toBeGreaterThan(rms(pcm, 0, 3));
    expect(rms(pcm, 8, 10)).toBeGreaterThan(0.1);
  });

  test('le gain de l’auteur se mesure dans la piste', () => {
    const loud = render(soundSchedule({ sounds: [sound({ src: 'voice', gain: 1 })], clipDurationsS: durations, lengthMs: 2_000 }), clips, 2);
    const soft = render(soundSchedule({ sounds: [sound({ src: 'voice', gain: 0.25 })], clipDurationsS: durations, lengthMs: 2_000 }), clips, 2);
    expect(rms(soft, 0, 2) / rms(loud, 0, 2)).toBeCloseTo(0.25, 2);
  });

  test('un son sans boucle se tait à la fin de sa coupe', () => {
    const plays = soundSchedule({ sounds: [sound({ src: 'music', trimStartMs: 1_000, trimEndMs: 2_000 })], clipDurationsS: durations, lengthMs: 10_000 });
    expect(plays).toEqual([{ src: 'music', whenS: 0, offsetS: 1, durationS: 1, loop: false, loopStartS: 1, loopEndS: 2, gain: 1, envelope: [] }]);
    const pcm = render(plays, clips, 4);
    expect(rms(pcm, 0, 1)).toBeGreaterThan(0.1);
    expect(rms(pcm, 1.1, 4)).toBe(0);
  });

  test('« Imager » en 2/4 coupe la piste à la longueur rendue', () => {
    const plays = soundSchedule({
      sounds: [sound({ src: 'music', loop: true, endMs: 240_000 }), sound({ src: 'voice', startMs: 150_000, endMs: 240_000 })],
      clipDurationsS: durations,
      lengthMs: 120_000,
    });
    expect(plays).toHaveLength(1);
    expect(plays[0]?.durationS).toBe(120);
  });

  test('la courbe de volume de l’auteur (#13880) : un son qui monte de 0 à 1 sur ses deux secondes se mesure qui monte', () => {
    const plays = soundSchedule({
      sounds: [sound({ src: 'voice', startMs: 1_000, endMs: 3_000, gain: 0, envelope: [{ atMs: 1_000, gain: 0 }, { atMs: 3_000, gain: 1 }] })],
      clipDurationsS: durations,
      lengthMs: 3_000,
    });
    expect(plays[0]?.envelope).toEqual([{ atS: 1, gain: 0 }, { atS: 3, gain: 1 }]);
    const pcm = render(plays, clips, 3);
    expect(rms(pcm, 1, 1.4)).toBeLessThan(0.1);
    expect(rms(pcm, 2.6, 3)).toBeGreaterThan(rms(pcm, 1.8, 2.2));
  });

  test('la courbe se coupe à la longueur rendue ; un son muet sans courbe n’est pas programmé', () => {
    const plays = soundSchedule({
      sounds: [sound({ src: 'music', envelope: [{ atMs: 0, gain: 1 }, { atMs: 1_000, gain: 0.5 }, { atMs: 9_000, gain: 0.1 }] })],
      clipDurationsS: durations,
      lengthMs: 2_000,
    });
    expect(plays[0]?.envelope.map((point) => point.atS)).toEqual([0, 1, 2]);
    expect(plays[0]?.envelope[2]?.gain).toBeCloseTo(0.5 - (0.4 * 1) / 8);
    expect(soundSchedule({ sounds: [sound({ src: 'music', gain: 0 })], clipDurationsS: durations, lengthMs: 2_000 })).toEqual([]);
  });

  test('un son dont le fichier n’a pas pu se décoder n’est pas programmé', () => {
    expect(soundSchedule({ sounds: [sound({ src: 'absent' })], clipDurationsS: durations, lengthMs: 5_000 })).toEqual([]);
  });
});

describe('le programme branché sur le graphe Web Audio', () => {
  test('chaque son devient une source bouclée ou non, derrière son gain, partie à son heure', () => {
    const events: string[] = [];
    const node = (name: string) => ({ connect: (target: { readonly name: string }) => events.push(`${name}->${target.name}`), name });
    const context = {
      createBufferSource: () => {
        const source = {
          ...node('source'),
          buffer: null as unknown,
          loop: false,
          loopStart: 0,
          loopEnd: 0,
          start: (when: number, offset: number, duration: number) => events.push(`start:${when}:${offset}:${duration}:${String(source.loop)}`),
          stop: () => events.push('stop'),
        };
        return source;
      },
      createGain: () => ({ ...node('gain'), gain: { value: 1, setValueAtTime: (value: number) => events.push(`gain:${value}`) } }),
    };
    const stop = playSoundSchedule({
      context: context as unknown as BaseAudioContext,
      destination: { name: 'out' } as unknown as AudioNode,
      plays: [{ src: 'music', whenS: 0, offsetS: 0, durationS: 10, loop: true, loopStartS: 0, loopEndS: 4, gain: 0.4, envelope: [] }],
      buffers: new Map([['music', {} as AudioBuffer]]),
      startAt: 2,
    });
    expect(events).toEqual(['gain:0.4', 'gain->out', 'source->gain', 'start:2:0:10:true']);
    stop();
    expect(events.at(-1)).toBe('stop');
  });
});

describe('la courbe de volume posée sur le gain du graphe (#13880)', () => {
  test('le premier point est un palier, les suivants des rampes linéaires, à l’horloge du contexte', () => {
    const events: string[] = [];
    const param = {
      value: 1,
      setValueAtTime: (value: number, at: number) => events.push(`set:${value}@${at}`),
      linearRampToValueAtTime: (value: number, at: number) => events.push(`ramp:${value}@${at}`),
    };
    const context = {
      createBufferSource: () => ({ connect: () => undefined, start: () => undefined, stop: () => undefined, buffer: null, loop: false, loopStart: 0, loopEnd: 0 }),
      createGain: () => ({ connect: () => undefined, gain: param }),
    };
    playSoundSchedule({
      context: context as unknown as BaseAudioContext,
      destination: {} as AudioNode,
      plays: [{ src: 'voice', whenS: 1, offsetS: 0, durationS: 2, loop: false, loopStartS: 0, loopEndS: 2, gain: 0, envelope: [{ atS: 1, gain: 0 }, { atS: 3, gain: 1 }] }],
      buffers: new Map([['voice', {} as AudioBuffer]]),
      startAt: 10,
    });
    expect(events).toEqual(['set:0@0', 'set:0@11', 'ramp:1@13']);
  });
});
