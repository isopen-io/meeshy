import { describe, expect, test } from 'bun:test';

import type { GloryFrameFormat, GloryFrameTextSlot } from '@meeshy/shared/types/glory-frame-format';

import type { PaintContext, PhotoArt, PhotoBanner, PhotoPalette } from '../compose';
import { DEFAULT_RECIPE, type GloryTexts } from './frame-spec';
import { paintGloryFrame, type GloryLayerImages, type GloryPaintInput, type PaintSurface } from './paint-glory-frame';

/**
 * LE PEINTRE D'UN CADRE DE GLOIRE (#10159, L7, § 5.5) — un faux contexte
 * enregistre les appels : l'ordre est celui de `stack`, la photo est découpée
 * par la fenêtre entre `save` et `restore`, `screen` reste borné à sa passe, le
 * texte vivant rétrécit puis s'ellipse, l'arabe s'écrit de droite à gauche, la
 * carte seule peint `windowFill`, la Flamme et le bandeau retirés sont absents.
 */

type Call = { readonly op: string; readonly args: readonly unknown[] };

const image = (id: string, width = 100, height = 100): CanvasImageSource => ({ id, width, height }) as unknown as CanvasImageSource;
const idOf = (source: unknown): string => (source as { id: string }).id;
/** Les arguments numériques d’un appel, pour les lire sans « possibly undefined » : un appel absent rend des NaN, qui font tomber l’assertion. */
const nums = (call: Call | undefined): number[] => (call?.args ?? []).map((value) => (typeof value === 'number' ? value : Number.NaN));
const at = (list: number[], index: number): number => list[index] ?? Number.NaN;

/** Une mesure à chasse fixe : 0,5 em par caractère — le témoin n'a pas de polices. */
const MEASURE_ADVANCE = 0.5;
const pxOf = (font: unknown): number => Number(/(\d+(?:\.\d+)?)px/.exec(String(font))?.[1] ?? 0);

