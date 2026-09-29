import { describe, expect, test } from 'bun:test';

import { layoutMessageCard, type MessageCardInput } from './message-card-layout';
import { loadCardFonts, paintMessageCard, strokeFloorAt } from './message-card-paint';
import { CARD_PALETTES, templateOf } from './message-card-templates';

type Painted = { readonly text: string; readonly font: string; readonly alpha: number };

/** Un contexte 2D qui ENREGISTRE ce qu'on lui peint — assez pour lire la carte, rien de plus. */
function recordingContext() {
  const painted: Painted[] = [];
  const calls: string[] = [];
  const drawn: number[][] = [];
  /** Chaque trait tiré : son épaisseur et son pointillé au moment du `stroke()`. */
  const strokes: { readonly lineWidth: number; readonly dash: readonly number[] }[] = [];
  let dash: readonly number[] = [];
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
    stroke() {
      strokes.push({ lineWidth: this.lineWidth, dash });
      calls.push('stroke');
    },
    fill: () => calls.push('fill'),
    setLineDash: (next: number[]) => {
      dash = next;
    },
    save() {
      calls.push('save');
    },
    restore() {
      this.globalAlpha = 1;
      calls.push('restore');
    },
    translate: () => {},
    rotate: (angle: number) => calls.push(`rotate:${angle}`),
    createLinearGradient: () => gradient as unknown as CanvasGradient,
    createRadialGradient: () => gradient as unknown as CanvasGradient,
    roundRect: () => calls.push('roundRect'),
    closePath: () => calls.push('closePath'),
    clip: () => calls.push('clip'),
    drawImage(...args: unknown[]) {
      drawn.push(args.slice(1).map(Number));
      calls.push('drawImage');
    },
  };
  return { ctx, painted, calls, drawn, strokes };
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

describe('la MINIATURE et l’IMAGE — un seul moteur (#8693)', () => {
  const THUMB_SCALE = 240 / 1080;

  test('le séparateur de la miniature est le MÊME trait que celui de l’image, relevé au pixel d’écran', () => {
    const full = recordingContext();
    const thumb = recordingContext();
    const layout = layoutOf();
    paintMessageCard(full.ctx, layout, templateOf(input.template));
    paintMessageCard(thumb.ctx, layout, templateOf(input.template), { strokeFloor: strokeFloorAt(THUMB_SCALE) });
    expect(thumb.calls.filter((call) => call === 'stroke').length).toBe(full.calls.filter((call) => call === 'stroke').length);
    const [line] = thumb.strokes;
    expect(line).toBeDefined();
    expect((line?.lineWidth ?? 0) * THUMB_SCALE).toBeGreaterThanOrEqual(1.5);
    const [fullLine] = full.strokes;
    expect(fullLine?.lineWidth).toBe(3);
    const ratio = (line?.lineWidth ?? 0) / (fullLine?.lineWidth ?? 1);
    expect(line?.dash).toEqual((fullLine?.dash ?? []).map((length) => length * ratio));
  });

  test('à pleine taille, aucun trait n’est épaissi', () => {
    expect(strokeFloorAt(1)).toBe(0);
    expect(strokeFloorAt(2)).toBe(0);
  });

  test('une image jointe est posée en « cover » dans son cadre, rognée à ses coins arrondis', () => {
    const { ctx, calls, drawn } = recordingContext();
    const layout = layoutOf({ quoted: null, media: [{ kind: 'image', width: 2000, height: 1000 }] });
    const frame = layout.ops.find((op) => op.kind === 'media');
    paintMessageCard(ctx, layout, templateOf(input.template), { sources: [{ width: 2000, height: 1000 } as unknown as CanvasImageSource] });
    expect(calls).toContain('clip');
    const [, , w = 0, h = 0] = drawn[0] ?? [];
    expect(frame?.kind).toBe('media');
    if (frame?.kind !== 'media') return;
    expect(h).toBeCloseTo(frame.height, 5);
    expect(w).toBeGreaterThanOrEqual(frame.width);
  });

  test('un média encore absent laisse un cadre neutre, jamais un trou', () => {
    const { ctx, calls } = recordingContext();
    paintMessageCard(ctx, layoutOf({ quoted: null, media: [{ kind: 'video', width: 16, height: 9 }] }), templateOf(input.template));
    expect(calls).not.toContain('drawImage');
    expect(calls).toContain('clip');
    expect(calls).toContain('closePath');
  });

  test('la rotation du message tourne le contenu, pas le fond', () => {
    const { ctx, calls } = recordingContext();
    paintMessageCard(ctx, layoutOf({ frame: { header: 'horizontal', authors: 'top', tilt: 'right' } }), templateOf(input.template));
    expect(calls.filter((call) => call.startsWith('rotate:')).map((call) => Number(call.slice(7)))).toContain(Math.PI / 60);
    expect(calls.indexOf('fillRect')).toBeLessThan(calls.findIndex((call) => call === `rotate:${Math.PI / 60}`));
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
