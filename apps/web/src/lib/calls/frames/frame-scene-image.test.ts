import { describe, expect, test } from 'bun:test';

import { captureFrames } from './frame-catalogue';
import { expandMotif, styledFrame, stylesOf } from './frame-filter';
import { paintFrame, type FrameFace, type FramePaintable } from './frame-paint';
import { frameImages, nineSliceCuts, type FrameImageStore } from './frame-scene-image';
import { calls, recorder, written } from './frame-recorder.test-support';
import { FrameMotifSchema, type FrameMotif, type FrameStyle } from './frame-spec';
import type { FramePerson, FrameTexts } from './frame-text';

/**
 * **LES ILLUSTRATIONS D'UNE SCÈNE** (#12683) — une couche `image` au fond
 * couvre la toile sous les visages ; une couche `image` devant, découpée en
 * neuf morceaux, pose sa moulure entre la bordure et les textes, coins
 * intacts, bords étirés, centre transparent. Les images viennent d'un
 * magasin injecté ; une image absente ne peint rien, et le reste du cadre
 * se peint quand même. La DÉCLINAISON d'un motif (`styles`, #12685)
 * surcharge le cadre déplié clé par clé.
 */

const PORTRAIT = { width: 1080, height: 1920 } as const;
const people: readonly FramePerson[] = [
  { id: 'a', name: 'Awa', handle: 'awa', isSelf: true },
  { id: 'k', name: 'Karim', handle: 'karim', isSelf: false },
];
const TEXTS: FrameTexts = { groupName: null, isGroup: false, date: '24 oct. 2026', accent: null };
const face = (): FrameFace => ({ source: { face: true } as unknown as CanvasImageSource, size: { width: 1280, height: 720 } });

const BACK = { id: 'matiere', kind: 'image', depth: 'back', src: 'assets/call-frames/test_back.webp' } as const;
const FRONT = { id: 'moulure', kind: 'image', depth: 'front', src: 'assets/call-frames/test_front.webp', slice: 0.2 } as const;

const LOOK: FramePaintable = {
  layout: { arrangement: 'split', margin: 0.06, gap: 0.03, top: 0.16, bottom: 0.12 },
  slot: { shape: 'round', radius: 0.08, stroke: { color: '#FFFFFF', width: 0.006 }, tilt: 'none', tone: 'color' },
  background: { kind: 'solid', color: '#111827' },
  border: { kind: 'hairline', color: '#C9A45C', width: 0.004, inset: 0.02 },
  ornaments: [
    { kind: 'bokeh', color: '#FFFFFF', density: 'low', layer: 'back' },
    { kind: 'sparkles', color: '#FFFFFF', density: 'low', layer: 'front' },
  ],
  brand: { mark: 'wordmark', place: 'bottom', color: '#FFFFFF', size: 'm' },
  names: { show: 'name', style: 'caption', font: 'bubble', color: '#FFFFFF' },
  title: { source: 'names', font: 'elegant', color: '#FFFFFF', place: 'top', size: 'l' },
  scene: [BACK, FRONT],
};

type Picture = { readonly tag: string; readonly width: number; readonly height: number };
const picture = (tag: string, width: number, height: number): CanvasImageSource => ({ tag, width, height }) as unknown as CanvasImageSource;
const store = (entries: Record<string, CanvasImageSource>): FrameImageStore => frameImages(entries);

const paint = (frame: FramePaintable, images: FrameImageStore, size = PORTRAIT) => {
  const { log, context } = recorder();
  paintFrame(context, frame, people, [face(), face()], TEXTS, size, images);
  return log;
};

const tagOf = (args: readonly unknown[]): string => (args[0] as Picture).tag;

