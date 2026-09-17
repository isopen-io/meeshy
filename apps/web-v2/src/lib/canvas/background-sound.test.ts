import { describe, expect, test } from 'bun:test';

import { attachmentSrc } from '@/lib/api/media-url';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';

import { electBackgroundTrack, sceneHasControllableSound } from './background-sound';

/**
 * `electBackgroundTrack` (T7, #6899) — LE SON DE FOND D'UNE SCÈNE, miroir de
 * `ReaderAudioMixer+Background.swift` (§ 1.6 de la spécification
 * `stories-lecteur`) : une piste de fond, alignée sur l'horloge de la
 * diapositive, `volume` bornée [0,1], boucle, bornes.
 */

const carrier = (media: SceneCarrier['media']): SceneCarrier => ({ postId: 'p1', media });

function documentWith(scene: unknown, sound?: unknown): CanvasDocument {
  const doc = parseCanvasDocument({ v: 3, scenes: [scene], ...(sound !== undefined ? { sound } : {}) });
  if (doc === null) throw new Error('vecteur de test invalide');
  return doc;
}

describe('electBackgroundTrack — objet audio de scène isBackground', () => {
  test('avec `postMediaId` ⇒ la source du porteur, à son identité', () => {
    const document = documentWith({
      id: 's1',
      objects: [
        {
          id: 'bgsound',
          kind: 'audio',
          anchor: { t: 'free', x: 0.5, y: 0.5 },
          plane: 'bg',
          z: 0,
          transform: { scale: 1, rotation: 0, opacity: 1 },
          payload: { isBackground: true, postMediaId: 'media-a', volume: 0.6, startTime: 2, loop: true },
        },
      ],
    });
    const track = electBackgroundTrack({ document, sceneIndex: 0, carrier: carrier([{ id: 'media-a', src: 'blob:track.m4a' }]) });
    expect(track).toEqual({ src: 'blob:track.m4a', volume: 0.6, startOffsetMs: 2000, loop: true });
  });

  test('sans `postMediaId` mais `mediaURL` ⇒ résolu comme toute pièce jointe', () => {
    const document = documentWith({
      id: 's1',
      objects: [
        {
          id: 'bgsound',
          kind: 'audio',
          anchor: { t: 'free', x: 0.5, y: 0.5 },
          plane: 'bg',
          z: 0,
          transform: { scale: 1, rotation: 0, opacity: 1 },
          payload: { isBackground: true, mediaURL: '2026/09/u1/track.m4a' },
        },
      ],
    });
    const track = electBackgroundTrack({ document, sceneIndex: 0, carrier: carrier([]) });
    expect(track?.src).toBe(attachmentSrc('2026/09/u1/track.m4a'));
  });

  test('`volume` est bornée [0,1], défaut 1', () => {
    const overshoot = documentWith({
      id: 's1',
      objects: [{ id: 'a', kind: 'audio', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { isBackground: true, postMediaId: 'm', volume: 4 } }],
    });
    const negative = documentWith({
      id: 's1',
      objects: [{ id: 'a', kind: 'audio', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { isBackground: true, postMediaId: 'm', volume: -1 } }],
    });
    const absent = documentWith({
      id: 's1',
      objects: [{ id: 'a', kind: 'audio', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { isBackground: true, postMediaId: 'm' } }],
    });
    const m = carrier([{ id: 'm', src: 's.m4a' }]);
    expect(electBackgroundTrack({ document: overshoot, sceneIndex: 0, carrier: m })?.volume).toBe(1);
    expect(electBackgroundTrack({ document: negative, sceneIndex: 0, carrier: m })?.volume).toBe(0);
    expect(electBackgroundTrack({ document: absent, sceneIndex: 0, carrier: m })?.volume).toBe(1);
  });

  test('`bounds` recopié ssi `end >= start`', () => {
    const valid = documentWith({
      id: 's1',
      objects: [{ id: 'a', kind: 'audio', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { isBackground: true, postMediaId: 'm', sourceStart: 1, sourceEnd: 5 } }],
    });
    const invalid = documentWith({
      id: 's1',
      objects: [{ id: 'a', kind: 'audio', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { isBackground: true, postMediaId: 'm', sourceStart: 5, sourceEnd: 1 } }],
    });
    const m = carrier([{ id: 'm', src: 's.m4a' }]);
    expect(electBackgroundTrack({ document: valid, sceneIndex: 0, carrier: m })?.bounds).toEqual({ startMs: 1000, endMs: 5000 });
    expect(electBackgroundTrack({ document: invalid, sceneIndex: 0, carrier: m })?.bounds).toBeUndefined();
  });

  test('absent (`isBackground` faux ou `undefined`) ⇒ l’objet n’est pas élu', () => {
    const document = documentWith({
      id: 's1',
      objects: [{ id: 'a', kind: 'audio', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { postMediaId: 'm' } }],
    });
    expect(electBackgroundTrack({ document, sceneIndex: 0, carrier: carrier([]) })).toBeNull();
  });
});

