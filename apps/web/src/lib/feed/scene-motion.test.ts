import { describe, expect, test } from 'bun:test';

import { parseCanvasDocument, type CanvasDocument, type CanvasObject, type CanvasScene } from '@/lib/canvas/document';

import { documentSoundsOnStage, isDocumentAudible, isDocumentCinematic } from './scene-motion';

const obj = (overrides: Partial<CanvasObject>): CanvasObject => ({
  id: 'o',
  kind: 'text',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'content',
  z: 0,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload: {},
  ...overrides,
});

const doc = (objects: readonly CanvasObject[]): CanvasDocument => ({ v: 3, scenes: [{ id: 's', objects } as CanvasScene] });

describe('isDocumentCinematic / isDocumentAudible — le mouvement d’une scène', () => {
  test('audio ⇒ les deux', () => {
    const d = doc([obj({ kind: 'audio' })]);
    expect(isDocumentCinematic(d)).toBe(true);
    expect(isDocumentAudible(d)).toBe(true);
  });

  test('vidéo muted:true ⇒ cinématique, pas audible', () => {
    const d = doc([obj({ kind: 'media', payload: { mediaType: 'video/mp4', muted: true } })]);
    expect(isDocumentCinematic(d)).toBe(true);
    expect(isDocumentAudible(d)).toBe(false);
  });

  test('vidéo NON muette ⇒ les deux', () => {
    const d = doc([obj({ kind: 'media', payload: { mediaType: 'video/mp4' } })]);
    expect(isDocumentCinematic(d)).toBe(true);
    expect(isDocumentAudible(d)).toBe(true);
  });

  test('sticker animation ⇒ cinématique, pas audible', () => {
    const d = doc([obj({ kind: 'sticker', payload: { animation: 'bounce' } })]);
    expect(isDocumentCinematic(d)).toBe(true);
    expect(isDocumentAudible(d)).toBe(false);
  });

  test('image avec duration:10 ⇒ NI l’un ni l’autre (duration qualifie le FICHIER)', () => {
    const d = doc([obj({ kind: 'media', payload: { mediaType: 'image/png', duration: 10 } })]);
    expect(isDocumentCinematic(d)).toBe(false);
    expect(isDocumentAudible(d)).toBe(false);
  });

  test('texte fadeIn:0.3 ⇒ cinématique', () => {
    const d = doc([obj({ payload: { fadeIn: 0.3 } })]);
    expect(isDocumentCinematic(d)).toBe(true);
    expect(isDocumentAudible(d)).toBe(false);
  });

  test('document.sound ⇒ les deux, même sans objet qui bouge', () => {
    const d: CanvasDocument = { v: 3, scenes: [{ id: 's', objects: [obj({})] }], sound: { source: { t: 'original' }, volume: 1 } };
    expect(isDocumentCinematic(d)).toBe(true);
    expect(isDocumentAudible(d)).toBe(true);
  });

  test('rien de tout ça ⇒ ni cinématique ni audible', () => {
    const d = doc([obj({})]);
    expect(isDocumentCinematic(d)).toBe(false);
    expect(isDocumentAudible(d)).toBe(false);
  });
});

describe('documentSoundsOnStage — ce qui sonne SUR la scène, hors son de fond (#9737)', () => {
  const object = (kind: string, payload: Record<string, unknown>) => ({
    id: `${kind}-1`,
    kind,
    anchor: { t: 'free', x: 0.5, y: 0.5 },
    plane: 'content',
    z: 0,
    transform: { scale: 1, rotation: 0, opacity: 1 },
    payload,
  });
  const documentOf = (objects: readonly unknown[], sound?: unknown) => {
    const parsed = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects }], ...(sound !== undefined ? { sound } : {}) });
    if (parsed === null) throw new Error('vecteur invalide');
    return parsed;
  };

  test('un son de fond seul — objet ou déclaration du document — ne sonne pas sur la scène', () => {
    const fond = documentOf([object('audio', { isBackground: true })]);
    const declare = documentOf([object('text', { content: 'x' })], { source: { t: 'original' }, volume: 1 });
    expect(isDocumentAudible(fond)).toBe(true);
    expect(documentSoundsOnStage(fond)).toBe(false);
    expect(isDocumentAudible(declare)).toBe(true);
    expect(documentSoundsOnStage(declare)).toBe(false);
  });

  test('un son de premier plan ou une vidéo non muette sonnent sur la scène, même à côté d’un fond', () => {
    expect(documentSoundsOnStage(documentOf([object('audio', { isBackground: true }), object('audio', {})]))).toBe(true);
    expect(documentSoundsOnStage(documentOf([object('audio', { isBackground: true }), object('media', { mediaType: 'video/mp4' })]))).toBe(true);
    expect(documentSoundsOnStage(documentOf([object('media', { mediaType: 'video/mp4', muted: true })]))).toBe(false);
  });
});
