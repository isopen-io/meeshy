import { describe, expect, test } from 'bun:test';

import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';

import { planSceneExport, sceneExportSources, type SceneExportPlan } from './scene-export-plan';

const object = (raw: Record<string, unknown>) => ({ anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'content', z: 1, transform: {}, ...raw });

function documentOf(scenes: readonly (readonly Record<string, unknown>[])[], extra: Record<string, unknown> = {}): CanvasDocument {
  const parsed = parseCanvasDocument({ v: 3, scenes: scenes.map((objects, i) => ({ id: `s${i}`, objects: objects.map(object), ...extra })) });
  if (parsed === null) throw new Error('document de témoin invalide');
  return parsed;
}

const NO_CARRIER: SceneCarrier = { postId: 'p1', media: [] };

/** La story du critère de fin : texte, sticker, image posée, vidéo de fond, son de fond, vocal posé. */
const fullStory = documentOf([
  [
    { id: 'bg', kind: 'media', plane: 'bg', z: 0, payload: { mediaType: 'video/mp4', mediaURL: 'https://cdn/bg.mp4', isBackground: true } },
    { id: 'txt', kind: 'text', z: 3, payload: { text: 'Bonjour', fontSize: 96 } },
    { id: 'stk', kind: 'sticker', z: 4, payload: { emoji: '🎉' } },
    { id: 'img', kind: 'media', z: 2, payload: { mediaType: 'image/jpeg', mediaURL: 'https://cdn/photo.jpg', aspectRatio: 1 } },
    { id: 'music', kind: 'audio', z: 5, payload: { mediaURL: 'https://cdn/music.m4a', isBackground: true, volume: 0.4 } },
    { id: 'voice', kind: 'audio', z: 6, timing: { start: 2 }, payload: { mediaURL: 'https://cdn/voice.m4a', volume: 0.9 } },
  ],
]);

const durations = new Map([
  ['https://cdn/bg.mp4', 12_000],
  ['https://cdn/music.m4a', 30_000],
  ['https://cdn/voice.m4a', 5_000],
]);

const soundsBy = (plan: SceneExportPlan, role: string) => plan.sounds.filter((sound) => sound.role === role);

describe('le plan d’export — chaque slide à sa durée, chaque son à sa place', () => {
  test('la story complète dure la donnée la plus longue (miroir iOS) et porte ses trois sons', () => {
    const plan = planSceneExport({ document: fullStory, carrier: NO_CARRIER, durations });
    expect(plan.totalMs).toBe(30_000);
    expect(plan.slides).toEqual([{ sceneIndex: 0, startMs: 0, durationMs: 30_000 }]);
    expect(plan.still).toBe(false);
    expect(soundsBy(plan, 'background-track')).toEqual([
      { src: 'https://cdn/music.m4a', role: 'background-track', objectId: 'music', startMs: 0, endMs: 30_000, trimStartMs: 0, trimEndMs: null, loop: false, gain: 0.4 },
    ]);
    expect(soundsBy(plan, 'background-video')).toEqual([
      { src: 'https://cdn/bg.mp4', role: 'background-video', objectId: 'bg', startMs: 0, endMs: 30_000, trimStartMs: 0, trimEndMs: null, loop: true, gain: 1 },
    ]);
    expect(soundsBy(plan, 'foreground-audio')).toEqual([
      { src: 'https://cdn/voice.m4a', role: 'foreground-audio', objectId: 'voice', startMs: 2_000, endMs: 30_000, trimStartMs: 0, trimEndMs: null, loop: false, gain: 0.9 },
    ]);
  });

  test('les slides se suivent : la durée totale est leur somme, les sons de la seconde partent après la première', () => {
    const doc = documentOf([
      [{ id: 'a', kind: 'text', payload: { text: 'Un' } }],
      [
        { id: 'b', kind: 'text', payload: { text: 'Deux' } },
        { id: 'v', kind: 'audio', payload: { mediaURL: 'https://cdn/voice.m4a' } },
      ],
    ]);
    const plan = planSceneExport({ document: doc, carrier: NO_CARRIER, durations });
    expect(plan.slides).toEqual([
      { sceneIndex: 0, startMs: 0, durationMs: 6_000 },
      { sceneIndex: 1, startMs: 6_000, durationMs: 6_000 },
    ]);
    expect(plan.totalMs).toBe(12_000);
    expect(plan.sounds.map((s) => [s.startMs, s.endMs])).toEqual([[6_000, 12_000]]);
  });

  test('une story épinglée à 4 min dure 4 min, même sur une musique plus courte', () => {
    const doc = documentOf([[{ id: 'm', kind: 'audio', payload: { mediaURL: 'https://cdn/music.m4a', isBackground: true, loop: true } }]], { timelineDuration: 240 });
    const plan = planSceneExport({ document: doc, carrier: NO_CARRIER, durations });
    expect(plan.totalMs).toBe(240_000);
    expect(soundsBy(plan, 'background-track')[0]).toMatchObject({ endMs: 240_000, loop: true });
  });

  test('un son ou une vidéo coupés par l’auteur ne partent pas dans la piste', () => {
    const doc = documentOf([
      [
        { id: 'bg', kind: 'media', plane: 'bg', z: 0, payload: { mediaType: 'video/mp4', mediaURL: 'https://cdn/bg.mp4', isBackground: true, muted: true } },
        { id: 'fgv', kind: 'media', payload: { mediaType: 'video/mp4', mediaURL: 'https://cdn/clip.mp4', muted: true } },
        { id: 'muted', kind: 'audio', payload: { mediaURL: 'https://cdn/voice.m4a', muted: true } },
      ],
    ]);
    expect(planSceneExport({ document: doc, carrier: NO_CARRIER, durations }).sounds).toEqual([]);
  });

  test('une vidéo de premier plan sonne dans sa fenêtre, avec sa coupe et son gain', () => {
    const doc = documentOf([
      [
        {
          id: 'fgv',
          kind: 'media',
          timing: { start: 1, end: 4 },
          payload: { mediaType: 'video/mp4', mediaURL: 'https://cdn/clip.mp4', sourceStart: 2, sourceEnd: 8, volume: 0.5 },
        },
      ],
    ]);
    const plan = planSceneExport({ document: doc, carrier: NO_CARRIER, durations: new Map([['https://cdn/clip.mp4', 10_000]]) });
    expect(soundsBy(plan, 'foreground-video')).toEqual([
      { src: 'https://cdn/clip.mp4', role: 'foreground-video', objectId: 'fgv', startMs: 1_000, endMs: 4_000, trimStartMs: 2_000, trimEndMs: 8_000, loop: false, gain: 0.5 },
    ]);
  });

  test('une scène purement statique et muette sort en image ; un objet temporisé en fait une vidéo', () => {
    const still = documentOf([[{ id: 't', kind: 'text', payload: { text: 'Fixe' } }]]);
    expect(planSceneExport({ document: still, carrier: NO_CARRIER, durations }).still).toBe(true);
    const timed = documentOf([[{ id: 't', kind: 'text', timing: { start: 1 }, payload: { text: 'Entre' } }]]);
    expect(planSceneExport({ document: timed, carrier: NO_CARRIER, durations }).still).toBe(false);
  });

  test('le porteur prête son adresse au fond, comme au lecteur', () => {
    const doc = documentOf([[{ id: 'bg', kind: 'media', plane: 'bg', z: 0, payload: { mediaType: 'video/mp4', postMediaId: 'm1', isBackground: true } }]]);
    const carrier: SceneCarrier = { postId: 'p1', media: [{ id: 'm1', src: 'https://cdn/served.mp4', mimeType: 'video/mp4' }] };
    const plan = planSceneExport({ document: doc, carrier, durations: new Map([['https://cdn/served.mp4', 9_000]]) });
    expect(plan.totalMs).toBe(9_000);
    expect(plan.sounds[0]?.src).toBe('https://cdn/served.mp4');
  });
});

