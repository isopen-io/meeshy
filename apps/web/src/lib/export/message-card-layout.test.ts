import { describe, expect, test } from 'bun:test';

import {
  CARD_MAX_HEIGHT,
  CARD_MIN_HEIGHT,
  CARD_WIDTH,
  layoutMessageCard,
  textDirection,
  truncateLines,
  wrapText,
  type CardOp,
  type CardTextOp,
  type Measure,
  type MessageCardInput,
} from './message-card-layout';
import { MESSAGE_CARD_STYLE_IDS } from './message-card-styles';

/** Une règle fixe : chaque caractère mesure la moitié de la taille de police. */
const measure: Measure = (text, font) => {
  const size = Number(/(\d+)px/.exec(font)?.[1] ?? '10');
  return Array.from(text).length * size * 0.5;
};

/** Une règle de largeur par caractère, indépendante de la police. */
const perChar =
  (width: number): Measure =>
  (text) =>
    Array.from(text).length * width;

const cardInput = (overrides: Partial<MessageCardInput> = {}): MessageCardInput => ({
  quoted: { author: 'Awa', text: 'On se retrouve où ce soir ?' },
  reply: { author: 'Jacques', text: 'Chez Lina, à 20 h !' },
  exporter: 'Jacques',
  footerLabel: 'Exporté par Jacques',
  style: 'aurore',
  ...overrides,
});

const texts = (ops: readonly CardOp[]): CardTextOp[] => ops.filter((op): op is CardTextOp => op.kind === 'text');
const sizeOf = (op: CardTextOp): number => Number(/(\d+)px/.exec(op.font)?.[1] ?? '0');
const opWithText = (ops: readonly CardOp[], text: string): CardTextOp | undefined => texts(ops).find((op) => op.text === text);

describe('wrapText — des lignes qui tiennent dans la carte', () => {
  test('coupe aux espaces sans jamais dépasser la largeur', () => {
    const lines = wrapText('un deux trois quatre cinq six', 10, 'f', perChar(1));
    expect(lines).toEqual(['un deux', 'trois', 'quatre', 'cinq six']);
    expect(lines.every((line) => line.length <= 10)).toBe(true);
  });

  test('garde les sauts de ligne de l’auteur, sans empiler les lignes vides', () => {
    expect(wrapText('bonjour\n\n\n\nà demain', 50, 'f', perChar(1))).toEqual(['bonjour', '', 'à demain']);
  });

  test('un mot plus large que la ligne (une URL) est coupé par graphème', () => {
    expect(wrapText('https://meeshy.me/abc', 8, 'f', perChar(1))).toEqual(['https://', 'meeshy.m', 'e/abc']);
  });

  test('les emoji composés ne sont jamais coupés en deux', () => {
    const lines = wrapText('🎉🎉🎉🎉', 2, 'f', perChar(1));
    expect(lines).toEqual(['🎉🎉', '🎉🎉']);
  });
});

describe('truncateLines — l’ellipse n’intervient qu’au plancher', () => {
  test('ne touche pas un texte qui tient', () => {
    expect(truncateLines(['a', 'b'], 3, 10, 'f', perChar(1))).toEqual(['a', 'b']);
  });

  test('garde n lignes et finit la dernière par une ellipse qui tient', () => {
    expect(truncateLines(['abcdef', 'ghijkl', 'mnop'], 2, 6, 'f', perChar(1))).toEqual(['abcdef', 'ghijk…']);
  });
});

describe('textDirection — le sens du premier caractère fort', () => {
  test('arabe ⇒ rtl, latin ⇒ ltr, emoji seuls ⇒ ltr', () => {
    expect(textDirection('مرحبا بك')).toBe('rtl');
    expect(textDirection('« Salut »')).toBe('ltr');
    expect(textDirection('🔥🔥')).toBe('ltr');
  });
});