function fakeContext(options: { readonly measure?: boolean; readonly clip?: boolean } = {}) {
  const calls: Call[] = [];
  const props: Record<string, unknown> = { globalCompositeOperation: 'source-over', globalAlpha: 1, direction: 'ltr', letterSpacing: '0px' };
  const record = (op: string) => (...args: unknown[]) => void calls.push({ op, args });
  const setter = (name: string) => (value: unknown) => {
    props[name] = value;
    calls.push({ op: name, args: [value] });
  };
  const ctx: Record<string, unknown> = {
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    scale: record('scale'),
    rotate: record('rotate'),
    transform: record('transform'),
    drawImage: record('drawImage'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    setLineDash: record('setLineDash'),
    beginPath: record('beginPath'),
    roundRect: record('roundRect'),
    fill: record('fill'),
    strokeText: record('strokeText'),
    fillText: (...args: unknown[]) => void calls.push({ op: 'fillText', args: [...args, props.font, props.fillStyle, props.textAlign, props.direction, props.globalAlpha] }),
    createLinearGradient: (...args: unknown[]) => {
      calls.push({ op: 'createLinearGradient', args });
      return { stops: [] as [number, string][], addColorStop(offset: number, color: string) { this.stops.push([offset, color]); } };
    },
  };
  if (options.clip !== false) {
    ctx.rect = record('rect');
    ctx.clip = record('clip');
  }
  if (options.measure !== false) ctx.measureText = (text: string) => ({ width: Array.from(text).length * pxOf(props.font) * MEASURE_ADVANCE });
  for (const name of ['fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign', 'textBaseline', 'shadowColor', 'shadowBlur', 'globalAlpha', 'globalCompositeOperation', 'direction', 'letterSpacing']) {
    Object.defineProperty(ctx, name, { get: () => props[name], set: setter(name), enumerable: true });
  }
  return { ctx: ctx as unknown as PaintContext, calls, props };
}

const ref = (src: string, box: readonly [number, number, number, number]) => ({ src, bytes: 1, sha256: src.padEnd(64, '0'), box: [...box] as [number, number, number, number] });

const slot = (over: Partial<GloryFrameTextSlot> & { readonly x: number; readonly baseline: number; readonly sample: string }): GloryFrameTextSlot => ({
  anchor: 'middle',
  font: { family: 'Manrope', weight: 800, style: 'normal', size: 40, tracking: 0 },
  fill: { solid: '#FFFFFFFF' },
  stroke: null,
  opacity: 1,
  effects: [],
  filter: null,
  path: null,
  bbox: [over.x - 200, over.baseline - 40, 400, 48],
  contrast: 7,
  ...over,
});

const WINDOW: [number, number, number, number] = [128, 528, 824, 948];

function formatOf(over: Partial<GloryFrameFormat> = {}): GloryFrameFormat {
  return {
    size: [1080, 1920],
    window: { box: WINDOW, mask: ref('mask', WINDOW), veilMaxAlpha: 0 },
    stack: ['photo', 'grade:0', 'grade:1', 'decor', 'crest', 'birds', 'plate', 'text', 'banner'],
    layers: {
      decor: ref('decor', [0, 0, 1080, 1920]),
      windowFill: ref('fill', WINDOW),
      grade: [
        { ...ref('grade0', WINDOW), blend: 'screen' },
        { ...ref('grade1', WINDOW), blend: 'normal' },
      ],
      front: {},
      plate: { plain: ref('plate-plain', [66, 1500, 948, 300]), message: ref('plate-message', [66, 1470, 948, 368]) },
    },
    crest: { box: [448, 114, 184, 290] },
    text: {
      kicker: slot({ x: 540, baseline: 1626, sample: 'NOUVEAU RANG · AFRIQUE ÉTERNELLE', font: { family: 'Manrope', weight: 800, style: 'normal', size: 24, tracking: 6 } }),
      title: slot({ x: 540, baseline: 1718, sample: 'Ambassadeur IV', font: { family: 'Cinzel', weight: 700, style: 'normal', size: 80, tracking: 0 } }),
      message: slot({ x: 540, baseline: 1784, sample: 'Ubuntu, toujours', font: { family: 'Caveat', weight: 700, style: 'normal', size: 56, tracking: 0 } }),
      date: slot({ x: 540, baseline: 1822, sample: '10 octobre 2026', font: { family: 'Manrope', weight: 500, style: 'normal', size: 23, tracking: 0 } }),
    },
    birds: {
      default: 'perches',
      layouts: {
        perches: {
          mee: { sticker: 'mee-coucou', box: [6, 202, 180, 180], rotate: -6, flip: false, opacity: 1 },
          meo: { sticker: 'meo-salut', box: [894, 202, 180, 180], rotate: 6, flip: true, opacity: 1 },
        },
      },
    },
    banner: { box: [0, 1720, 1080, 200] },
    ...over,
  };
}

const layers: GloryLayerImages = {
  mask: image('mask'),
  decor: image('decor'),
  windowFill: image('fill'),
  grade: [image('grade0'), image('grade1')],
  front: {},
  plate: { plain: image('plate-plain'), message: image('plate-message') },
};
const art: PhotoArt = { emblem: image('emblem', 200, 184), mee: image('art-mee'), meo: image('art-meo'), signature: image('signature'), flame: image('flame') };
const palette: PhotoPalette = { top: '#0b1020', bottom: '#1e1b4b', ink: '#ffffff', inkSoft: '#c7d2fe', scrim: '#000000' };
const texts: GloryTexts = { kicker: 'Nouveau rang', title: 'Ambassadeur IV', date: '10 octobre 2026', message: null, 'plate.1': null };
const banner: PhotoBanner = { headline: 'Rejoins-moi sur Meeshy', qr: null, flameLabel: '23 j' };
const selfie = { image: image('photo', 1600, 900), width: 1600, height: 900, mirror: true };

function paint(over: Partial<GloryPaintInput> = {}, options: { readonly measure?: boolean; readonly clip?: boolean; readonly scratch?: boolean } = {}) {
  const fake = fakeContext(options);
  const surfaces: ReturnType<typeof fakeContext>[] = [];
  const scratch = (width: number, height: number): PaintSurface | null => {
    if (options.scratch === false) return null;
    const surface = fakeContext();
    surfaces.push(surface);
    return { ctx: surface.ctx, image: image(`surface:${width}x${height}`, width, height) };
  };
  const input: GloryPaintInput = {
    format: formatOf(),
    layers,
    birds: { 'mee-coucou': image('sticker-mee'), 'meo-salut': image('sticker-meo') },
    recipe: DEFAULT_RECIPE,
    texts,
    photo: selfie,
    art,
    palette,
    fontFamily: 'system-ui',
    banner,
    rtl: false,
    language: 'fr',
    scratch,
    ...over,
  };
  paintGloryFrame(fake.ctx, input);
  return { ...fake, surfaces, input };
}

const drawn = (calls: readonly Call[]): string[] => calls.filter((c) => c.op === 'drawImage').map((c) => idOf(c.args[0]));
const written = (calls: readonly Call[]) => calls.filter((c) => c.op === 'fillText').map((c) => ({ text: String(c.args[0]), x: c.args[1], y: c.args[2], font: String(c.args[3]), align: c.args[5], direction: c.args[6] }));

describe('l’ordre est celui de la pile du contrat', () => {
  test('photo (par la surface de travail), passes de grade, décor, blason, oiseaux, plaque — puis le texte et le bandeau', () => {
    const { calls } = paint();
    expect(drawn(calls)).toEqual(['surface:824x948', 'grade0', 'grade1', 'decor', 'emblem', 'sticker-mee', 'sticker-meo', 'plate-plain', 'signature', 'flame']);
    const ops = calls.map((c) => c.op);
    expect(ops.lastIndexOf('drawImage')).toBeGreaterThan(ops.indexOf('fillText'));
  });

  test('une autre pile, un autre ordre : la plaque avant les oiseaux, le décor sous la photo', () => {
    const { calls } = paint({ format: formatOf({ stack: ['decor', 'photo', 'grade:0', 'grade:1', 'crest', 'plate', 'birds', 'text', 'banner'] }) });
    expect(drawn(calls).slice(0, 7)).toEqual(['decor', 'surface:824x948', 'grade0', 'grade1', 'emblem', 'plate-plain', 'sticker-mee']);
  });

  test('le blason du moment se pose à l’ancre crest, à sa proportion, centré', () => {
    const { calls } = paint();
    const crest = nums(calls.find((c) => c.op === 'drawImage' && idOf(c.args[0]) === 'emblem'));
    const [x, y, w, h] = [at(crest, 1), at(crest, 2), at(crest, 3), at(crest, 4)];
    expect(w / h).toBeCloseTo(200 / 184, 5);
    expect(x + w / 2).toBeCloseTo(448 + 92, 5);
    expect(y + h / 2).toBeCloseTo(114 + 145, 5);
  });
});

describe('la photo dans sa fenêtre', () => {
  test('couvre la BOÎTE de la fenêtre sur la surface de travail, masquée en destination-in, posée sous un clip entre save et restore', () => {
    const { calls, surfaces } = paint();
    const surface = surfaces[0];
    if (surface === undefined) throw new Error('surface attendue');
    const photo = nums(surface.calls.find((c) => c.op === 'drawImage' && idOf(c.args[0]) === 'photo'));
    expect(photo.slice(5)).toEqual([0, 0, 824, 948]);
    expect(at(photo, 3) / at(photo, 4)).toBeCloseTo(824 / 948, 5);
    expect(at(photo, 2)).toBe(0);
    expect(at(photo, 1)).toBeGreaterThan(0);
    const ops = surface.calls.map((c) => c.op === 'globalCompositeOperation' ? `gco:${String(c.args[0])}` : c.op === 'drawImage' ? `img:${idOf(c.args[0])}` : c.op);
    expect(ops.indexOf('img:photo')).toBeLessThan(ops.indexOf('gco:destination-in'));
    expect(ops.indexOf('gco:destination-in')).toBeLessThan(ops.indexOf('img:mask'));
    expect(ops.lastIndexOf('gco:source-over')).toBeGreaterThan(ops.indexOf('img:mask'));
    const main = calls.map((c) => (c.op === 'drawImage' ? `img:${idOf(c.args[0])}` : c.op));
    const clip = main.indexOf('clip');
    expect(main.lastIndexOf('save', clip)).toBeGreaterThanOrEqual(0);
    expect(clip).toBeLessThan(main.indexOf('img:surface:824x948'));
    expect(main.indexOf('restore', clip)).toBeGreaterThan(main.indexOf('img:surface:824x948'));
    expect(calls.find((c) => c.op === 'rect')?.args).toEqual([128, 528, 824, 948]);
  });

  test('un selfie est retourné dans sa fenêtre, une photo de la galerie non', () => {
    const mirrored = paint().surfaces[0]?.calls.some((c) => c.op === 'scale' && c.args[0] === -1);
    const straight = paint({ photo: { ...selfie, mirror: false } }).surfaces[0]?.calls.some((c) => c.op === 'scale');
    expect(mirrored).toBe(true);
    expect(straight).toBe(false);
  });

  test('le recadrage de la recette zoome et décale la source, sans sortir de la photo', () => {
    const plain = nums(paint().surfaces[0]?.calls.find((c) => c.op === 'drawImage'));
    const cropped = nums(paint({ recipe: { ...DEFAULT_RECIPE, crop: { dx: 0.5, dy: 0, zoom: 2 } } }).surfaces[0]?.calls.find((c) => c.op === 'drawImage'));
    expect(at(cropped, 3)).toBeCloseTo(at(plain, 3) / 2, 5);
    expect(at(cropped, 4)).toBeCloseTo(at(plain, 4) / 2, 5);
    expect(at(cropped, 1)).toBeGreaterThan(at(plain, 1));
    expect(at(cropped, 1) + at(cropped, 3)).toBeLessThanOrEqual(1600);
  });

  test('sans surface de travail, la photo se découpe au rectangle de la fenêtre, toujours entre save et restore', () => {
    const { calls } = paint({}, { scratch: false });
    const main = calls.map((c) => (c.op === 'drawImage' ? `img:${idOf(c.args[0])}` : c.op));
    expect(main.indexOf('clip')).toBeLessThan(main.indexOf('img:photo'));
    expect(calls.filter((c) => c.op === 'save').length).toBe(calls.filter((c) => c.op === 'restore').length);
  });

  test('sans photo : le remplissage de la fenêtre puis l’emblème en grand, jamais de découpe', () => {
    const { calls } = paint({ photo: null });
    expect(drawn(calls).slice(0, 3)).toEqual(['fill', 'emblem', 'grade0']);
    expect(calls.some((c) => c.op === 'clip')).toBe(false);
    const big = nums(calls.find((c) => c.op === 'drawImage' && idOf(c.args[0]) === 'emblem'));
    expect(at(big, 3)).toBeGreaterThan(300);
  });
});

describe('les passes de grade', () => {
  test('screen est posé pour sa passe et rendu à source-over avant la couche suivante', () => {
    const { calls } = paint();
    const trail = calls.map((c) => (c.op === 'globalCompositeOperation' ? `gco:${String(c.args[0])}` : c.op === 'drawImage' ? `img:${idOf(c.args[0])}` : null)).filter((op): op is string => op !== null);
    const screen = trail.indexOf('gco:screen');
    expect(screen).toBeGreaterThan(-1);
    expect(trail[screen + 1]).toBe('img:grade0');
    expect(trail[screen + 2]).toBe('gco:source-over');
    expect(trail.indexOf('img:grade1')).toBeGreaterThan(screen + 2);
    expect(trail.filter((op) => op === 'gco:screen')).toHaveLength(1);
  });
});

describe('Mee et Meo', () => {
  test('chaque oiseau à son ancre : centre de sa boîte, rotation, miroir pour Meo', () => {
    const { calls } = paint();
    const at = (id: string) => calls.findIndex((c) => c.op === 'drawImage' && idOf(c.args[0]) === id);
    const before = (index: number) => calls.slice(0, index).reverse();
    const mee = before(at('sticker-mee'));
    expect(mee.find((c) => c.op === 'translate')?.args).toEqual([6 + 90, 202 + 90]);
    expect(mee.find((c) => c.op === 'rotate')?.args[0]).toBeCloseTo((-6 * Math.PI) / 180, 8);
    const meo = before(at('sticker-meo'));
    expect(meo.find((c) => c.op === 'scale')?.args).toEqual([-1, 1]);
    expect(calls[at('sticker-mee')]?.args.slice(1)).toEqual([-90, -90, 180, 180]);
  });

  test('un sticker que le catalogue ne connaît pas prend le dessin du cadre simple, à la même ancre', () => {
    const { calls } = paint({ birds: {} });
    expect(drawn(calls)).toContain('art-mee');
    expect(drawn(calls)).toContain('art-meo');
  });

  test('la pose de la recette choisit la mise en page ; une pose que le cadre n’a pas retombe sur celle par défaut', () => {
    const duo = formatOf({ birds: { default: 'perches', layouts: { perches: formatOf().birds.layouts.perches, duo: { pair: { sticker: 'duo-coucou', box: [300, 1300, 480, 300], rotate: 0, flip: false, opacity: 0.9 } } } } });
    const { calls, props } = paint({ format: duo, recipe: { ...DEFAULT_RECIPE, pose: 'duo' }, birds: { 'duo-coucou': image('sticker-duo') } });
    expect(drawn(calls)).toContain('sticker-duo');
    expect(drawn(calls)).not.toContain('sticker-mee');
    expect(calls.some((c) => c.op === 'globalAlpha' && c.args[0] === 0.9)).toBe(true);
    expect(props.globalAlpha).toBe(1);
    const fallback = paint({ format: duo, recipe: { ...DEFAULT_RECIPE, pose: 'ruban' } });
    expect(drawn(fallback.calls)).toContain('sticker-mee');
  });
});

describe('la plaque et le message', () => {
  test('sans message : la plaque simple, et l’emplacement du message reste vide', () => {
    const { calls } = paint();
    expect(drawn(calls)).toContain('plate-plain');
    expect(written(calls).map((t) => t.text)).toEqual(['NOUVEAU RANG', 'Ambassadeur IV', '10 octobre 2026', 'Rejoins-moi sur Meeshy', '23 j']);
  });

  test('avec un message : la plaque à message, et le message écrit à sa ligne', () => {
    const { calls } = paint({ recipe: { ...DEFAULT_RECIPE, message: 'Ubuntu, toujours' } });
    expect(drawn(calls)).toContain('plate-message');
    expect(drawn(calls)).not.toContain('plate-plain');
    const message = written(calls).find((t) => t.text.includes('Ubuntu, toujours'));
    expect(message?.y).toBe(1784);
    expect(message?.font).toContain('"Caveat"');
  });

  test('un message fait d’espaces ne compte pas', () => {
    const { calls } = paint({ recipe: { ...DEFAULT_RECIPE, message: '   ' } });
    expect(drawn(calls)).toContain('plate-plain');
  });

  /* LE MESSAGE DE L'AUTEUR (#10165, L12, § 5.14) : borné à 60 graphèmes quelle que soit la recette, une ligne, isolé
     dans son sens d'écriture, jamais en capitales, la pile système hors du latin. */
  test('une recette de 61 graphèmes n’en écrit que 60, sur une ligne, dans un isolat FSI … PDI', () => {
    const wide = formatOf();
    const roomy = { ...wide, text: { ...wide.text, message: slot({ x: 540, baseline: 1784, sample: 'Ubuntu, toujours', font: { family: 'Caveat', weight: 700, style: 'normal', size: 20, tracking: 0 } }) } };
    const { calls } = paint({ format: roomy, recipe: { ...DEFAULT_RECIPE, message: `${'🇫🇷'.repeat(30)}\n${'é'.repeat(31)}` } });
    const message = written(calls).find((t) => t.text.startsWith('\u2068'));
    expect(message).toBeDefined();
    expect(message?.text.endsWith('\u2069')).toBe(true);
    const inner = message?.text.slice(1, -1) ?? '';
    expect(inner.includes('\n')).toBe(false);
    expect(Array.from(new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(inner)).length).toBe(60);
    expect(drawn(calls)).toContain('plate-message');
  });

  test('un message trop long pour sa place s’ellipse SANS ouvrir son isolat : la PDI ferme toujours la ligne', () => {
    const { calls } = paint({ recipe: { ...DEFAULT_RECIPE, message: 'Merci à toute la famille, aux amis et à toutes celles et ceux' } });
    const message = written(calls).find((t) => t.text.startsWith('\u2068'));
    expect(message?.text.endsWith('…\u2069')).toBe(true);
  });

  test('le message ne passe jamais en capitales, même quand l’exemple de l’export en portait', () => {
    const format = formatOf();
    const shouting = { ...format, text: { ...format.text, message: slot({ x: 540, baseline: 1784, sample: 'UBUNTU, TOUJOURS', font: { family: 'Caveat', weight: 700, style: 'normal', size: 56, tracking: 0 } }) } };
    const { calls } = paint({ format: shouting, recipe: { ...DEFAULT_RECIPE, message: 'Pour toi, maman' } });
    expect(written(calls).some((t) => t.text.includes('Pour toi, maman'))).toBe(true);
    expect(written(calls).some((t) => t.text.includes('POUR TOI, MAMAN'))).toBe(false);
  });

  for (const fixture of ['Для мамы', '給媽媽', 'माँ के लिए', 'לאמא', '🎉🎉', 'Merci يا أمي']) {
    test(`« ${fixture} » s’écrit entier, dans la pile système, jamais en Caveat`, () => {
      const { calls } = paint({ recipe: { ...DEFAULT_RECIPE, message: fixture } });
      const message = written(calls).find((t) => t.text.includes(fixture));
      expect(message).toBeDefined();
      expect(message?.font).not.toContain('"Caveat"');
    });
  }

  test('un message de contrôle (bidi incrusté, contrôle C0) est nettoyé avant d’être écrit', () => {
    const { calls } = paint({ recipe: { ...DEFAULT_RECIPE, message: 'Ub\u0007untu\u202e, toujours' } });
    expect(written(calls).some((t) => t.text === '\u2068Ubuntu, toujours\u2069')).toBe(true);
  });
});

/**
 * LA PLAQUE D'AUTEUR (#10816) sous un cadre décoré : le contrat ne lui déclare
 * aucun emplacement, et le lot #10159 ne la peignait pas — le pseudo
 * disparaissait de l'aperçu ET de l'image finale dès qu'un cadre de gloire
 * s'appliquait. Elle se pose au-dessus du bloc de texte vivant, centrée sur
 * lui, à 40 % de la largeur ; sans dessin d'auteur (invité, moment sans
 * plaque), rien.
 */
describe('la plaque d’auteur', () => {
  test('peinte après le texte, centrée sur le bloc de texte et juste au-dessus de lui, à 40 % de la largeur', () => {
    const author = image('author', 360, 100);
    const { calls } = paint({ art: { ...art, author } });
    const drawnAuthor = calls.findIndex((c) => c.op === 'drawImage' && idOf(c.args[0]) === 'author');
    const dateWritten = calls.findIndex((c) => c.op === 'fillText' && c.args[0] === '10 octobre 2026');
    expect(dateWritten).toBeGreaterThan(-1);
    expect(drawnAuthor).toBeGreaterThan(dateWritten);
    const args = nums(calls[drawnAuthor]);
    expect(at(args, 3)).toBeCloseTo(432, 5);
    expect(at(args, 4)).toBeCloseTo(120, 5);
    expect(at(args, 1)).toBeCloseTo(324, 5);
    expect(at(args, 2) + at(args, 4)).toBeCloseTo(1586 - 1080 * 0.02, 5);
  });

  test('sans dessin d’auteur : aucune plaque', () => {
    expect(drawn(paint().calls)).not.toContain('author');
  });
});

describe('le texte vivant', () => {
  test('capitales quand l’exemple de l’export l’était, à la ligne de base et l’ancre du contrat, dans la police du cadre', () => {
    const [kicker, title, date] = written(paint().calls);
    expect(kicker).toMatchObject({ text: 'NOUVEAU RANG', x: 540, y: 1626, align: 'center' });
    expect(kicker?.font).toContain('"Manrope"');
    expect(kicker?.font).toContain('800');
    expect(title).toMatchObject({ text: 'Ambassadeur IV', y: 1718 });
    expect(title?.font).toContain('"Cinzel"');
    expect(date?.text).toBe('10 octobre 2026');
  });

  test('un titre trop long rétrécit jusqu’à 60 %, puis s’ellipse — jamais coupé net', () => {
    const long = 'Ambassadeur de toutes les langues de la Terre et des étoiles lointaines';
    const title = written(paint({ texts: { ...texts, title: long } }).calls)[1];
    expect(title?.text.endsWith('…')).toBe(true);
    expect(pxOf(title?.font)).toBeCloseTo(48, 0);
    const shorter = written(paint({ texts: { ...texts, title: 'Ambassadeur des langues du monde' } }).calls)[1];
    expect(shorter?.text).toBe('Ambassadeur des langues du monde');
    expect(pxOf(shorter?.font)).toBeLessThan(80);
  });

  test('l’arabe s’écrit de droite à gauche, sans capitales, dans la pile système', () => {
    const title = written(paint({ texts: { ...texts, kicker: 'رتبة جديدة' }, language: 'ar' }).calls)[0];
    expect(title).toMatchObject({ text: 'رتبة جديدة', direction: 'rtl' });
    expect(title?.font).not.toContain('"Manrope"');
    const latin = written(paint().calls)[0];
    expect(latin?.direction).toBe('ltr');
  });

  test('un emplacement décoratif garde le texte d’exemple ; un emplacement sur chemin n’est pas peint droit', () => {
    const decorated = formatOf();
    const format = formatOf({ text: { ...decorated.text, 'decor.1': slot({ x: 200, baseline: 300, sample: 'CARNET DE BORD' }), 'decor.2': slot({ x: 200, baseline: 400, sample: 'COURBE', path: { d: 'M0 0 A1 1 0 1 1 2 0', startOffset: '0' } }) } });
    const names = written(paint({ format }).calls).map((t) => t.text);
    expect(names).toContain('CARNET DE BORD');
    expect(names).not.toContain('COURBE');
  });

  test('un dégradé de texte est posé sur la boîte de l’emplacement ; un effet « dessous » précède le texte', () => {
    const base = formatOf();
    const title = { ...base.text.title, fill: { linear: { x1: 0, y1: 0, x2: 0, y2: 1, stops: [{ offset: 0, color: '#FFF4C2FF' }, { offset: 1, color: '#E8B53CFF' }] } }, effects: [{ dx: 0, dy: 3, fill: { solid: '#00000088' }, stroke: null, opacity: 0.6, under: true, filter: null }] } as GloryFrameTextSlot;
    const { calls } = paint({ format: formatOf({ text: { ...base.text, title } }) });
    const gradient = calls.find((c) => c.op === 'createLinearGradient');
    const [x, y, w, h] = title.bbox;
    expect(gradient?.args).toEqual([x, y, x, y + h]);
    expect(w).toBeGreaterThan(0);
    const titles = written(calls).filter((t) => t.text === 'Ambassadeur IV');
    expect(titles.map((t) => t.y)).toEqual([1721, 1718]);
  });

  test('la plaque `plate.1` est VIVANTE (L14, #10167) : le compte de Meeshes gardées remplace l’exemple, et sans texte l’emplacement reste vide — jamais « 100 Meeshes gardées » d’exemple sur un autre palier', () => {
    const base = formatOf();
    const format = formatOf({ text: { ...base.text, 'plate.1': slot({ x: 540, baseline: 1660, sample: '100 Meeshes gardées', font: { family: 'Manrope', weight: 700, style: 'normal', size: 30, tracking: 0 } }) } });
    const alive = written(paint({ format, texts: { ...texts, 'plate.1': '50 Meeshes gardées' } }).calls).map((t) => t.text);
    expect(alive).toContain('50 Meeshes gardées');
    expect(alive).not.toContain('100 Meeshes gardées');
    const silent = written(paint({ format }).calls).map((t) => t.text);
    expect(silent).not.toContain('100 Meeshes gardées');
  });

  test('un texte de plaque vivant reste DANS sa plaque : il rétrécit à la boîte du contrat, là où la ligne du dessus peut s’étendre jusqu’à la marge', () => {
    const base = formatOf();
    const long = 'Mille Meeshes gardées dans la réserve';
    const plate = slot({ x: 540, baseline: 1660, sample: '100 Meeshes gardées', font: { family: 'Manrope', weight: 700, style: 'normal', size: 30, tracking: 0 } });
    const format = formatOf({ text: { ...base.text, 'plate.1': plate } });
    const painted = written(paint({ format, texts: { ...texts, kicker: long, 'plate.1': long } }).calls);
    const onPlate = painted.find((t) => t.y === 1660);
    const kicker = painted.find((t) => t.y === 1626);
    expect(pxOf(onPlate?.font)).toBeLessThan(30);
    expect(onPlate?.text.replace(/…$/, '').length).toBeGreaterThan(0);
    expect(pxOf(kicker?.font)).toBe(24);
    expect(kicker?.text).toBe(long.toUpperCase());
  });

  test('sans measureText (vieux moteur), le texte se peint quand même', () => {
    const { calls } = paint({}, { measure: false });
    expect(written(calls).map((t) => t.text)).toContain('Ambassadeur IV');
  });
});

describe('ce qui se retire (H-2)', () => {
  test('Flamme retirée : ni son dessin ni ses jours', () => {
    const { calls } = paint({ recipe: { ...DEFAULT_RECIPE, showFlame: false } });
    expect(drawn(calls)).not.toContain('flame');
    expect(written(calls).map((t) => t.text)).not.toContain('23 j');
  });

  test('bandeau retiré : aucune peinture dans banner.box, ni fond ni phrase', () => {
    const { calls } = paint({ recipe: { ...DEFAULT_RECIPE, showLink: false } });
    expect(written(calls).map((t) => t.text)).not.toContain('Rejoins-moi sur Meeshy');
    const inBox = calls.filter((c) => (c.op === 'roundRect' || c.op === 'fillRect') && Number(c.args[1]) >= 1720);
    expect(inBox).toEqual([]);
  });

  test('un cadre sans bandeau déclaré ne porte pas le bandeau, même avec un lien', () => {
    const { calls } = paint({ format: formatOf({ banner: null, stack: ['photo', 'grade:0', 'grade:1', 'decor', 'crest', 'birds', 'plate', 'text'] }) });
    expect(written(calls).map((t) => t.text)).not.toContain('Rejoins-moi sur Meeshy');
  });

  test('le bandeau tient dans la boîte déclarée par le cadre', () => {
    const { calls } = paint();
    const frame = nums(calls.find((c) => c.op === 'roundRect'));
    expect(at(frame, 1)).toBeGreaterThanOrEqual(1720);
    expect(at(frame, 1) + at(frame, 3)).toBeLessThanOrEqual(1920);
  });
});
