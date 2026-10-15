import { describe, expect, test } from 'bun:test';

import { parseCanvasDocument } from '@/lib/canvas/document';

import { neighborsOf, previewKeyOf, previewPlanOf, sceneCarrierOf } from './post-preview';

/**
 * L'APERÇU D'UNE PUBLICATION SANS QUITTER LA LISTE (#10393) — ce qu'il montre (la
 * scène d'une story ou d'un réel, sinon chaque média dans son lecteur), et la
 * navigation à la précédente et à la suivante de la page.
 */
const media = (id: string, mimeType: string, overrides: Record<string, unknown> = {}) => ({
  id,
  mimeType,
  fileUrl: `/u/${id}`,
  thumbnailUrl: null,
  caption: null,
  alt: null,
  fileSize: null,
  durationMs: null,
  transcription: null,
  ...overrides,
});

const SCENE = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects: [] }] });

describe('previewPlanOf — la scène d’abord, sinon chaque média dans son lecteur', () => {
  test('une story ou un réel qui porte une scène se rend par le lecteur de scène', () => {
    expect(previewPlanOf({ type: 'STORY', canvas: SCENE, media: [media('m1', 'image/jpeg')] })).toEqual({ kind: 'scene', mode: 'story' });
    expect(previewPlanOf({ type: 'REEL', canvas: SCENE, media: [] })).toEqual({ kind: 'scene', mode: 'reel' });
    expect(previewPlanOf({ type: 'POST', canvas: SCENE, media: [] })).toEqual({ kind: 'scene', mode: 'card' });
  });

  test('sans scène, chaque média se lit : vidéo, audio, image en plein format ; un fichier reste un lien', () => {
    const plan = previewPlanOf({ type: 'POST', canvas: null, media: [media('v', 'video/mp4'), media('a', 'audio/mpeg'), media('i', 'image/png'), media('f', 'application/pdf')] });
    expect(plan).toEqual({
      kind: 'media',
      items: [
        { id: 'v', player: 'video', src: '/u/v', poster: null },
        { id: 'a', player: 'audio', src: '/u/a', poster: null },
        { id: 'i', player: 'image', src: '/u/i', poster: null },
        { id: 'f', player: 'file', src: '/u/f', poster: null },
      ],
    });
  });

  test('un média sans adresse n’est pas offert ; rien du tout ⇒ texte seul', () => {
    expect(previewPlanOf({ type: 'STATUS', canvas: null, media: [media('x', 'image/png', { fileUrl: null })] })).toEqual({ kind: 'text' });
  });
});

describe('sceneCarrierOf — les médias de la publication, adressés comme le fil', () => {
  test('chaque média garde son identité, sa source et sa vignette', () => {
    expect(sceneCarrierOf('p1', [media('m1', 'video/mp4', { thumbnailUrl: '/u/t' })], (url) => `https://cdn${url}`)).toEqual({
      postId: 'p1',
      media: [{ id: 'm1', src: 'https://cdn/u/m1', mimeType: 'video/mp4', poster: 'https://cdn/u/t' }],
    });
  });
});

describe('neighborsOf — précédente et suivante dans la page', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  test('au milieu, les deux voisines ; aux bords, une seule', () => {
    expect(neighborsOf(rows, 'b')).toEqual({ previous: 'a', next: 'c' });
    expect(neighborsOf(rows, 'a')).toEqual({ previous: null, next: 'b' });
    expect(neighborsOf(rows, 'c')).toEqual({ previous: 'b', next: null });
  });
  test('une publication absente de la page n’a pas de voisine', () => {
    expect(neighborsOf(rows, 'z')).toEqual({ previous: null, next: null });
  });
});

describe('previewKeyOf — j, k et les flèches', () => {
  test('j et flèche bas/droite ⇒ suivante ; k et flèche haut/gauche ⇒ précédente ; le reste ⇒ rien', () => {
    expect(['j', 'J', 'ArrowDown', 'ArrowRight'].map(previewKeyOf)).toEqual(['next', 'next', 'next', 'next']);
    expect(['k', 'K', 'ArrowUp', 'ArrowLeft'].map(previewKeyOf)).toEqual(['previous', 'previous', 'previous', 'previous']);
    expect(['Enter', 'x', ' '].map(previewKeyOf)).toEqual([null, null, null]);
  });
});