describe('layoutMessageCard — citation réduite en haut, séparateur, réponse en bas', () => {
  test('l’ordre de lecture est celui du fil : citation, séparateur, réponse, pied', () => {
    const { ops } = layoutMessageCard(cardInput(), measure);
    const quote = opWithText(ops, 'On se retrouve où ce soir ?');
    const reply = opWithText(ops, 'Chez Lina, à 20 h !');
    const separator = ops.find((op) => op.kind === 'separator');
    const footer = opWithText(ops, 'Exporté par Jacques');
    expect(quote !== undefined && reply !== undefined && separator !== undefined && footer !== undefined).toBe(true);
    expect((quote?.y ?? 0) < (separator?.y ?? 0)).toBe(true);
    expect((separator?.y ?? 0) < (reply?.y ?? 0)).toBe(true);
    expect((reply?.y ?? 0) < (footer?.y ?? 0)).toBe(true);
  });

  test('la citation est RÉDUITE : sa police est plus petite que celle de la réponse', () => {
    const { ops } = layoutMessageCard(cardInput(), measure);
    const quote = opWithText(ops, 'On se retrouve où ce soir ?');
    const reply = opWithText(ops, 'Chez Lina, à 20 h !');
    expect(sizeOf(quote ?? ({} as CardTextOp)) < sizeOf(reply ?? ({} as CardTextOp))).toBe(true);
  });

  test('les deux auteurs sont nommés, la citation porte son filet', () => {
    const { ops } = layoutMessageCard(cardInput(), measure);
    expect(opWithText(ops, 'Awa') !== undefined).toBe(true);
    expect(opWithText(ops, 'Jacques') !== undefined).toBe(true);
    expect(ops.some((op) => op.kind === 'bar')).toBe(true);
  });

  test('un message isolé n’a ni filet ni séparateur', () => {
    const { ops } = layoutMessageCard(cardInput({ quoted: null }), measure);
    expect(ops.some((op) => op.kind === 'bar' || op.kind === 'separator')).toBe(false);
  });

  test('la marque Meeshy et l’exportateur signent la carte et son filigrane', () => {
    const layout = layoutMessageCard(cardInput({ exporter: 'Awa', footerLabel: 'Exported by Awa' }), measure);
    expect(opWithText(layout.ops, 'Meeshy') !== undefined).toBe(true);
    expect(opWithText(layout.ops, 'Exported by Awa') !== undefined).toBe(true);
    expect(layout.watermark).toBe('Meeshy · Awa');
  });

  test('un texte court tient dans un carré de 1080', () => {
    const layout = layoutMessageCard(cardInput(), measure);
    expect(layout.width).toBe(CARD_WIDTH);
    expect(layout.height).toBe(CARD_MIN_HEIGHT);
    expect(layout.truncated).toBe(false);
  });

  test('un texte moyen agrandit la carte sans la tronquer', () => {
    const reply = Array.from({ length: 60 }, (_, i) => `mot${i}`).join(' ');
    const layout = layoutMessageCard(cardInput({ reply: { author: 'Jacques', text: reply } }), measure);
    expect(layout.height > CARD_MIN_HEIGHT).toBe(true);
    expect(layout.height <= CARD_MAX_HEIGHT).toBe(true);
    expect(layout.truncated).toBe(false);
    const painted = texts(layout.ops).map((op) => op.text).join(' ');
    expect(painted.includes('mot59')).toBe(true);
  });

  test('un texte fleuve réduit ses polices, plafonne au format story et coupe d’une ellipse', () => {
    const reply = Array.from({ length: 1200 }, (_, i) => `mot${i}`).join(' ');
    const layout = layoutMessageCard(cardInput({ reply: { author: 'Jacques', text: reply } }), measure);
    expect(layout.height).toBe(CARD_MAX_HEIGHT);
    expect(layout.truncated).toBe(true);
    expect(texts(layout.ops).some((op) => op.text.endsWith('…'))).toBe(true);
    expect(texts(layout.ops).every((op) => op.y <= CARD_MAX_HEIGHT)).toBe(true);
  });

  test('aucune ligne ne déborde des marges, quel que soit le style', () => {
    const reply = 'Une réponse assez longue pour tenir sur plusieurs lignes, avec des mots ordinaires et un lien https://meeshy.me/une-adresse-tres-longue-sans-espace';
    for (const style of MESSAGE_CARD_STYLE_IDS) {
      const { ops } = layoutMessageCard(cardInput({ style, reply: { author: 'Jacques', text: reply } }), measure);
      for (const op of texts(ops).filter((candidate) => candidate.align === 'left')) {
        expect(op.x + measure(op.text, op.font) <= CARD_WIDTH).toBe(true);
      }
    }
  });

  test('une réponse en arabe s’aligne à droite et se peint de droite à gauche', () => {
    const { ops } = layoutMessageCard(cardInput({ reply: { author: 'ليلى', text: 'نلتقي الساعة الثامنة' } }), measure);
    const reply = opWithText(ops, 'نلتقي الساعة الثامنة');
    expect(reply?.direction).toBe('rtl');
    expect(reply?.align).toBe('right');
  });

  test('l’en-tête (titre de la conversation, date) ouvre la carte, avant la citation', () => {
    const { ops } = layoutMessageCard(cardInput({ title: 'Soirée de lancement', date: '28 septembre 2026' }), measure);
    const title = opWithText(ops, 'Soirée de lancement');
    const date = opWithText(ops, '28 septembre 2026');
    const quote = opWithText(ops, 'On se retrouve où ce soir ?');
    expect((title?.y ?? Infinity) < (date?.y ?? 0)).toBe(true);
    expect((date?.y ?? Infinity) < (quote?.y ?? 0)).toBe(true);
  });

  test('un titre trop long tient sur une ligne, coupé d’une ellipse', () => {
    const long = 'Une conversation au titre vraiment interminable '.repeat(4).trim();
    const { ops } = layoutMessageCard(cardInput({ title: long }), measure);
    const title = texts(ops).find((op) => op.text.startsWith('Une conversation'));
    expect(title?.text.endsWith('…')).toBe(true);
    expect((title?.x ?? 0) + measure(title?.text ?? '', title?.font ?? '') <= CARD_WIDTH).toBe(true);
  });

  test('sans les auteurs, aucun nom n’est peint', () => {
    const { ops } = layoutMessageCard(cardInput({ showAuthors: false }), measure);
    expect(opWithText(ops, 'Awa')).toBeUndefined();
    expect(opWithText(ops, 'Jacques')).toBeUndefined();
    expect(opWithText(ops, 'Chez Lina, à 20 h !') !== undefined).toBe(true);
  });
});
