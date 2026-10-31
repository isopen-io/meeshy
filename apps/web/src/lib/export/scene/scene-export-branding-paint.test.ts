import { describe, expect, test } from 'bun:test';

import type { BrandingIdentity } from './scene-export-branding-identity';
import { paintAuthorOutroCard, paintIntroCard, paintLogoCard, traceProgress, type BrandingCanvas } from './scene-export-branding-paint';
import type { ScenePaintable } from './scene-export-paint';

type Op = { readonly op: string; readonly text: string; readonly x: number; readonly y: number; readonly font: string; readonly style: string; readonly alpha: number };

function recordingCanvas(width = 720, height = 1280) {
  const ops: Op[] = [];
  let pending: { readonly x: number; readonly y: number; readonly radius: number } | null = null;
  const state = { alpha: 1 };
  const stack: number[] = [];
  const ctx = {
    fillStyle: '' as string | CanvasGradient | CanvasPattern,
    strokeStyle: '' as string | CanvasGradient | CanvasPattern,
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    font: '',
    filter: 'none',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    direction: 'ltr' as CanvasDirection,
    get globalAlpha() {
      return state.alpha;
    },
    set globalAlpha(value: number) {
      state.alpha = value;
    },
    globalCompositeOperation: 'source-over',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillRect: () => undefined,
    fillText(text: string, x: number, y: number) {
      ops.push({ op: 'fillText', text, x, y, font: this.font, style: String(this.fillStyle), alpha: state.alpha });
    },
    strokeText: () => undefined,
    measureText: (text: string) => ({ width: Array.from(text).length * 10 }) as TextMetrics,
    beginPath: () => {
      pending = null;
    },
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc(x: number, y: number, radius: number) {
      pending = { x, y, radius };
    },
    closePath: () => undefined,
    roundRect: () => undefined,
    rect: () => undefined,
    clip: () => undefined,
    fill() {
      if (pending !== null) ops.push({ op: 'disc', text: '', x: pending.x, y: pending.y, font: String(pending.radius), style: String(this.fillStyle), alpha: state.alpha });
    },
    stroke() {
      ops.push({ op: 'stroke', text: '', x: 0, y: 0, font: '', style: String(this.strokeStyle), alpha: state.alpha });
    },
    save() {
      stack.push(state.alpha);
    },
    restore() {
      state.alpha = stack.pop() ?? 1;
    },
    translate: () => undefined,
    rotate: () => undefined,
    scale: () => undefined,
    createLinearGradient: () => ({ addColorStop: () => undefined }) as unknown as CanvasGradient,
    drawImage: (_source: unknown, ...rest: number[]) => {
      ops.push({ op: 'drawImage', text: '', x: rest[0] ?? 0, y: rest[1] ?? 0, font: '', style: '', alpha: state.alpha });
    },
    createRadialGradient: () => ({ addColorStop: () => undefined }) as unknown as CanvasGradient,
    createPattern: () => null,
  } as unknown as ScenePaintable;
  const canvas: BrandingCanvas = { ctx, width, height, fontFamily: 'Inter' };
  return { canvas, ops };
}

const identityWith = (overrides: Partial<BrandingIdentity> = {}): BrandingIdentity => ({
  displayName: 'Windie Nh',
  username: 'windie',
  avatarSrc: null,
  bannerSrc: null,
  accentHex: '6366F1',
  moodEmoji: null,
  moodMessage: null,
  presenceDotHex: null,
  circleBadge: null,
  ...overrides,
});

const NO_IMAGES = { avatar: null, banner: null };
const texts = (ops: readonly Op[]) => ops.filter((op) => op.op === 'fillText');

