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
});