describe('les sources à charger avant le rendu', () => {
  test('chaque pixel et chaque son de la composition, une fois chacun', () => {
    expect(sceneExportSources({ document: fullStory, carrier: NO_CARRIER })).toEqual({
      images: ['https://cdn/photo.jpg'],
      videos: ['https://cdn/bg.mp4'],
      sounds: ['https://cdn/music.m4a', 'https://cdn/bg.mp4', 'https://cdn/voice.m4a'],
    });
  });
});

describe('la courbe de volume de l’auteur suit le son (#13880, miroir des rampes de volume iOS)', () => {
  const voiceWith = (timing: Record<string, unknown>, payload: Record<string, unknown> = {}) =>
    planSceneExport({
      document: documentOf([[{ id: 'voice', kind: 'audio', timing, payload: { mediaURL: 'https://cdn/voice.m4a', volume: 0.9, ...payload } }]]),
      carrier: NO_CARRIER,
      durations,
    }).sounds[0];
  const gainAt = (envelope: readonly { atMs: number; gain: number }[] | undefined, atMs: number) => {
    const points = envelope ?? [];
    const next = points.findIndex((point) => point.atMs >= atMs);
    const hi = points[next];
    const lo = points[next - 1] ?? hi;
    if (hi === undefined || lo === undefined) return points.at(-1)?.gain;
    return hi.atMs === lo.atMs ? hi.gain : lo.gain + ((hi.gain - lo.gain) * (atMs - lo.atMs)) / (hi.atMs - lo.atMs);
  };

  test('des keyframes de volume remplacent le gain de base, à leur heure dans la fenêtre du son', () => {
    const voice = voiceWith({ start: 2, keyframes: [{ time: 0, volume: 0 }, { time: 2, volume: 1 }] });
    expect(voice?.envelope?.[0]).toEqual({ atMs: 2_000, gain: 0 });
    expect(gainAt(voice?.envelope, 3_000)).toBeCloseTo(0.5, 1);
    expect(gainAt(voice?.envelope, 5_000)).toBeCloseTo(1, 5);
  });

  test('le fondu d’entrée et de sortie d’un son posé portent sur son volume', () => {
    const voice = voiceWith({ start: 0 }, { duration: 4, fadeIn: 1, fadeOut: 1 });
    expect(gainAt(voice?.envelope, 0)).toBeCloseTo(0, 5);
    expect(gainAt(voice?.envelope, 500)).toBeCloseTo(0.45, 1);
    expect(gainAt(voice?.envelope, 2_000)).toBeCloseTo(0.9, 5);
    expect(gainAt(voice?.envelope, 3_500)).toBeCloseTo(0.45, 1);
  });

  test('sans keyframe de volume ni fondu, le gain reste fixe : aucune courbe', () => {
    expect(voiceWith({ start: 0 })?.envelope).toBeUndefined();
    expect(voiceWith({ start: 0, keyframes: [{ time: 0, opacity: 0.5 }] })?.envelope).toBeUndefined();
  });
});