describe('electBackgroundTrack — le son du DOCUMENT (`document.sound`), sans objet de scène', () => {
  test('`source.t === "original"` ⇒ le premier média AUDIO du porteur', () => {
    const document = documentWith({ id: 's1', objects: [] }, { source: { t: 'original' }, volume: 0.8 });
    const track = electBackgroundTrack({
      document,
      sceneIndex: 0,
      carrier: carrier([
        { id: 'img', src: 'photo.png', mimeType: 'image/png' },
        { id: 'aud', src: 'clip.m4a', mimeType: 'audio/m4a' },
      ]),
    });
    expect(track).toEqual({ src: 'clip.m4a', volume: 0.8, startOffsetMs: 0, loop: false });
  });

  test('`source.t === "library"` ⇒ `null` (question 9.2, hors périmètre)', () => {
    const document = documentWith({ id: 's1', objects: [] }, { source: { t: 'library', soundId: 'lib-1' }, volume: 1 });
    expect(electBackgroundTrack({ document, sceneIndex: 0, carrier: carrier([{ id: 'aud', src: 'clip.m4a', mimeType: 'audio/m4a' }]) })).toBeNull();
  });

  test('aucun son de fond nulle part ⇒ `null`', () => {
    const document = documentWith({ id: 's1', objects: [] });
    expect(electBackgroundTrack({ document, sceneIndex: 0, carrier: carrier([]) })).toBeNull();
  });

  test('`bounds` du document recopié ssi `end >= start`', () => {
    const document = documentWith({ id: 's1', objects: [] }, { source: { t: 'original' }, volume: 1, bounds: { start: 2, end: 6 } });
    const track = electBackgroundTrack({ document, sceneIndex: 0, carrier: carrier([{ id: 'aud', src: 'clip.m4a', mimeType: 'audio/m4a' }]) });
    expect(track?.bounds).toEqual({ startMs: 2000, endMs: 6000 });
  });
});

/**
 * `sceneHasControllableSound` (#6899, revue-correction) — le bouton son du
 * lecteur n'existe que s'il a un EFFET (loi 4). La première forme le montrait
 * sur `isDocumentAudible`, qui répond « le document SONNE-t-il ? » : vrai pour
 * un son de BIBLIOTHÈQUE que `electBackgroundTrack` ne sait pas encore servir
 * (question 9.2), et pour une vidéo de premier plan que le moteur joue
 * toujours MUETTE — deux boutons inertes. Miroir de
 * `StoryAudioAvailability.hasAudibleSound` (`StoryViewerView.swift:1796`),
 * réduit à ce que le lecteur web JOUE réellement.
 */
describe('sceneHasControllableSound — un bouton son qui a un effet', () => {
  const media = (id: string, payload: Record<string, unknown>, plane = 'content') => ({
    id,
    kind: 'media',
    anchor: { t: 'free', x: 0.5, y: 0.5 },
    plane,
    z: 1,
    transform: { scale: 1, rotation: 0, opacity: 1 },
    payload,
  });

  test('une piste de fond élue ⇒ vrai', () => {
    const document = documentWith({ id: 's1', objects: [] }, { source: { t: 'original' }, volume: 1 });
    expect(sceneHasControllableSound({ document, sceneIndex: 0, carrier: carrier([{ id: 'aud', src: 'clip.m4a', mimeType: 'audio/m4a' }]) })).toBe(true);
  });

  test('un son de BIBLIOTHÈQUE non servi ⇒ faux, même si le document « sonne »', () => {
    const document = documentWith({ id: 's1', objects: [] }, { source: { t: 'library', soundId: 'lib-1' }, volume: 1 });
    expect(sceneHasControllableSound({ document, sceneIndex: 0, carrier: carrier([]) })).toBe(false);
  });

  test('une VIDÉO DE FOND non muette ⇒ vrai ; déclarée `muted` ⇒ faux', () => {
    const sounding = documentWith({ id: 's1', objects: [media('v', { isBackground: true, postMediaId: 'm', mediaType: 'video/mp4' })] });
    const silent = documentWith({ id: 's1', objects: [media('v', { isBackground: true, postMediaId: 'm', mediaType: 'video/mp4', muted: true })] });
    expect(sceneHasControllableSound({ document: sounding, sceneIndex: 0, carrier: carrier([]) })).toBe(true);
    expect(sceneHasControllableSound({ document: silent, sceneIndex: 0, carrier: carrier([]) })).toBe(false);
  });

  test('une vidéo de PREMIER PLAN seule ⇒ faux (le moteur la joue muette)', () => {
    const document = documentWith({
      id: 's1',
      objects: [media('bg', { background: '#000000' }, 'bg'), media('v', { postMediaId: 'm', mediaType: 'video/mp4' })],
    });
    expect(sceneHasControllableSound({ document, sceneIndex: 0, carrier: carrier([]) })).toBe(false);
  });
});
