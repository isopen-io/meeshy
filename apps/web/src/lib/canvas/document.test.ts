import { describe, expect, test } from 'bun:test';

import { parseCanvasDocument } from './document';

describe('parseCanvasDocument — tolérant au wire réel (§ 3.3)', () => {
  test('v3 avec scenes ⇒ un document, transform plein conservé', () => {
    const doc = parseCanvasDocument({
      v: 3,
      scenes: [
        {
          id: 's1',
          objects: [
            {
              id: 't1',
              kind: 'text',
              anchor: { t: 'free', x: 0.5, y: 0.5 },
              plane: 'fg',
              z: 1,
              transform: { scale: 1, rotation: 0, opacity: 1 },
              payload: { text: 'hello' },
            },
          ],
        },
      ],
    });
    expect(doc?.scenes.length).toBe(1);
    expect(doc?.scenes[0]?.objects[0]?.transform).toEqual({ scale: 1, rotation: 0, opacity: 1 });
  });

  test("v3 SANS scenes (POST_HERO) ⇒ null (repli média, D-78)", () => {
    expect(parseCanvasDocument({ v: 3, layout: 'hero' })).toBeNull();
    expect(parseCanvasDocument({ v: 3, scenes: [] })).toBeNull();
  });

  test('transform: {} (copie de 6a9d0ad5) ⇒ parsé avec les défauts {1,0,1}', () => {
    const doc = parseCanvasDocument({
      v: 3,
      scenes: [
        {
          id: 'bg1-scene',
          objects: [
            {
              id: 'bg1',
              kind: 'media',
              anchor: { t: 'free', x: 0.5, y: 0.5 },
              plane: 'bg',
              z: 0,
              transform: {},
              payload: { background: '#4338CA' },
            },
          ],
        },
      ],
    });
    expect(doc).not.toBeNull();
    expect(doc?.scenes[0]?.objects[0]?.transform).toEqual({ scale: 1, rotation: 0, opacity: 1 });
  });

  test('v: 1 ⇒ null', () => {
    expect(parseCanvasDocument({ v: 1, background: '#fff' })).toBeNull();
  });

  test("valeur non-objet ⇒ null", () => {
    expect(parseCanvasDocument(undefined)).toBeNull();
    expect(parseCanvasDocument(null)).toBeNull();
    expect(parseCanvasDocument('nope')).toBeNull();
  });

  test('layout et sound optionnels sont conservés quand présents', () => {
    const doc = parseCanvasDocument({
      v: 3,
      layout: 'wave',
      sound: { source: { t: 'original' }, volume: 1 },
      scenes: [{ id: 's1', objects: [] }],
    });
    expect(doc?.layout).toBe('wave');
    expect(doc?.sound).toEqual({ source: { t: 'original' }, volume: 1 });
  });

  // T5 (#6899) — `timelineDuration` et `thumbHash` de scène : les deux
  // existent dans `SceneV3` (`canvas-v3.ts:146,149`) mais n'atterrissaient
  // pas dans `CanvasScene` : le lecteur ne pouvait pas les lire.
  describe('timelineDuration et thumbHash de scène (T5, #6899)', () => {
    test('un nombre positif fini est conservé', () => {
      const doc = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects: [], timelineDuration: 9 }] });
      expect(doc?.scenes[0]?.timelineDuration).toBe(9);
    });

    test('absent, zéro, négatif ou non-fini ⇒ absent (jamais 0 ni NaN)', () => {
      const zero = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects: [], timelineDuration: 0 }] });
      const negative = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects: [], timelineDuration: -3 }] });
      const infinite = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects: [], timelineDuration: Infinity }] });
      const absent = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects: [] }] });
      expect(zero?.scenes[0]?.timelineDuration).toBeUndefined();
      expect(negative?.scenes[0]?.timelineDuration).toBeUndefined();
      expect(infinite?.scenes[0]?.timelineDuration).toBeUndefined();
      expect(absent?.scenes[0]?.timelineDuration).toBeUndefined();
    });

    test('une chaîne non vide est conservée, une chaîne vide non', () => {
      const doc = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects: [], thumbHash: 'abc123' }] });
      const empty = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects: [], thumbHash: '' }] });
      expect(doc?.scenes[0]?.thumbHash).toBe('abc123');
      expect(empty?.scenes[0]?.thumbHash).toBeUndefined();
    });
  });

  // T-A (#6901) — la lecture tolère un rang SUPÉRIEUR, miroir
  // `isCanvasV3OrNewer` (`storyEffectsV3.ts:37-41`, `mark >= 3` sur un
  // `number`) — mais Number.isInteger en plus (§ 9, Q1) : une version
  // fractionnaire ou textuelle n'a jamais existé côté fil.
  describe('parseCanvasDocument — la lecture tolère un rang supérieur (miroir isCanvasV3OrNewer, T-A)', () => {
    test('v: 4 avec scenes ⇒ un document, jamais rejeté', () => {
      const doc = parseCanvasDocument({ v: 4, scenes: [{ id: 's1', objects: [] }] });
      expect(doc).not.toBeNull();
      expect(doc?.v).toBe(4);
      expect(doc?.scenes.length).toBe(1);
    });

    test('v: 2 ⇒ null (sous le rang 3)', () => {
      expect(parseCanvasDocument({ v: 2, scenes: [{ id: 's1', objects: [] }] })).toBeNull();
    });

    test("v: '3' (chaîne) ⇒ null", () => {
      expect(parseCanvasDocument({ v: '3', scenes: [{ id: 's1', objects: [] }] })).toBeNull();
    });

    test('v: 3.5 (non entier) ⇒ null', () => {
      expect(parseCanvasDocument({ v: 3.5, scenes: [{ id: 's1', objects: [] }] })).toBeNull();
    });
  });

  // T-A2 — les keyframes sont typés à la lecture : un canal non fini est
  // jeté, un keyframe sans `time` fini >= 0 est jeté ENTIER (jamais l'objet).
  describe('parseCanvasDocument — les keyframes sont typés à la lecture (T-A2)', () => {
    test("un keyframe sans time exploitable est jeté, les autres canaux conservés", () => {
      const doc = parseCanvasDocument({
        v: 3,
        scenes: [
          {
            id: 's1',
            objects: [
              {
                id: 't1',
                kind: 'text',
                anchor: { t: 'free', x: 0.5, y: 0.5 },
                plane: 'fg',
                z: 1,
                transform: { scale: 1, rotation: 0, opacity: 1 },
                payload: { text: 'x' },
                timing: { keyframes: [{ time: 1, x: 0.2 }, { time: 'x' }, 'bad'] },
              },
            ],
          },
        ],
      });
      expect(doc?.scenes[0]?.objects[0]?.timing?.keyframes).toEqual([{ time: 1, x: 0.2 }]);
    });

    test("easing: 'spring' voyage tel quel — la loi de pose décide, pas ce module", () => {
      const doc = parseCanvasDocument({
        v: 3,
        scenes: [
          {
            id: 's1',
            objects: [
              {
                id: 't1',
                kind: 'text',
                anchor: { t: 'free', x: 0.5, y: 0.5 },
                plane: 'fg',
                z: 1,
                transform: { scale: 1, rotation: 0, opacity: 1 },
                payload: { text: 'x' },
                timing: { keyframes: [{ time: 0, scale: 2, easing: 'spring' }] },
              },
            ],
          },
        ],
      });
      expect(doc?.scenes[0]?.objects[0]?.timing?.keyframes).toEqual([{ time: 0, scale: 2, easing: 'spring' }]);
    });
  });
});
