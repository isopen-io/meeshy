import { describe, expect, test } from 'bun:test';

import { layoutMessageCard, type CardMediaOp, type CardOp, type CardTextOp, type Measure, type MessageCardInput } from './message-card-layout';
import type { CardMedia } from './message-card-media';
import { HERO_MARGIN, HERO_UNKNOWN_RATIO } from './message-card-hero';
import { THREAD_INDENT, threadRoom, threadSeparatorWidth, threadShift } from './message-card-thread';

/** L'imbrication d'un fil par la séparation du template, et le héros du support (#10915). */

const measure: Measure = (text, font) => Array.from(text).length * Number(/(\d+)px/.exec(font)?.[1] ?? '10') * 0.5;
const photo: CardMedia = { kind: 'image', width: 1600, height: 900, mimeType: 'image/jpeg' };
const mine: CardMedia = { kind: 'image', width: 800, height: 800, mimeType: 'image/jpeg' };

const input = (overrides: Partial<MessageCardInput> = {}): MessageCardInput => ({
  quoted: { author: 'Awa', text: 'Le coucher de soleil' },
  reply: { author: 'Cleo', text: 'Sur la corniche' },
  handle: 'cleo',
  template: 'aurore.rond.filet',
  ...overrides,
});
const layout = (overrides: Partial<MessageCardInput> = {}) => layoutMessageCard(input(overrides), measure);
const medias = (ops: readonly CardOp[]) => ops.filter((op): op is CardMediaOp => op.kind === 'media');
const text = (ops: readonly CardOp[], value: string) => ops.find((op): op is CardTextOp => op.kind === 'text' && op.text === value);

describe('les lois du fil (miroir de MessageCardThread.swift)', () => {
  test('retrait de 44 par niveau, borné à 3 ; séparation de 160 qui décroît d’un retrait par niveau', () => {
    expect(THREAD_INDENT).toBe(44);
    expect([0, 1, 2, 3, 9].map(threadShift)).toEqual([0, 44, 88, 132, 132]);
    expect([1, 2, 3].map(threadSeparatorWidth)).toEqual([160, 116, 72]);
    expect(threadSeparatorWidth(6)).toBe(44);
    expect(threadRoom(300, 3)).toBe(240);
  });
});

describe('l’imbrication dans la carte', () => {
  const context = [{ part: { author: 'Bob', text: 'Magnifique' }, depth: 0 }, { part: { author: 'Dan', text: 'Où ça' }, depth: 1 }];

  test('une réponse de niveau 1 est retirée et précédée de la séparation du template — jamais d’une barre', () => {
    const flat = layout({ context, replyDepth: 0 });
    const nested = layout({ context, replyDepth: 1 });
    expect((text(nested.ops, 'Sur la corniche')?.x ?? 0) - (text(flat.ops, 'Sur la corniche')?.x ?? 0)).toBe(THREAD_INDENT);
    const separators = (ops: readonly CardOp[]) => ops.filter((op) => op.kind === 'separator').length;
    expect(separators(nested.ops)).toBeGreaterThan(separators(flat.ops));
    expect(nested.ops.filter((op) => op.kind === 'bar').length).toBe(layout({ context: [], replyDepth: 0 }).ops.filter((op) => op.kind === 'bar').length);
  });

  test('chaque niveau retire son texte d’un cran', () => {
    const nested = layout({ context });
    expect((text(nested.ops, 'Où ça')?.x ?? 0) - (text(nested.ops, 'Magnifique')?.x ?? 0)).toBe(THREAD_INDENT);
  });

  test('la séparation suit le template : la flèche pose ↳, le silence ne trace rien', () => {
    expect(text(layout({ template: 'aurore.rond.fleche', context, replyDepth: 1 }).ops, '↳')).toBeDefined();
    const silent = layout({ template: 'aurore.rond.silence', context: [], replyDepth: 1 });
    expect(silent.ops.some((op) => op.kind === 'separator')).toBe(false);
  });

  test('la hauteur grandit avec l’imbrication, jamais au-delà de la carte', () => {
    expect(layout({ context, replyDepth: 1 }).height).toBeGreaterThanOrEqual(layout({ context: [], replyDepth: 0 }).height);
    expect(layout({ context, replyDepth: 1 }).height).toBeLessThanOrEqual(1920);
  });
});

