import { describe, expect, test } from 'bun:test';

import { CARD_ASPECT_SIZE, CARD_TILT_RADIANS, metaLine, sideHeaderOps } from './message-card-frame';
import { layoutMessageCard, type CardOp, type CardTextOp, type Measure, type MessageCardInput } from './message-card-layout';

const measure: Measure = (text, font) => {
  const size = Number(/(\d+)px/.exec(font)?.[1] ?? '10');
  return Array.from(text).length * size * 0.5;
};

const input = (overrides: Partial<MessageCardInput> = {}): MessageCardInput => ({
  quoted: { author: 'Awa', text: 'On se retrouve où ce soir ?', time: '19:02' },
  reply: { author: 'Jacques', text: 'Chez Lina, à 20 h !', time: '19:04' },
  handle: 'jacques',
  template: 'aurore.rond.orbite',
  ...overrides,
});

const texts = (ops: readonly CardOp[]): CardTextOp[] => ops.filter((op): op is CardTextOp => op.kind === 'text');

describe('le FORMAT de l’image', () => {
  test('un format fixe garde ses dimensions, quel que soit le texte', () => {
    for (const aspect of ['story', 'portrait', 'square', 'landscape'] as const) {
      const short = layoutMessageCard(input({ aspect }), measure);
      const long = layoutMessageCard(input({ aspect, reply: { author: 'J', text: 'mot '.repeat(400) } }), measure);
      expect({ width: short.width, height: short.height }).toEqual(CARD_ASPECT_SIZE[aspect]);
      expect({ width: long.width, height: long.height }).toEqual(CARD_ASPECT_SIZE[aspect]);
    }
  });

  test('le paysage élargit la colonne de texte : la même réponse y tient en moins de lignes', () => {
    const text = 'Une réponse assez longue pour occuper plusieurs lignes sur une carte carrée ordinaire.';
    const lines = (aspect: 'square' | 'landscape') => texts(layoutMessageCard(input({ aspect, quoted: null, reply: { author: 'J', text } }), measure).ops).length;
    expect(lines('landscape')).toBeLessThan(lines('square'));
  });

  test('un texte trop long pour un format fixe est réduit puis tronqué, jamais peint hors de la carte', () => {
    const layout = layoutMessageCard(input({ aspect: 'landscape', reply: { author: 'J', text: 'mot '.repeat(600) } }), measure);
    expect(layout.truncated).toBe(true);
    expect(texts(layout.ops).every((op) => op.y <= layout.height)).toBe(true);
  });
});

describe('l’onglet FRAME — les dispositions', () => {
  test('les heures des messages suivent le nom de leur auteur', () => {
    const layout = layoutMessageCard(input(), measure);
    const lines = texts(layout.ops).map((op) => op.text);
    expect(lines).toContain('Awa · 19:02');
    expect(lines).toContain('Jacques · 19:04');
  });

  test('les heures restent quand les noms sont masqués', () => {
    const lines = texts(layoutMessageCard(input({ showAuthors: false }), measure).ops).map((op) => op.text);
    expect(lines).toContain('19:04');
    expect(lines.some((line) => line.includes('Jacques'))).toBe(false);
  });

  test('les noms à la FIN du message : signés d’un tiret, sous la dernière ligne', () => {
    const layout = layoutMessageCard(input({ frame: { header: 'horizontal', authors: 'end', tilt: 'none' } }), measure);
    const ops = texts(layout.ops);
    const signature = ops.find((op) => op.text === '— Jacques · 19:04');
    const lastLine = ops.find((op) => op.text.startsWith('Chez Lina'));
    expect(signature).toBeDefined();
    expect((signature?.y ?? 0) > (lastLine?.y ?? Infinity)).toBe(true);
  });

  test('l’en-tête LETTRE À LETTRE : une lettre par ligne, dans la marge, sans pousser la réponse', () => {
    const flat = layoutMessageCard(input({ title: 'Lina', date: null }), measure);
    const side = layoutMessageCard(input({ title: 'Lina', date: null, frame: { header: 'letters', authors: 'top', tilt: 'none' } }), measure);
    const letters = texts(side.ops).filter((op) => ['L', 'i', 'n', 'a'].includes(op.text));
    expect(letters.map((op) => op.text)).toEqual(['L', 'i', 'n', 'a']);
    expect(new Set(letters.map((op) => op.x)).size).toBe(1);
    expect(letters.every((op, i) => i === 0 || op.y > (letters[i - 1]?.y ?? 0))).toBe(true);
    expect((letters[0]?.x ?? 999) < 96).toBe(true);
    const replyY = (layout: typeof flat) => texts(layout.ops).find((op) => op.text.startsWith('Chez Lina'))?.y ?? 0;
    expect(replyY(side)).toBeLessThan(replyY(flat));
    expect(side.regions.find((region) => region.part === 'header')).toBeDefined();
  });

  test('l’en-tête TOURNÉ vers le haut et vers le bas : un seul texte, couché dans les deux sens', () => {
    const up = texts(layoutMessageCard(input({ title: 'Lina', frame: { header: 'up', authors: 'top', tilt: 'none' } }), measure).ops).find((op) => op.text === 'Lina');
    const down = texts(layoutMessageCard(input({ title: 'Lina', frame: { header: 'down', authors: 'top', tilt: 'none' } }), measure).ops).find((op) => op.text === 'Lina');
    expect(up?.rotate).toBe(-Math.PI / 2);
    expect(down?.rotate).toBe(Math.PI / 2);
  });

  test('la ROTATION du message est une donnée du cadre, le fond reste droit', () => {
    expect(layoutMessageCard(input(), measure).tilt).toBe(0);
    expect(layoutMessageCard(input({ frame: { header: 'horizontal', authors: 'top', tilt: 'left' } }), measure).tilt).toBe(CARD_TILT_RADIANS.left);
    expect(CARD_TILT_RADIANS.right).toBeGreaterThan(0);
  });

  test('metaLine : rien quand il n’y a ni nom ni heure', () => {
    expect(metaLine(null, null, 'top')).toBeNull();
    expect(metaLine('  ', null, 'end')).toBeNull();
    expect(metaLine(null, '12:00', 'end')).toBe('12:00');
  });

  test('un en-tête vertical trop long pour la hauteur finit par une ellipse', () => {
    const { ops } = sideHeaderOps({ text: 'x'.repeat(200), orientation: 'letters', width: 1080, height: 1080, margin: 96, padY: 136, font: (s) => `${s}px f`, color: '#000', measure });
    expect(ops[ops.length - 1]?.text).toBe('…');
    expect(ops.every((op) => op.y <= 1080 - 136)).toBe(true);
  });

  test('en arabe, l’en-tête couché passe dans la marge de DROITE', () => {
    const { x } = sideHeaderOps({ text: 'مرحبا', orientation: 'up', width: 1080, height: 1080, margin: 96, padY: 136, font: (s) => `${s}px f`, color: '#000', measure });
    expect(x).toBeGreaterThan(1080 - 96);
  });
});