describe("l'intro d'identité d'une story exportée", () => {
  test('le nom et le @username sont peints, centrés sous l\'avatar', () => {
    const { canvas, ops } = recordingCanvas();
    paintIntroCard(canvas, identityWith(), NO_IMAGES);
    const painted = texts(ops).map((op) => op.text);
    expect(painted).toContain('Windie Nh');
    expect(painted).toContain('@windie');
    const name = texts(ops).find((op) => op.text === 'Windie Nh');
    const handle = texts(ops).find((op) => op.text === '@windie');
    expect((handle?.y ?? 0)).toBeGreaterThan(name?.y ?? 0);
  });

  test('sans photo, l\'avatar porte les initiales sur la teinte d\'accent', () => {
    const { canvas, ops } = recordingCanvas();
    paintIntroCard(canvas, identityWith(), NO_IMAGES);
    expect(texts(ops).map((op) => op.text)).toContain('WN');
  });

  test('la photo est peinte quand elle est là, sans initiales', () => {
    const { canvas, ops } = recordingCanvas();
    paintIntroCard(canvas, identityWith(), { avatar: { width: 100, height: 100 } as unknown as CanvasImageSource, banner: null });
    expect(ops.some((op) => op.op === 'drawImage')).toBe(true);
    expect(texts(ops).map((op) => op.text)).not.toContain('WN');
  });

  test('le logo de cercle est peint à droite du nom, sur la même ligne et au même corps de police', () => {
    const { canvas, ops } = recordingCanvas();
    paintIntroCard(canvas, identityWith({ circleBadge: '🔥' }), NO_IMAGES);
    const name = texts(ops).find((op) => op.text === 'Windie Nh');
    const badge = texts(ops).find((op) => op.text === '🔥');
    expect(badge).toBeDefined();
    expect(badge?.y).toBe(name?.y);
    expect(badge?.font).toBe(name?.font);
    expect(badge?.x ?? 0).toBeGreaterThan((name?.x ?? 0) + 90);
  });

  test('sans logo, rien n\'est peint à droite du nom', () => {
    const { canvas, ops } = recordingCanvas();
    paintIntroCard(canvas, identityWith({ circleBadge: null }), NO_IMAGES);
    expect(texts(ops).map((op) => op.text)).toEqual(['WN', 'Windie Nh', '@windie']);
  });

  test("le point de présence est posé sur le bord bas-droit de l'avatar, à 22 % de son diamètre, cerclé d'un liseré sombre", () => {
    const { canvas, ops } = recordingCanvas(720, 1280);
    paintIntroCard(canvas, identityWith({ presenceDotHex: '#34D399' }), NO_IMAGES);
    const side = 720 * 0.28;
    const discs = ops.filter((op) => op.op === 'disc');
    const dot = discs.find((op) => op.style === '#34D399');
    const rim = discs.find((op) => op.style.startsWith('rgba(0, 0, 0'));
    expect(dot).toBeDefined();
    expect(Number(dot?.font) * 2).toBeCloseTo(side * 0.22, 5);
    expect(Number(rim?.font)).toBeGreaterThan(Number(dot?.font));
    const centre = { x: 360, y: 640 - side * 0.9 + side / 2 };
    expect(dot?.x).toBeGreaterThan(centre.x);
    expect(dot?.y).toBeGreaterThan(centre.y);
    expect(Math.hypot((dot?.x ?? 0) - centre.x, (dot?.y ?? 0) - centre.y)).toBeCloseTo(side / 2, 5);
  });

  test('sans présence servie, aucun point n\'est peint', () => {
    const { canvas, ops } = recordingCanvas();
    paintIntroCard(canvas, identityWith({ presenceDotHex: null }), NO_IMAGES);
    expect(ops.filter((op) => op.op === 'disc')).toEqual([]);
  });

  test("la capsule d'humeur porte l'emoji et son mot sous le @username ; sans humeur elle est absente", () => {
    const withMood = recordingCanvas();
    paintIntroCard(withMood.canvas, identityWith({ moodEmoji: '🎉', moodMessage: 'Fête ce soir' }), NO_IMAGES);
    const painted = texts(withMood.ops).map((op) => op.text);
    expect(painted).toContain('🎉');
    expect(painted).toContain('Fête ce soir');
    const handle = texts(withMood.ops).find((op) => op.text === '@windie');
    expect(texts(withMood.ops).find((op) => op.text === '🎉')?.y ?? 0).toBeGreaterThan(handle?.y ?? 0);
    const without = recordingCanvas();
    paintIntroCard(without.canvas, identityWith(), NO_IMAGES);
    expect(texts(without.ops).map((op) => op.text)).not.toContain('🎉');
  });
});

describe('la carte de fin', () => {
  test('sans auteur : le logo se trace et le mot « meeshy » est écrit, aucune identité', () => {
    const { canvas, ops } = recordingCanvas();
    paintLogoCard(canvas, 1.2);
    expect(texts(ops).map((op) => op.text)).toEqual(['meeshy']);
    expect(ops.filter((op) => op.op === 'stroke').length).toBe(3);
  });

  test('le tracé du logo commence vide et finit plein', () => {
    expect(traceProgress(0, 0)).toBe(0);
    expect(traceProgress(1.1, 2)).toBeCloseTo(1, 3);
  });

  test("avec auteur, la première phase (1,5 s) ne montre que le logo : l'identité est muette", () => {
    const { canvas, ops } = recordingCanvas();
    paintAuthorOutroCard(canvas, { tMs: 1_000, identity: identityWith({ circleBadge: '🔥' }), images: NO_IMAGES });
    expect(texts(ops).map((op) => op.text)).toEqual(['meeshy']);
  });

  test("avec auteur, la 2e phase peint l'identité en fondu sur 0,4 s : à mi-fondu l'alpha est 0,5, ensuite 1", () => {
    const early = recordingCanvas();
    paintAuthorOutroCard(early.canvas, { tMs: 1_700, identity: identityWith({ circleBadge: '🔥', presenceDotHex: '#FBBF24' }), images: NO_IMAGES });
    const name = texts(early.ops).find((op) => op.text === 'Windie Nh');
    expect(name?.alpha).toBeCloseTo(0.5, 5);
    expect(texts(early.ops).map((op) => op.text)).toContain('🔥');
    expect(early.ops.some((op) => op.op === 'disc' && op.style === '#FBBF24')).toBe(true);
    const late = recordingCanvas();
    paintAuthorOutroCard(late.canvas, { tMs: 2_500, identity: identityWith(), images: NO_IMAGES });
    expect(texts(late.ops).find((op) => op.text === 'Windie Nh')?.alpha).toBe(1);
  });

  test('en 2e phase le logo passe en filigrane à 22 %', () => {
    const { canvas, ops } = recordingCanvas();
    paintAuthorOutroCard(canvas, { tMs: 2_500, identity: identityWith(), images: NO_IMAGES });
    const strokes = ops.filter((op) => op.op === 'stroke');
    expect(strokes.length).toBe(3);
    expect(strokes.every((op) => Number(op.style.match(/, ([0-9.]+)\)$/)?.[1]) <= 0.22 + 1e-9)).toBe(true);
  });
});
