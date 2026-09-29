import { describe, expect, test } from 'bun:test';

import {
  CARD_MAX_HEIGHT,
  CARD_MIN_HEIGHT,
  CARD_WIDTH,
  cardPartAt,
  layoutMessageCard,
  textDirection,
  truncateLines,
  wrapText,
  type CardOp,
  type CardTextOp,
  type Measure,
  type MessageCardInput,
} from './message-card-layout';
import { CARD_LINKS, CARD_TYPEFACE_IDS, templateIdOf } from './message-card-templates';

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
  handle: 'jacques',
  template: 'aurore.rond.orbite',
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
  test('l’ordre de lecture est celui du fil : citation, liaison, réponse', () => {
    const { ops } = layoutMessageCard(cardInput(), measure);
    const quote = opWithText(ops, 'On se retrouve où ce soir ?');
    const reply = opWithText(ops, 'Chez Lina, à 20 h !');
    const separator = ops.find((op) => op.kind === 'separator');
    expect(quote !== undefined && reply !== undefined && separator !== undefined).toBe(true);
    expect((quote?.y ?? 0) < (separator?.y ?? 0)).toBe(true);
    expect((separator?.y ?? 0) < (reply?.y ?? 0)).toBe(true);
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

  test('un message isolé n’a aucune liaison, quelle qu’elle soit', () => {
    for (const link of CARD_LINKS) {
      const { ops } = layoutMessageCard(cardInput({ quoted: null, template: templateIdOf({ palette: 'aurore', typeface: 'rond', link }) }), measure);
      expect(ops.filter((op) => op.kind !== 'text' && op.kind !== 'panel')).toEqual([]);
      expect(texts(ops).map((op) => op.text)).toEqual(['Jacques', 'Chez Lina, à 20 h !']);
    }
  });

  test('le filigrane dit seulement « Meeshy @username » — aucun « Exporté par », aucun pied', () => {
    const layout = layoutMessageCard(cardInput({ handle: 'awa' }), measure);
    expect(layout.watermark).toBe('Meeshy @awa');
    expect(texts(layout.ops).map((op) => op.text)).toEqual(['Awa', 'On se retrouve où ce soir ?', 'Jacques', 'Chez Lina, à 20 h !']);
  });

  test('un pseudo déjà préfixé n’est pas doublé, et sans pseudo la marque reste seule', () => {
    expect(layoutMessageCard(cardInput({ handle: '@awa' }), measure).watermark).toBe('Meeshy @awa');
    expect(layoutMessageCard(cardInput({ handle: null }), measure).watermark).toBe('Meeshy');
    expect(layoutMessageCard(cardInput({ handle: '  ' }), measure).watermark).toBe('Meeshy');
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

  test('aucune ligne ne déborde des marges, quels que soient la typographie et la liaison', () => {
    const reply = 'Une réponse assez longue pour tenir sur plusieurs lignes, avec des mots ordinaires et un lien https://meeshy.me/une-adresse-tres-longue-sans-espace';
    for (const typeface of CARD_TYPEFACE_IDS) {
      for (const link of CARD_LINKS) {
        const template = templateIdOf({ palette: 'neige', typeface, link });
        const { ops } = layoutMessageCard(cardInput({ template, reply: { author: 'Jacques', text: reply } }), measure);
        for (const op of texts(ops).filter((candidate) => candidate.align === 'left')) {
          expect(op.x + measure(op.text, op.font) <= CARD_WIDTH).toBe(true);
        }
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

describe('les liaisons — des façons variées de mener la question à la réponse', () => {
  const layoutWith = (link: (typeof CARD_LINKS)[number]) =>
    layoutMessageCard(cardInput({ template: templateIdOf({ palette: 'aurore', typeface: 'rond', link }) }), measure);
  const between = (ops: readonly CardOp[], y: number): boolean =>
    (opWithText(ops, 'On se retrouve où ce soir ?')?.y ?? Infinity) < y && y < (opWithText(ops, 'Chez Lina, à 20 h !')?.y ?? 0);

  test('orbite : un trait pointillé autour d’un cercle', () => {
    const separator = layoutWith('orbite').ops.find((op) => op.kind === 'separator');
    expect(separator?.kind === 'separator' && separator.radius > 0 && separator.dash.length > 0).toBe(true);
  });

  test('filet : un trait plein, court, sans cercle', () => {
    const separator = layoutWith('filet').ops.find((op) => op.kind === 'separator');
    expect(separator?.kind === 'separator' && separator.radius === 0 && separator.dash.length === 0).toBe(true);
    expect(separator?.kind === 'separator' && separator.x2 - separator.x1 < CARD_WIDTH / 2).toBe(true);
  });

  test('guillemets : un grand guillemet ouvre la réponse, sans filet de citation', () => {
    const { ops } = layoutWith('guillemets');
    const mark = opWithText(ops, '“');
    expect(mark !== undefined && between(ops, mark.y)).toBe(true);
    expect(sizeOf(mark ?? ({} as CardTextOp)) > 100).toBe(true);
    expect(ops.some((op) => op.kind === 'bar')).toBe(false);
  });

  test('flèche : la flèche de réponse descend de la citation', () => {
    const { ops } = layoutWith('fleche');
    const arrow = opWithText(ops, '↳');
    expect(arrow !== undefined && between(ops, arrow.y)).toBe(true);
  });

  test('bulles : la citation et la réponse dans deux bulles décalées, chaque texte dans la sienne', () => {
    const { ops } = layoutWith('bulles');
    const panels = ops.filter((op) => op.kind === 'panel');
    expect(panels.length).toBe(2);
    const [quotePanel, replyPanel] = panels;
    const quote = opWithText(ops, 'On se retrouve où ce soir ?');
    const reply = opWithText(ops, 'Chez Lina, à 20 h !');
    const inside = (op: CardTextOp | undefined, panel: CardOp | undefined) =>
      op !== undefined && panel?.kind === 'panel' && op.y > panel.y && op.y < panel.y + panel.height && op.x > panel.x && op.x < panel.x + panel.width;
    expect(inside(quote, quotePanel) && inside(reply, replyPanel)).toBe(true);
    expect(quotePanel?.kind === 'panel' && replyPanel?.kind === 'panel' && quotePanel.x < replyPanel.x).toBe(true);
  });

  test('fil : un fil descend de la citation et finit sur un point', () => {
    const { ops } = layoutWith('fil');
    const dot = ops.find((op) => op.kind === 'dot');
    expect(dot !== undefined && between(ops, dot.y)).toBe(true);
    expect(ops.filter((op) => op.kind === 'bar').length).toBe(2);
  });

  test('silence : le seul espace sépare la question de la réponse', () => {
    const { ops } = layoutWith('silence');
    expect(ops.some((op) => op.kind === 'separator' || op.kind === 'panel' || op.kind === 'dot')).toBe(false);
    expect(texts(ops).length).toBe(4);
  });

  test('chaque liaison garde la carte dans un carré pour un échange court', () => {
    for (const link of CARD_LINKS) expect(layoutWith(link).height).toBe(CARD_MIN_HEIGHT);
  });
});

describe('les zones touchables d’une carte', () => {
  const center = (layout: ReturnType<typeof layoutMessageCard>, part: string) => {
    const zone = layout.regions.find((r) => r.part === part);
    if (zone === undefined) throw new Error(`zone ${part} absente`);
    return { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
  };

  test('une réponse citée se lit de haut en bas : citation, liaison, réponse — sans en-tête non demandé', () => {
    const layout = layoutMessageCard(cardInput(), measure);
    expect(layout.regions.map((r) => r.part)).toEqual(['quote', 'link', 'reply']);
    const [quote, link, reply] = layout.regions;
    expect(quote!.y + quote!.height).toBeLessThanOrEqual(link!.y);
    expect(link!.y + link!.height).toBeLessThanOrEqual(reply!.y);
  });

  test('le titre ou la date ouvrent une zone d’en-tête ; un message isolé n’a ni citation ni liaison', () => {
    const layout = layoutMessageCard(cardInput({ quoted: null, title: 'Soirée', date: '28 septembre 2026' }), measure);
    expect(layout.regions.map((r) => r.part)).toEqual(['header', 'reply']);
  });

  test('chaque zone contient le texte qu’elle nomme', () => {
    const layout = layoutMessageCard(cardInput({ template: templateIdOf({ palette: 'neige', typeface: 'systeme', link: 'bulles' }) }), measure);
    const reply = layout.regions.find((r) => r.part === 'reply')!;
    const line = opWithText(layout.ops, 'Chez Lina, à 20 h !')!;
    expect(line.y).toBeGreaterThan(reply.y);
    expect(line.y).toBeLessThanOrEqual(reply.y + reply.height);
  });

  test('toucher une partie la désigne, toucher la marge désigne le fond', () => {
    const layout = layoutMessageCard(cardInput({ title: 'Soirée' }), measure);
    for (const part of ['header', 'quote', 'link', 'reply'] as const) expect(cardPartAt(layout, center(layout, part))).toBe(part);
    expect(cardPartAt(layout, { x: 8, y: 8 })).toBe('background');
    expect(cardPartAt(layout, { x: CARD_WIDTH - 4, y: layout.height - 4 })).toBe('background');
  });

  test('un doigt posé juste à côté d’une zone la désigne encore', () => {
    const layout = layoutMessageCard(cardInput(), measure);
    const reply = layout.regions.find((r) => r.part === 'reply')!;
    expect(cardPartAt(layout, { x: reply.x - 10, y: reply.y + 4 })).toBe('reply');
  });
});
