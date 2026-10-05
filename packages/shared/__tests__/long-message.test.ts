/**
 * La loi d'extrait d'un message long (#8147) — témoins de comportement et
 * rejeu des vecteurs partagés avec iOS
 * (`fixtures/long-message/excerpt.vectors.json`, générés en EXÉCUTANT la loi,
 * jamais à la main).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  LONG_MESSAGE_EXCERPT_RATIO,
  LONG_MESSAGE_THRESHOLD,
  longMessageExcerpt,
  type LongMessageExcerpt,
} from '../utils/long-message.js';

type ExcerptVector = {
  readonly _label: string;
  readonly input: { readonly text: string };
  readonly expected: LongMessageExcerpt;
};

const VECTORS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'long-message',
  'excerpt.vectors.json',
);

const loadVectors = (): readonly ExcerptVector[] =>
  JSON.parse(readFileSync(VECTORS_PATH, 'utf8')) as readonly ExcerptVector[];

const graphemeCount = (text: string): number =>
  Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)).length;

const wordsOf = (count: number): string =>
  Array.from({ length: count }, (_, index) => `mot${index % 10}`).join(' ');

describe('longMessageExcerpt — le seuil', () => {
  it('garde les constantes du contrat partagé avec iOS', () => {
    expect(LONG_MESSAGE_THRESHOLD).toBe(512);
    expect(LONG_MESSAGE_EXCERPT_RATIO).toBe(0.25);
  });

  it('ne tronque pas un message de 512 graphèmes, tronque celui de 513', () => {
    expect(longMessageExcerpt('b'.repeat(512))).toEqual({ truncated: false, excerpt: 'b'.repeat(512) });
    expect(longMessageExcerpt('b'.repeat(513)).truncated).toBe(true);
  });

  it('compte les GRAPHÈMES, pas les unités UTF-16 : 300 familles emoji ne sont pas un message long', () => {
    const family = '👨‍👩‍👧‍👦';
    const text = family.repeat(300);
    expect(text.length).toBeGreaterThan(LONG_MESSAGE_THRESHOLD);
    expect(longMessageExcerpt(text)).toEqual({ truncated: false, excerpt: text });
  });
});

describe('longMessageExcerpt — la coupe au mot', () => {
  it('coupe à la dernière frontière de mot avant le quart, sans jamais couper un mot', () => {
    const text = wordsOf(200);
    const { truncated, excerpt } = longMessageExcerpt(text);
    const target = Math.floor(graphemeCount(text) * LONG_MESSAGE_EXCERPT_RATIO);

    expect(truncated).toBe(true);
    expect(graphemeCount(excerpt)).toBeLessThanOrEqual(target);
    expect(text.startsWith(excerpt)).toBe(true);
    expect(text[excerpt.length]).toBe(' ');
    expect(excerpt.endsWith(' ')).toBe(false);
  });

  it("retire la ponctuation d'ouverture et l'espace traînantes", () => {
    const text = `${'x'.repeat(130)} ( ${'y'.repeat(20)} ${wordsOf(80)}`;
    expect(longMessageExcerpt(text).excerpt).toBe('x'.repeat(130));
  });

  it("l'espace insécable n'est pas une frontière", () => {
    const text = 'prix 100 € '.repeat(70);
    const { excerpt } = longMessageExcerpt(text);
    expect(excerpt.endsWith('€')).toBe(true);
  });

  it('coupe au graphème quand aucune frontière ne tombe dans la cible (chinois sans espace)', () => {
    const text = '你好世界这是一个很长的消息'.repeat(50);
    const { excerpt } = longMessageExcerpt(text);
    expect(graphemeCount(excerpt)).toBe(Math.floor(graphemeCount(text) * LONG_MESSAGE_EXCERPT_RATIO));
  });

  it("ne scinde jamais un graphème composé à la coupe brute", () => {
    const text = '👍🏽'.repeat(600);
    const { excerpt } = longMessageExcerpt(text);
    expect(excerpt).toBe('👍🏽'.repeat(150));
  });

  it("n'ajoute pas d'ellipse : l'interface la pose", () => {
    const { excerpt } = longMessageExcerpt(wordsOf(200));
    expect(excerpt.endsWith('…')).toBe(false);
  });
});

describe('longMessageExcerpt — vecteurs partagés avec iOS', () => {
  const vectors = loadVectors();

  it('charge au moins vingt cas (jamais de vert silencieux)', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(20);
  });

  vectors.forEach((vector) => {
    it(`${vector._label}`, () => {
      expect(longMessageExcerpt(vector.input.text)).toEqual(vector.expected);
    });
  });

  vectors
    .filter((vector) => vector.expected.truncated)
    .forEach((vector) => {
      it(`${vector._label} : un préfixe du texte, sous la moitié`, () => {
        const { excerpt } = vector.expected;
        expect(vector.input.text.startsWith(excerpt)).toBe(true);
        expect(excerpt.length).toBeGreaterThan(0);
        expect(graphemeCount(excerpt) * 2).toBeLessThan(graphemeCount(vector.input.text));
      });
    });
});