describe('la couche du fond', () => {
  test('se peint en couvrant la toile, après le fond et avant les visages', () => {
    const log = paint(LOOK, store({ [BACK.src]: picture('back', 720, 1280) }));
    const draws = calls(log, 'drawImage');
    const back = draws.find((args) => tagOf(args) === 'back');
    expect(back).toBeDefined();
    expect(back?.slice(5)).toEqual([0, 0, PORTRAIT.width, PORTRAIT.height]);
    expect(draws.indexOf(back ?? [])).toBe(0);
    const backAt = log.findIndex((entry) => entry.key === 'drawImage');
    const firstFill = log.findIndex((entry) => entry.key === 'fillRect');
    expect(firstFill).toBeLessThan(backAt);
  });

  test('couvre en rognant : une source plus large que la toile est recadrée au centre, jamais déformée', () => {
    const log = paint(LOOK, store({ [BACK.src]: picture('back', 1920, 1080) }));
    const back = calls(log, 'drawImage').find((args) => tagOf(args) === 'back') ?? [];
    const [, sx, sy, sw, sh] = back.map(Number);
    expect(sh).toBe(1080);
    expect(sw).toBeCloseTo(1080 * (1080 / 1920), 6);
    expect(sx).toBeCloseTo((1920 - (sw ?? 0)) / 2, 6);
    expect(sy).toBe(0);
  });

  test('son opacité est `amount`, 1 par défaut', () => {
    const faint = paint({ ...LOOK, scene: [{ ...BACK, amount: 0.55 }] }, store({ [BACK.src]: picture('back', 720, 1280) }));
    const at = faint.findIndex((entry) => entry.key === 'drawImage');
    const alphas = faint.slice(0, at).filter((entry) => entry.kind === 'set' && entry.key === 'globalAlpha').map((entry) => entry.value[0]);
    expect(alphas.at(-1)).toBe(0.55);
    const full = paint(LOOK, store({ [BACK.src]: picture('back', 720, 1280) }));
    const fullAt = full.findIndex((entry) => entry.key === 'drawImage');
    expect(full.slice(0, fullAt).some((entry) => entry.kind === 'set' && entry.key === 'globalAlpha' && entry.value[0] !== 1)).toBe(false);
  });
});

describe('la moulure du devant, en neuf morceaux', () => {
  test('les coins gardent `slice` du petit côté, source et destination ; les bords s’étirent ; le centre s’étire', () => {
    const cuts = nineSliceCuts({ width: 1080, height: 1920 }, { width: 540, height: 960 }, 0.2);
    expect(cuts).toHaveLength(9);
    const corner = cuts.find((cut) => cut.source.x === 0 && cut.source.y === 0);
    expect(corner?.source).toEqual({ x: 0, y: 0, width: 216, height: 216 });
    expect(corner?.target).toEqual({ x: 0, y: 0, width: 108, height: 108 });
    const topEdge = cuts.find((cut) => cut.source.x === 216 && cut.source.y === 0);
    expect(topEdge?.source).toEqual({ x: 216, y: 0, width: 1080 - 432, height: 216 });
    expect(topEdge?.target).toEqual({ x: 108, y: 0, width: 540 - 216, height: 108 });
    const centre = cuts.find((cut) => cut.source.x === 216 && cut.source.y === 216);
    expect(centre?.target).toEqual({ x: 108, y: 108, width: 540 - 216, height: 960 - 216 });
    const last = cuts.find((cut) => cut.target.x + cut.target.width === 540 && cut.target.y + cut.target.height === 960);
    expect(last?.source).toEqual({ x: 1080 - 216, y: 1920 - 216, width: 216, height: 216 });
  });

  test('sur une toile paysage, le petit côté est la hauteur', () => {
    const cuts = nineSliceCuts({ width: 1080, height: 1920 }, { width: 1920, height: 1080 }, 0.1);
    const corner = cuts.find((cut) => cut.source.x === 0 && cut.source.y === 0);
    expect(corner?.source.width).toBe(108);
    expect(corner?.target.width).toBe(108);
  });

  test('se peint après les traits de case et la bordure, avant les ornements du devant et les textes', () => {
    const log = paint(LOOK, store({ [FRONT.src]: picture('front', 1080, 1920) }));
    const draws = calls(log, 'drawImage').filter((args) => tagOf(args) === 'front');
    expect(draws).toHaveLength(9);
    const firstFront = log.findIndex((entry) => entry.key === 'drawImage' && tagOf(entry.value) === 'front');
    const lastStroke = log.map((entry, index) => (entry.key === 'stroke' ? index : -1)).filter((index) => index >= 0 && index < firstFront);
    const firstText = log.findIndex((entry) => entry.key === 'fillText');
    expect(lastStroke.length).toBeGreaterThan(0);
    expect(firstFront).toBeLessThan(firstText);
    const faceDraws = log.map((entry, index) => (entry.key === 'drawImage' && tagOf(entry.value) !== 'front' ? index : -1)).filter((index) => index >= 0);
    faceDraws.forEach((index) => expect(index).toBeLessThan(firstFront));
  });

  test('la moulure est lissée : aucun morceau ne laisse un jour d’un pixel', () => {
    const log = paint(LOOK, store({ [FRONT.src]: picture('front', 1080, 1920) }));
    const draws = calls(log, 'drawImage').filter((args) => tagOf(args) === 'front');
    const xs = draws.map((args) => Number(args[5]) + Number(args[7]));
    expect(Math.max(...xs)).toBe(PORTRAIT.width);
    expect(Math.min(...draws.map((args) => Number(args[5])))).toBe(0);
    expect(sets(log, 'imageSmoothingEnabled')).toContain(true);
  });
});

