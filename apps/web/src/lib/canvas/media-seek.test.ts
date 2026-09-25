import { describe, expect, test } from 'bun:test';

import type { CanvasObject } from './document';
import {
  backgroundMediaTimeline,
  mediaDrift,
  mediaTimeAt,
  objectMediaTimeline,
  sceneSeekStep,
  trackMediaTimeline,
  type MediaTimeline,
} from './media-seek';

/**
 * LA LOI UNIQUE DU TEMPS D'UN MÉDIA DE SCÈNE (#7879, retour porteur : « toutes
 * les vidéos et audios de la scène sont synchronisés sur la timeline de la
 * scène »). Miroir de `StoryMediaLayer.trimmedSeekTarget` (min(start + max(0,
 * t − startTime), end)) et de `StoryBackgroundLayer.loopedScrubTarget` (t
 * modulo la durée d'un fond qui boucle) — une seule fonction, lue en lecture
 * ET au seek, pour le fond, les vidéos posées, les sons posés et la piste.
 */
const timeline = (overrides: Partial<MediaTimeline> = {}): MediaTimeline => ({
  windowStart: 0,
  windowEnd: Infinity,
  trimStart: undefined,
  trimEnd: undefined,
  loop: false,
  ...overrides,
});

describe('mediaTimeAt — le temps d’un média au temps de la scène', () => {
  test('un fond qui BOUCLE, plus court que la scène : t modulo sa durée (miroir loopedScrubTarget)', () => {
    expect(mediaTimeAt({ t: 9, timeline: timeline({ loop: true }), mediaDuration: 4 })).toEqual({ time: 1, plays: true });
    expect(mediaTimeAt({ t: 2.5, timeline: timeline({ loop: true }), mediaDuration: 4 })).toEqual({ time: 2.5, plays: true });
  });

  test('un média qui ENTRE à 3 s est à 0 s local à t=3, en attente (pause) avant', () => {
    const entre = timeline({ windowStart: 3 });
    expect(mediaTimeAt({ t: 1, timeline: entre, mediaDuration: 10 })).toEqual({ time: 0, plays: false });
    expect(mediaTimeAt({ t: 3, timeline: entre, mediaDuration: 10 })).toEqual({ time: 0, plays: true });
    expect(mediaTimeAt({ t: 4.5, timeline: entre, mediaDuration: 10 })).toEqual({ time: 1.5, plays: true });
  });

  test('HORS de sa fenêtre (après sa sortie), il ne lit plus : figé où la sortie l’a laissé', () => {
    const fenetre = timeline({ windowStart: 1, windowEnd: 3 });
    expect(mediaTimeAt({ t: 5, timeline: fenetre, mediaDuration: 10 })).toEqual({ time: 2, plays: false });
  });

  test('la COUPE décale l’origine et borne la fin (miroir trimmedSeekTarget)', () => {
    const coupe = timeline({ windowStart: 2, trimStart: 5, trimEnd: 7 });
    expect(mediaTimeAt({ t: 3, timeline: coupe, mediaDuration: 20 })).toEqual({ time: 6, plays: true });
    expect(mediaTimeAt({ t: 10, timeline: coupe, mediaDuration: 20 })).toEqual({ time: 7, plays: false });
    expect(mediaTimeAt({ t: 0, timeline: coupe, mediaDuration: 20 })).toEqual({ time: 5, plays: false });
  });

  test('une coupe qui BOUCLE se replie sur sa propre fenêtre', () => {
    const coupe = timeline({ trimStart: 1, trimEnd: 3, loop: true });
    expect(mediaTimeAt({ t: 5, timeline: coupe, mediaDuration: 20 })?.time).toBeCloseTo(2, 5);
  });

  test('sans boucle, le média s’arrête sur sa dernière image', () => {
    expect(mediaTimeAt({ t: 7, timeline: timeline(), mediaDuration: 3 })).toEqual({ time: 3, plays: false });
  });

  test('une coupe plus longue que le fichier est bornée au fichier', () => {
    expect(mediaTimeAt({ t: 9, timeline: timeline({ trimStart: 1, trimEnd: 50 }), mediaDuration: 4 })).toEqual({ time: 4, plays: false });
  });

  test('durée inconnue (métadonnées non chargées) ⇒ null : on ne pose rien', () => {
    expect(mediaTimeAt({ t: 1, timeline: timeline(), mediaDuration: Number.NaN })).toBeNull();
    expect(mediaTimeAt({ t: 1, timeline: timeline(), mediaDuration: 0 })).toBeNull();
  });
});

describe('mediaDrift — l’écart, replié pour un média qui boucle', () => {
  test('juste avant et juste après le tour, l’écart est petit', () => {
    expect(mediaDrift({ current: 3.95, target: 0.05, timeline: timeline({ loop: true }), mediaDuration: 4 })).toBeCloseTo(0.1, 5);
  });

  test('une position HORS de la coupe n’est jamais repliée — elle est loin', () => {
    expect(mediaDrift({ current: 0, target: 4, timeline: timeline({ loop: true, trimStart: 2, trimEnd: 6 }), mediaDuration: 10 })).toBe(4);
  });

  test('sans boucle, l’écart est l’écart', () => {
    expect(mediaDrift({ current: 3.95, target: 0.05, timeline: timeline(), mediaDuration: 4 })).toBeCloseTo(3.9, 5);
  });
});

const object = (overrides: Partial<CanvasObject>): CanvasObject => ({
  id: 'o',
  kind: 'media',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'fg',
  z: 1,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload: {},
  ...overrides,
});

describe('les timelines lues sur le document', () => {
  test('un média POSÉ : sa fenêtre (`timing`), sa coupe (`sourceStart`/`sourceEnd`), sa boucle', () => {
    expect(objectMediaTimeline(object({ timing: { start: 3, end: 8 }, payload: { sourceStart: 1, sourceEnd: 4, loop: true } }))).toEqual({
      windowStart: 3,
      windowEnd: 8,
      trimStart: 1,
      trimEnd: 4,
      loop: true,
    });
  });

  test('un son posé sans `timing` part à son `startTime`', () => {
    expect(objectMediaTimeline(object({ kind: 'audio', payload: { startTime: 2 } })).windowStart).toBe(2);
  });

  test('une coupe incohérente (fin avant début) est ignorée', () => {
    const t = objectMediaTimeline(object({ payload: { sourceStart: 4, sourceEnd: 1 } }));
    expect(t.trimStart).toBeUndefined();
    expect(t.trimEnd).toBeUndefined();
  });

  test('le FOND boucle toujours, dès 0, sur toute la scène', () => {
    expect(backgroundMediaTimeline(object({ plane: 'bg', payload: {} }))).toEqual({
      windowStart: 0,
      windowEnd: Infinity,
      trimStart: undefined,
      trimEnd: undefined,
      loop: true,
    });
  });

  test('la PISTE de fond : départ différé, fenêtre source, boucle', () => {
    expect(trackMediaTimeline({ startOffsetMs: 2000, loop: true, bounds: { startMs: 1000, endMs: 4000 } })).toEqual({
      windowStart: 2,
      windowEnd: Infinity,
      trimStart: 1,
      trimEnd: 4,
      loop: true,
    });
  });
});

describe('sceneSeekStep — le pas clavier d’une scène', () => {
  test('un dixième de la scène, jamais moins d’une seconde', () => {
    expect(sceneSeekStep(30)).toBe(3);
    expect(sceneSeekStep(6)).toBe(1);
  });
});
