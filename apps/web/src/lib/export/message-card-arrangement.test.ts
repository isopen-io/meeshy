import { describe, expect, test } from 'bun:test';

import { CARD_MEDIA_ARRANGEMENTS, paintedMediaIndexes, paintedVisualIndexes, type CardMediaDisposition } from './message-card-arrangement';
import { layoutMessageCard, type CardMediaOp, type CardOp, type CardTextOp, type Measure, type MessageCardInput } from './message-card-layout';
import type { CardMedia } from './message-card-media';
import { cardOutputsOf } from './message-card-output';

/**
 * « Imagine » (#9236, jumelle web de #9235) — OÙ se posent les médias
 * (au-dessus, en dessous, à gauche, à droite, en fond), COMMENT ils s'agencent
 * (une seule choisie, la grille, les dispositions des posts), et QUI les a
 * postés. Transposition de `MessageCardMediaArrangementTests.swift`.
 */

const measure: Measure = (text, font) => {
  const size = Number(/(\d+)px/.exec(font)?.[1] ?? '10');
  return Array.from(text).length * size * 0.5;
};

const photo = (credit?: string): CardMedia => ({ kind: 'image', width: 1000, height: 1000, ...(credit === undefined ? {} : { credit }) });
const clip: CardMedia = { kind: 'video', width: 1920, height: 1080 };
const voice: CardMedia = { kind: 'audio', durationMs: 30_000, name: 'note.m4a', peaks: [1, 2, 3] };
const three: readonly CardMedia[] = [photo('Awa'), photo('Jacques'), photo('Awa')];
const six: readonly CardMedia[] = Array.from({ length: 6 }, () => photo());

const disposition = (overrides: Partial<CardMediaDisposition> = {}): CardMediaDisposition => ({ layout: 'above', arrangement: 'single', featured: null, ...overrides });

const input = (media: readonly CardMedia[], overrides: Partial<MessageCardInput> = {}): MessageCardInput => ({
  quoted: null,
  reply: { author: 'Jacques', text: 'Chez Lina, à 20 h !' },
  handle: 'jacques',
  template: 'aurore.rond.orbite',
  media,
  ...overrides,
});

const layout = (media: readonly CardMedia[], overrides: Partial<MessageCardInput> = {}) => layoutMessageCard(input(media, overrides), measure);
const tiles = (ops: readonly CardOp[]): CardMediaOp[] => ops.filter((op): op is CardMediaOp => op.kind === 'media');
const texts = (ops: readonly CardOp[]): CardTextOp[] => ops.filter((op): op is CardTextOp => op.kind === 'text');

const PAD_X = 96;
const TEXT_WIDTH = 1080 - 2 * PAD_X;
const BESIDE_GAP = 40;

describe('ce que la carte peint', () => {
  test('une seule image est celle CHOISIE, et un choix inconnu retombe sur la première', () => {
    expect(paintedVisualIndexes(three, disposition({ featured: 1 }))).toEqual([1]);
    expect(paintedVisualIndexes(three, disposition({ featured: 7 }))).toEqual([0]);
    expect(paintedVisualIndexes(three, disposition({ layout: 'backdrop', arrangement: 'wave', featured: 2 }))).toEqual([2]);
  });

  test('la grille et les dispositions de post montrent les quatre premiers, et le son reste', () => {
    for (const arrangement of CARD_MEDIA_ARRANGEMENTS.filter((candidate) => candidate !== 'single')) {
      expect({ arrangement, painted: paintedVisualIndexes(six, disposition({ arrangement })) }).toEqual({ arrangement, painted: [0, 1, 2, 3] });
    }
    expect(paintedMediaIndexes([...three, voice], disposition())).toEqual([0, 3]);
  });

  test('les sorties offertes suivent ce que la carte MONTRE', () => {
    const media = [photo(), clip];
    const outputsOf = (featured: number) => cardOutputsOf(paintedMediaIndexes(media, disposition({ featured })).flatMap((index) => media[index] ?? []));
    expect(outputsOf(0)).toEqual(['image']);
    expect(outputsOf(1)).toEqual(['image', 'gif', 'video']);
  });
});

