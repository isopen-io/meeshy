import { describe, expect, test } from 'bun:test';

import { layoutMessageCard, type CardMediaOp, type CardOp, type Measure, type MessageCardInput } from './message-card-layout';
import { CARD_AUDIO_STYLES, CARD_MEDIA_STYLES, formatDuration, normalizePeaks, shortName, type CardMedia } from './message-card-media';

const measure: Measure = (text, font) => {
  const size = Number(/(\d+)px/.exec(font)?.[1] ?? '10');
  return Array.from(text).length * size * 0.5;
};

const photo = (width = 1200, height = 900): CardMedia => ({ kind: 'image', width, height });
const clip: CardMedia = { kind: 'video', width: 1920, height: 1080 };
const voice: CardMedia = { kind: 'audio', durationMs: 67_000, name: 'note.m4a', peaks: [6, 12, 22, 9, 15] };

const input = (media: readonly CardMedia[], overrides: Partial<MessageCardInput> = {}): MessageCardInput => ({
  quoted: null,
  reply: { author: 'Jacques', text: 'Regarde ça !' },
  handle: 'jacques',
  template: 'aurore.rond.orbite',
  media,
  ...overrides,
});

const mediaOps = (ops: readonly CardOp[]): CardMediaOp[] => ops.filter((op): op is CardMediaOp => op.kind === 'media');
const kinds = (ops: readonly CardOp[]) => ops.map((op) => op.kind);

describe('les médias d’une carte', () => {
  test('une image est posée au-dessus du texte de la réponse, dans la colonne du texte', () => {
    const layout = layoutMessageCard(input([photo()]), measure);
    const [image] = mediaOps(layout.ops);
    const caption = layout.ops.find((op) => op.kind === 'text' && op.text === 'Regarde ça !');
    expect(image?.index).toBe(0);
    expect(image?.x).toBe(96);
    expect(image?.width).toBe(1080 - 2 * 96);
    expect(caption?.kind === 'text' && image !== undefined && caption.y > image.y + image.height).toBe(true);
    expect(layout.regions.map((region) => region.part)).toContain('media');
  });

  test('une vidéo est sa PREMIÈRE IMAGE, marquée du triangle de lecture', () => {
    const layout = layoutMessageCard(input([clip]), measure);
    expect(mediaOps(layout.ops)[0]?.video).toBe(true);
    expect(kinds(layout.ops)).toContain('play');
  });

  test('la MOSAÏQUE range quatre images en deux colonnes ; la cinquième se dit « +1 »', () => {
    const layout = layoutMessageCard(input([photo(), photo(), photo(), photo(), photo()], { mediaStyle: 'mosaique' }), measure);
    const tiles = mediaOps(layout.ops);
    expect(tiles).toHaveLength(4);
    expect(new Set(tiles.map((tile) => tile.x)).size).toBe(2);
    expect(layout.ops.some((op) => op.kind === 'text' && op.text === '+1')).toBe(true);
  });

  test('la BANDE aligne des vignettes carrées sur une ligne', () => {
    const tiles = mediaOps(layoutMessageCard(input([photo(), photo(), photo()], { mediaStyle: 'bande' }), measure).ops);
    expect(new Set(tiles.map((tile) => tile.y)).size).toBe(1);
    expect(tiles.every((tile) => tile.width === tile.height)).toBe(true);
  });

  test('la PLEINE largeur ne montre que la première pièce', () => {
    const tiles = mediaOps(layoutMessageCard(input([photo(), photo()], { mediaStyle: 'pleine' }), measure).ops);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]?.width).toBe(1080 - 2 * 96);
  });

  test('chaque disposition garde les médias dans la carte', () => {
    for (const mediaStyle of CARD_MEDIA_STYLES) {
      const layout = layoutMessageCard(input([photo(400, 4000), clip, photo()], { mediaStyle }), measure);
      expect(mediaOps(layout.ops).every((tile) => tile.y + tile.height <= layout.height && tile.x + tile.width <= layout.width)).toBe(true);
    }
  });

  test('l’audio a QUATRE représentations, chacune distincte, toutes avec sa durée ou son onde', () => {
    const shapes = CARD_AUDIO_STYLES.map((audioStyle) => kinds(layoutMessageCard(input([voice], { audioStyle }), measure).ops).join(','));
    expect(new Set(shapes).size).toBe(CARD_AUDIO_STYLES.length);
    for (const audioStyle of CARD_AUDIO_STYLES) {
      const ops = layoutMessageCard(input([voice], { audioStyle }), measure).ops;
      expect(ops.some((op) => op.kind === 'wave' || (op.kind === 'text' && op.text.includes('1:07')))).toBe(true);
    }
  });

  test('un message SANS texte mais avec un média s’image quand même', () => {
    const layout = layoutMessageCard(input([photo()], { reply: { author: 'Jacques', text: '' } }), measure);
    expect(mediaOps(layout.ops)).toHaveLength(1);
    expect(layout.ops.some((op) => op.kind === 'text' && op.text === '')).toBe(false);
  });

  test('en arabe, la bande part de la DROITE', () => {
    const tiles = mediaOps(layoutMessageCard(input([photo(), photo()], { mediaStyle: 'bande', reply: { author: 'ج', text: 'انظر' } }), measure).ops);
    expect((tiles[0]?.x ?? 0) > (tiles[1]?.x ?? 0)).toBe(true);
  });

  test('outils : durée lisible, onde normalisée, nom raccourci au milieu', () => {
    expect(formatDuration(67_000)).toBe('1:07');
    expect(formatDuration(4_400)).toBe('0:04');
    expect(Math.max(...normalizePeaks([2, 4, 8]))).toBe(1);
    expect(normalizePeaks([0, 0])).toEqual([0.3, 0.3]);
    const name = shortName('un-tres-long-nom-de-fichier-enregistre-hier.m4a');
    expect(Array.from(name).length).toBeLessThanOrEqual(32);
    expect(name.endsWith('hier.m4a')).toBe(true);
  });
});
