import { describe, expect, test } from 'bun:test';

import { layoutMessageCard, type MessageCardInput } from './message-card-layout';
import { loadCardFonts, paintMessageCard } from './message-card-paint';
import { CARD_PALETTES, templateOf } from './message-card-templates';

type Painted = { readonly text: string; readonly font: string; readonly alpha: number };

/** Un contexte 2D qui ENREGISTRE ce qu'on lui peint — assez pour lire la carte, rien de plus. */
function recordingContext() {
  const painted: Painted[] = [];
  const calls: string[] = [];
  const gradient = { addColorStop: () => {} };
  const ctx = {
    fillStyle: '' as string | CanvasGradient | CanvasPattern,
    strokeStyle: '' as string | CanvasGradient | CanvasPattern,
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    direction: 'ltr' as CanvasDirection,
    globalAlpha: 1,
    fillRect: () => calls.push('fillRect'),
    fillText(text: string) {
      painted.push({ text, font: this.font, alpha: this.globalAlpha });
    },
    measureText: (text: string) => ({ width: text.length * 18 }) as TextMetrics,
    beginPath: () => {},
    arc: () => calls.push('arc'),
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => calls.push('stroke'),
    fill: () => calls.push('fill'),
    setLineDash: () => {},
    save() {
      calls.push('save');
    },
    restore() {
      this.globalAlpha = 1;
      calls.push('restore');
    },
    translate: () => {},
    rotate: () => {},
    createLinearGradient: () => gradient as unknown as CanvasGradient,
    createRadialGradient: () => gradient as unknown as CanvasGradient,
    roundRect: () => calls.push('roundRect'),
  };
  return { ctx, painted, calls };
}

const input: MessageCardInput = {
  quoted: { author: 'Awa', text: 'On se retrouve où ?' },
  reply: { author: 'Jacques', text: 'Chez Lina !' },
  handle: 'jacques',
  template: 'editorial.didone.orbite',
};

const layoutOf = (overrides: Partial<MessageCardInput> = {}) => layoutMessageCard({ ...input, ...overrides }, (text) => text.length * 18);

describe('paintMessageCard — ce que l’image porte réellement', () => {
  test('le filigrane « Meeshy @pseudo » est peint, discret, sous le texte', () => {
    const { ctx, painted } = recordingContext();
    paintMessageCard(ctx, layoutOf(), templateOf(input.template));
    const watermark = painted.filter((entry) => entry.text === 'Meeshy @jacques');
    expect(watermark.length > 10).toBe(true);
    expect(watermark.every((entry) => entry.alpha === CARD_PALETTES.editorial.watermarkAlpha)).toBe(true);
    const firstContent = painted.findIndex((entry) => entry.text === 'Chez Lina !');
    const lastWatermark = painted.map((entry) => entry.text).lastIndexOf('Meeshy @jacques');
    expect(lastWatermark < firstContent).toBe(true);
  });

  test('le filigrane reste quand les deux auteurs sont anonymisés', () => {
    const { ctx, painted } = recordingContext();
    const anonymous = { quoted: { author: 'Anonyme', text: 'On se retrouve où ?' }, reply: { author: 'Anonyme', text: 'Chez Lina !' } };
    paintMessageCard(ctx, layoutOf(anonymous), templateOf(input.template));
    expect(painted.some((entry) => entry.text === 'Awa' || entry.text === 'Jacques')).toBe(false);
    expect(painted.filter((entry) => entry.text === 'Meeshy @jacques').length > 10).toBe(true);
  });

  test('la citation et la réponse sont peintes dans la typographie du template, sans aucun pied', () => {
    const { ctx, painted } = recordingContext();
    paintMessageCard(ctx, layoutOf(), templateOf(input.template));
    const reply = painted.find((entry) => entry.text === 'Chez Lina !');
    expect(reply?.font.includes('"Prata"')).toBe(true);
    expect(painted.some((entry) => entry.text === 'On se retrouve où ?')).toBe(true);
    expect(painted.filter((entry) => entry.alpha === 1).map((entry) => entry.text)).toEqual(['Awa', 'On se retrouve où ?', 'Jacques', 'Chez Lina !']);
  });

  test('l’orbite dessine son cercle, la citation son filet', () => {
    const { ctx, calls } = recordingContext();
    paintMessageCard(ctx, layoutOf(), templateOf(input.template));
    expect(calls.includes('arc')).toBe(true);
    expect(calls.includes('roundRect')).toBe(true);
  });

  test('un filet n’a pas de cercle ; les bulles sont des rectangles arrondis ; le fil finit sur un point', () => {
    const filet = recordingContext();
    paintMessageCard(filet.ctx, layoutOf({ template: 'editorial.didone.filet' }), templateOf('editorial.didone.filet'));
    expect(filet.calls.includes('arc')).toBe(false);
    expect(filet.calls.includes('stroke')).toBe(true);

    const bulles = recordingContext();
    paintMessageCard(bulles.ctx, layoutOf({ template: 'neige.systeme.bulles' }), templateOf('neige.systeme.bulles'));
    expect(bulles.calls.filter((call) => call === 'roundRect').length).toBe(2);

    const fil = recordingContext();
    paintMessageCard(fil.ctx, layoutOf({ template: 'manuscrit.plume.fil' }), templateOf('manuscrit.plume.fil'));
    expect(fil.calls.includes('arc')).toBe(true);
  });
});

describe('loadCardFonts — les polices sont ATTENDUES avant de peindre', () => {
  test('demande chaque police embarquée du template, jamais la pile native', async () => {
    const asked: string[] = [];
    await loadCardFonts(templateOf('manuscrit.plume.guillemets'), { load: async (font: string) => (asked.push(font), []) });
    expect(asked.some((font) => font.includes('"Caveat"'))).toBe(true);
    expect(asked.some((font) => font.includes('"Patrick Hand"'))).toBe(true);
    expect(asked.some((font) => font.includes('"Prata"'))).toBe(true);
    expect(asked.some((font) => !font.includes('"'))).toBe(false);
  });

  test('une police qui ne charge pas n’empêche pas la carte (pile native)', async () => {
    await loadCardFonts(templateOf('aurore.rond.orbite'), { load: async () => Promise.reject(new Error('offline')) });
    expect(true).toBe(true);
  });
});