describe('où', () => {
  test('à GAUCHE : les médias prennent une colonne et la réponse se resserre à côté', () => {
    const card = layout([photo()], { mediaLayout: 'left' });
    const [picture] = tiles(card.ops);
    const reply = texts(card.ops).find((op) => op.text.startsWith('Chez'));
    expect(picture?.x).toBe(PAD_X);
    expect(picture !== undefined && reply !== undefined && reply.x >= picture.x + picture.width + BESIDE_GAP).toBe(true);
    const media = card.regions.find((region) => region.part === 'media');
    expect(media?.y).toBe(card.regions.find((region) => region.part === 'reply')?.y);
    expect(media?.width).toBe(picture?.width);
  });

  test('à DROITE : la colonne épouse le bord droit, et aucune ligne de la réponse ne la traverse', () => {
    const long = 'mot '.repeat(60).trim();
    const card = layout([photo()], { mediaLayout: 'right', reply: { author: 'Jacques', text: long } });
    const [picture] = tiles(card.ops);
    expect(picture === undefined ? null : Math.abs(picture.x + picture.width - (1080 - PAD_X)) <= 1).toBe(true);
    const lines = texts(card.ops).filter((op) => op.text.startsWith('mot'));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => picture !== undefined && line.x + measure(line.text, line.font) <= picture.x - BESIDE_GAP + 1)).toBe(true);
  });

  test('sans visuel, ni colonne ni fond : le son reste au-dessus de la réponse', () => {
    for (const mediaLayout of ['left', 'backdrop'] as const) {
      const card = layout([voice], { mediaLayout });
      expect(card.regions.map((region) => region.part)).toEqual(['reply', 'media']);
      expect(card.regions.find((region) => region.part === 'media')?.width).toBe(TEXT_WIDTH);
      expect(card.backdrop).toBeNull();
    }
  });

  test('EN DESSOUS : les médias suivent le texte de la réponse', () => {
    const card = layout([photo()], { mediaLayout: 'below' });
    const [picture] = tiles(card.ops);
    const reply = texts(card.ops).find((op) => op.text.startsWith('Chez'));
    expect(picture !== undefined && reply !== undefined && picture.y > reply.y).toBe(true);
  });

  test('EN FOND : le visuel choisi couvre la carte sous un voile, et rien ne se pose dans le texte', () => {
    const card = layout(three, { mediaLayout: 'backdrop', featuredMedia: 2 });
    expect(card.backdrop?.index).toBe(2);
    expect(card.backdrop?.veil.startsWith('rgba(')).toBe(true);
    expect(tiles(card.ops)).toEqual([]);
  });
});

describe('comment', () => {
  test('en VAGUE : des tuiles de même largeur, dont les hauteurs ondulent', () => {
    const [a, b, c] = tiles(layout(three, { mediaArrangement: 'wave' }).ops);
    expect([a?.index, b?.index, c?.index]).toEqual([0, 1, 2]);
    expect(a?.width).toBe(b?.width ?? -1);
    expect(b?.width).toBe(c?.width ?? -1);
    expect((b?.height ?? 0) < (a?.height ?? 0) && c?.height === a?.height).toBe(true);
  });

  test('en HERO : la première domine, les autres s’empilent à côté', () => {
    const [a, b, c] = tiles(layout(three, { mediaArrangement: 'hero' }).ops);
    expect((a?.width ?? 0) > (b?.width ?? 0) && b?.x === c?.x && (c?.y ?? 0) > (b?.y ?? 0)).toBe(true);
  });

  test('en ZIGZAG : les tuiles sautent du haut vers le bas', () => {
    const [a, b, c] = tiles(layout(three, { mediaArrangement: 'sine' }).ops);
    expect((b?.y ?? 0) > (a?.y ?? 0) && c?.y === a?.y).toBe(true);
  });

  test('chaque disposition compte ce qui reste sur la DERNIÈRE tuile, sous un voile', () => {
    for (const mediaArrangement of ['wave', 'hero', 'sine', 'mosaic'] as const) {
      const card = layout(six, { mediaArrangement });
      expect({ mediaArrangement, count: tiles(card.ops).length }).toEqual({ mediaArrangement, count: 4 });
      const badge = texts(card.ops).find((op) => op.text === '+2');
      const last = tiles(card.ops).at(-1);
      expect({ mediaArrangement, centered: badge !== undefined && last !== undefined && badge.align === 'center' && badge.x === last.x + last.width / 2 }).toEqual({ mediaArrangement, centered: true });
    }
  });

  test('une colonne à côté de la réponse s’agence aussi', () => {
    const placed = tiles(layout(three, { mediaLayout: 'right', mediaArrangement: 'mosaic' }).ops);
    expect(placed).toHaveLength(3);
    const column = Math.round(TEXT_WIDTH * 0.42);
    expect(placed.every((tile) => tile.x >= 1080 - PAD_X - column - 1)).toBe(true);
  });

  test('une seule image montre la pièce choisie, en pleine largeur', () => {
    const placed = tiles(layout(three, { mediaArrangement: 'single', featuredMedia: 1 }).ops);
    expect(placed.map((tile) => tile.index)).toEqual([1]);
    expect(placed[0]?.width).toBe(TEXT_WIDTH);
  });
});

describe('qui', () => {
  test('le crédit nomme qui a posté les visuels, une fois chacun, au-dessus d’eux', () => {
    const card = layout(three, { mediaArrangement: 'mosaic' });
    const credit = texts(card.ops).find((op) => op.text === 'Awa · Jacques');
    const [first] = tiles(card.ops);
    expect(credit !== undefined && first !== undefined && credit.y < first.y).toBe(true);
    expect(credit?.align).toBe('left');
  });

  test('les noms signés à la fin signent les visuels DESSOUS, au bout de la ligne', () => {
    const card = layout(three, { mediaArrangement: 'single', featuredMedia: 1, frame: { header: 'horizontal', authors: 'end', tilt: 'none' } });
    const credit = texts(card.ops).find((op) => op.text === '— Jacques');
    const [picture] = tiles(card.ops);
    expect(credit !== undefined && picture !== undefined && credit.y > picture.y + picture.height).toBe(true);
    expect(credit?.align).toBe('right');
  });

  test('jamais sur un fond, et seulement les visuels qui en portent un', () => {
    const backdrop = layout(three, { mediaLayout: 'backdrop' });
    expect(texts(backdrop.ops).some((op) => op.text.includes('Awa'))).toBe(false);
    const silent = layout([photo(), photo()], { mediaArrangement: 'mosaic' });
    expect(texts(silent.ops).some((op) => op.text.includes('·'))).toBe(false);
  });
});
