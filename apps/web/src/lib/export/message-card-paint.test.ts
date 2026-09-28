import { describe, expect, test } from 'bun:test';

import { layoutMessageCard, type MessageCardInput } from './message-card-layout';
import { loadCardFonts, paintMessageCard } from './message-card-paint';
import { MESSAGE_CARD_STYLES } from './message-card-styles';

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
  exporter: 'Jacques',
  footerLabel: 'Exporté par Jacques',
  style: 'editorial',
};

describe('paintMessageCard — ce que l’image porte réellement', () => {
  test('le filigrane « Meeshy · exportateur » est peint, discret, sous le texte', () => {
    const { ctx, painted } = recordingContext();
    const layout = layoutMessageCard(input, (text) => text.length * 18);
    paintMessageCard(ctx, layout, MESSAGE_CARD_STYLES.editorial);
    const watermark = painted.filter((entry) => entry.text === 'Meeshy · Jacques');
    expect(watermark.length > 10).toBe(true);
    expect(watermark.every((entry) => entry.alpha === MESSAGE_CARD_STYLES.editorial.watermarkAlpha)).toBe(true);
    const firstContent = painted.findIndex((entry) => entry.text === 'Chez Lina !');
    const lastWatermark = painted.map((entry) => entry.text).lastIndexOf('Meeshy · Jacques');
    expect(lastWatermark < firstContent).toBe(true);
  });

  test('la citation, la réponse et le pied sont peints dans la police du style', () => {
    const { ctx, painted } = recordingContext();
    paintMessageCard(ctx, layoutMessageCard(input, (text) => text.length * 18), MESSAGE_CARD_STYLES.editorial);
    const reply = painted.find((entry) => entry.text === 'Chez Lina !');
    expect(reply?.font.includes('"Prata"')).toBe(true);
    expect(painted.some((entry) => entry.text === 'On se retrouve où ?')).toBe(true);
    expect(painted.some((entry) => entry.text === 'Exporté par Jacques' && entry.alpha === 1)).toBe(true);
  });

  test('le séparateur dessine son cercle, la citation son filet', () => {
    const { ctx, calls } = recordingContext();
    paintMessageCard(ctx, layoutMessageCard(input, (text) => text.length * 18), MESSAGE_CARD_STYLES.editorial);
    expect(calls.includes('arc')).toBe(true);
    expect(calls.includes('roundRect')).toBe(true);
  });
});

describe('loadCardFonts — les polices sont ATTENDUES avant de peindre', () => {
  test('demande chaque police embarquée du style, jamais la pile native', async () => {
    const asked: string[] = [];
    await loadCardFonts(MESSAGE_CARD_STYLES.manuscrit, { load: async (font: string) => (asked.push(font), []) });
    expect(asked.some((font) => font.includes('"Caveat"'))).toBe(true);
    expect(asked.some((font) => font.includes('"Patrick Hand"'))).toBe(true);
  });

  test('une police qui ne charge pas n’empêche pas la carte (pile native)', async () => {
    await loadCardFonts(MESSAGE_CARD_STYLES.aurore, { load: async () => Promise.reject(new Error('offline')) });
    expect(true).toBe(true);
  });
});