describe('le héros du support', () => {
  test('ouvre la carte : grand, pleine largeur, AVANT la citation', () => {
    const l = layout({ media: [photo], heroMedia: 0 });
    const [hero] = medias(l.ops);
    expect([hero?.x, hero?.width]).toEqual([HERO_MARGIN, 1080 - 2 * HERO_MARGIN]);
    expect(hero?.y ?? 0).toBeLessThan(text(l.ops, 'Awa')?.y ?? 0);
    expect(text(l.ops, 'Awa')?.y ?? 0).toBeLessThan(text(l.ops, 'Cleo')?.y ?? 0);
  });

  test('ne compte pas parmi les médias de la réponse', () => {
    const l = layout({ media: [photo, mine], heroMedia: 0 });
    const ops = medias(l.ops);
    expect(ops.map((op) => op.index)).toEqual([0, 1]);
    expect(ops[0]?.width).toBe(1080 - 2 * HERO_MARGIN);
    expect(ops[1]?.y ?? 0).toBeGreaterThan(text(l.ops, 'Awa')?.y ?? 0);
  });

  test('sans texte de citation, le héros garde la ligne du support (l’auteur)', () => {
    const l = layout({ quoted: { author: 'Awa', text: '' }, media: [photo], heroMedia: 0 });
    expect(text(l.ops, 'Awa')).toBeDefined();
  });

  test('sans héros, la citation sans texte reste absente (inchangé)', () => {
    expect(text(layout({ quoted: { author: 'Awa', text: '' } }).ops, 'Awa')).toBeUndefined();
  });

  test('le héros ne dépasse pas 45 % de la hauteur utile', () => {
    const tall: CardMedia = { kind: 'image', width: 900, height: 1600, mimeType: 'image/jpeg' };
    const [hero] = medias(layout({ media: [tall], heroMedia: 0 }).ops);
    expect(hero?.height ?? 0).toBeLessThanOrEqual(Math.round((1920 - 272) * 0.45));
  });

  test('son rapport : celui du média, borné de 16:9 à 4:5 ; inconnu, 4:3 (miroir de MessageCardHero.swift)', () => {
    const width = 1080 - 2 * HERO_MARGIN;
    const heightOf = (media: CardMedia) => medias(layout({ aspect: 'auto', media: [media], heroMedia: 0 }).ops)[0]?.height;
    expect(heightOf({ kind: 'image', width: 0, height: 0 })).toBe(Math.round(width * HERO_UNKNOWN_RATIO));
    expect(heightOf({ kind: 'image', width: 3000, height: 1000, mimeType: 'image/jpeg' })).toBe(Math.round(width * 0.5625));
    expect(heightOf({ kind: 'image', width: 1500, height: 1000, mimeType: 'image/jpeg' })).toBe(Math.round(width / 1.5));
    expect(heightOf({ kind: 'image', width: 1000, height: 1000, mimeType: 'image/jpeg' })).toBe(Math.floor((1920 - 2 * 136) * 0.45));
  });

  test('un en-tête couché dans la marge ramène le héros sur la colonne de texte', () => {
    const [hero] = medias(layout({ title: 'Dakar', frame: { header: 'up', authors: 'top', tilt: 'none' }, media: [photo], heroMedia: 0 }).ops);
    expect([hero?.x, hero?.width]).toEqual([96, 888]);
  });

  test('un héros sticker se pose ajusté, jamais coupé', () => {
    const sticker: CardMedia = { kind: 'image', width: 512, height: 512, mimeType: 'image/png' };
    const [hero] = medias(layout({ media: [sticker], heroMedia: 0 }).ops);
    expect(hero?.contain).toBe(true);
  });

  test('le visuel de la réponse seule prend au plus 42 % de la hauteur utile quand du texte l’accompagne', () => {
    const tall: CardMedia = { kind: 'image', width: 900, height: 1600, mimeType: 'image/jpeg' };
    const [op] = medias(layout({ media: [tall] }).ops);
    expect(op?.height ?? 0).toBeLessThanOrEqual(Math.round((1920 - 272) * 0.42));
  });
});
