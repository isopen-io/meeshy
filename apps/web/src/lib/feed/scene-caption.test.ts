import { describe, expect, test } from 'bun:test';

import type { CanvasDocument, CanvasObject } from '@/lib/canvas/document';
import type { SceneCarrier } from '@/lib/canvas/carrier';

import { resolveSceneCaption } from './scene-caption';

const mediaObj = (overrides: Partial<CanvasObject>): CanvasObject => ({
  id: 'm',
  kind: 'media',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'content',
  z: 0,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload: {},
  ...overrides,
});

const textObj: CanvasObject = {
  id: 't',
  kind: 'text',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'fg',
  z: 1,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload: { text: 'x' },
};

describe('resolveSceneCaption — la légende de la scène REGARDÉE', () => {
  test('s2 adresse media-b légendé ⇒ légende de media-b, origine media', () => {
    const document: CanvasDocument = {
      v: 3,
      scenes: [
        { id: 's1', objects: [mediaObj({ id: 'm1', payload: { postMediaId: 'media-a' } })] },
        { id: 's2', objects: [mediaObj({ id: 'm2', payload: { postMediaId: 'media-b' } })] },
      ],
    };
    const carrier: SceneCarrier = {
      postId: 'p1',
      media: [
        { id: 'media-a', src: 'a.jpg' },
        { id: 'media-b', src: 'b.jpg', caption: 'The scene speaks', captionLanguage: 'en' },
      ],
    };
    expect(resolveSceneCaption({ sceneIndex: 1, document, carrier })).toEqual({ text: 'The scene speaks', language: 'en', origin: 'media' });
  });

  test('scène sans média, dans un document qui EN adresse ⇒ undefined', () => {
    const document: CanvasDocument = {
      v: 3,
      scenes: [{ id: 's1', objects: [mediaObj({ payload: { postMediaId: 'media-a' } })] }, { id: 's2', objects: [textObj] }],
    };
    const carrier: SceneCarrier = { postId: 'p1', media: [{ id: 'media-a', src: 'a.jpg', caption: 'x' }] };
    expect(resolveSceneCaption({ sceneIndex: 1, document, carrier })).toBeUndefined();
  });

  test('document qui n’adresse RIEN ⇒ premier visuel du post', () => {
    const document: CanvasDocument = { v: 3, scenes: [{ id: 's1', objects: [textObj] }] };
    const carrier: SceneCarrier = { postId: 'p1', media: [{ id: 'media-a', src: 'a.jpg', caption: 'Fallback' }] };
    expect(resolveSceneCaption({ sceneIndex: 0, document, carrier })).toEqual({ text: 'Fallback', origin: 'media' });
  });

  test('mediaId ET postMediaId reconnus', () => {
    const document: CanvasDocument = { v: 3, scenes: [{ id: 's1', objects: [mediaObj({ payload: { mediaId: 'media-a' } })] }] };
    const carrier: SceneCarrier = { postId: 'p1', media: [{ id: 'media-a', src: 'a.jpg', caption: 'C1 pano' }] };
    expect(resolveSceneCaption({ sceneIndex: 0, document, carrier })?.text).toBe('C1 pano');
  });

  test('JAMAIS le texte du post — le carrierFallback n’existe pas côté fil', () => {
    const document: CanvasDocument = { v: 3, scenes: [{ id: 's1', objects: [textObj] }] };
    const carrier: SceneCarrier = { postId: 'p1', media: [] };
    expect(resolveSceneCaption({ sceneIndex: 0, document, carrier })).toBeUndefined();
  });
});

describe('resolveSceneCaption — la légende PRÊTÉE par le post ne descend pas', () => {
  test('un média dont la légende vient du POST (`captionOrigin: post`) ⇒ undefined', () => {
    const document: CanvasDocument = { v: 3, scenes: [{ id: 's1', objects: [mediaObj({ payload: { postMediaId: 'media-a' } })] }] };
    const carrier: SceneCarrier = { postId: 'p1', media: [{ id: 'media-a', src: 'a.jpg', caption: 'Le texte du post', captionOrigin: 'post' }] };
    expect(resolveSceneCaption({ sceneIndex: 0, document, carrier })).toBeUndefined();
  });

  test('document qui n’adresse rien, premier visuel à légende PRÊTÉE ⇒ undefined', () => {
    const document: CanvasDocument = { v: 3, scenes: [{ id: 's1', objects: [textObj] }] };
    const carrier: SceneCarrier = { postId: 'p1', media: [{ id: 'media-a', src: 'a.jpg', caption: 'Le texte du post', captionOrigin: 'post' }] };
    expect(resolveSceneCaption({ sceneIndex: 0, document, carrier })).toBeUndefined();
  });
});