describe('le magasin d’images', () => {
  test('une image absente ne peint rien, et le reste du cadre se peint quand même', () => {
    const log = paint(LOOK, store({}));
    expect(calls(log, 'drawImage')).toHaveLength(2);
    expect(written(log)).toContain('meeshy');
  });

  test('sans magasin, la scène est muette', () => {
    const { log, context } = recorder();
    paintFrame(context, LOOK, people, [face(), face()], TEXTS, PORTRAIT);
    expect(calls(log, 'drawImage')).toHaveLength(2);
  });

  test('une source hors du pack n’est jamais cherchée', () => {
    const asked: string[] = [];
    const images: FrameImageStore = {
      get: (src) => {
        asked.push(src);
        return null;
      },
    };
    paint({ ...LOOK, scene: [BACK, { id: 'lumiere', kind: 'light', depth: 'front', color: '#FFFFFF' }] }, images);
    expect(asked).toEqual([BACK.src]);
  });
});

describe('les déclinaisons d’un motif', () => {
  const motif = (styles?: FrameMotif['styles']): FrameMotif =>
    FrameMotifSchema.parse({
      id: 'elegant.test',
      mood: 'elegant',
      name: 'Test',
      base: { ...LOOK, scene: undefined },
      variants: { duo: {}, groupe: { layout: { arrangement: 'grid', margin: 0.05, gap: 0.02, top: 0.1, bottom: 0.1 } } },
      ...(styles === undefined ? {} : { styles }),
    }) as FrameMotif;
  const RELIEF: FrameStyle = { id: 'relief', name: 'Relief', look: { scene: [BACK, FRONT], slot: { shape: 'rect', tilt: 'none', tone: 'warm' } } };

  test('le catalogue déplié ignore les déclinaisons : un cadre par tranche, sans scène', () => {
    const frames = expandMotif(motif([RELIEF]));
    expect(frames.map((frame) => frame.id)).toEqual(['elegant.test.duo', 'elegant.test.groupe']);
    expect(frames.every((frame) => frame.scene === undefined)).toBe(true);
  });

  test('une déclinaison surcharge le cadre de chaque tranche clé par clé, et signe son identifiant', () => {
    const [duo, groupe] = expandMotif(motif([RELIEF]));
    const styled = duo === undefined ? null : styledFrame(duo, RELIEF);
    expect(styled?.id).toBe('elegant.test.duo.relief');
    expect(styled?.scene).toEqual([BACK, FRONT]);
    expect(styled?.slot.tone).toBe('warm');
    expect(styled?.layout.arrangement).toBe('split');
    expect(styled?.border).toEqual(LOOK.border);
    expect(groupe === undefined ? null : styledFrame(groupe, RELIEF).layout.arrangement).toBe('grid');
  });

  test('les déclinaisons d’un cadre sont celles de son motif', () => {
    expect(stylesOf(motif([RELIEF])).map((style) => style.id)).toEqual(['relief']);
    expect(stylesOf(motif())).toEqual([]);
  });

  test('chaque cadre vedette du catalogue a sa déclinaison « relief », une matière au fond et une moulure devant, et elle se peint', () => {
    const relief = captureFrames().filter((frame) => stylesOf(frame).some((style) => style.id === 'relief'));
    expect(relief.length).toBeGreaterThanOrEqual(22 * 2);
    relief.forEach((frame) => {
      const style = stylesOf(frame).find((candidate) => candidate.id === 'relief');
      const styled = style === undefined ? null : styledFrame(frame, style);
      const scene = styled?.scene ?? [];
      const back = scene.find((layer) => layer.id === 'matiere');
      const front = scene.find((layer) => layer.id === 'moulure');
      expect(back?.src).toBe(`assets/call-frames/${frame.mood}_${frame.motif.split('.')[1]}_back.webp`);
      expect(front?.src).toBe(`assets/call-frames/${frame.mood}_${frame.motif.split('.')[1]}_front.webp`);
      expect(front?.slice ?? 0).toBeGreaterThan(0);
      if (frame.motif === 'signature.aurore') {
        expect(styled?.background.kind).toBe('accent');
        expect(back?.amount).toBe(0.55);
      }
      const { log, context } = recorder();
      if (styled !== null) paintFrame(context, styled, people, [face(), face()], TEXTS, PORTRAIT, store({ [back?.src ?? '']: picture('b', 720, 1280), [front?.src ?? '']: picture('f', 1080, 1920) }));
      expect(calls(log, 'drawImage').length).toBe(2 + 1 + 9);
    });
  });
});

const sets = (log: readonly { readonly kind: string; readonly key: string; readonly value: readonly unknown[] }[], key: string): readonly unknown[] =>
  log.filter((entry) => entry.kind === 'set' && entry.key === key).map((entry) => entry.value[0]);
