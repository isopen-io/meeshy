import { describe, expect, test } from 'bun:test';

import { BRAND_DASHES } from '@/lib/brand';

import { BRAND_FONT, frameCanvasFont, framesFonts, loadFrameFonts } from './frame-fonts';
import { frameAreas, frameSlots } from './frame-layout';
import { ornamentStage, frameScene, paintFaces, paintFrame, TONE_FILTERS, type FrameFace, type FramePaintable } from './frame-paint';
import { paintBorder, paintPattern } from './frame-paint-decor';
import { luminance, mix, parseColor, tint } from './frame-paint-kit';
import { paintOrnament } from './frame-paint-ornaments';
import { slotPath } from './frame-paint-shapes';
import { planText, WATERMARK_ALPHA } from './frame-paint-text';
import { calls, drewBrandDashes, inked, recorder, sets, written, type Entry } from './frame-recorder.test-support';
import { composeFrame, frameLayerCache, renderFrameLayers, type CanvasFactory } from './frame-render';
import { BRAND_MARKS, BRAND_PLACES, FRAME_BORDERS, FRAME_FONTS, FRAME_ORNAMENTS, FRAME_PATTERNS, NAME_STYLES, SLOT_SHAPES, SLOT_TONES, type FrameLook } from './frame-spec';
import type { FramePerson, FrameTexts } from './frame-text';

/**
 * LA PEINTURE DES CADRES (#8741, #8743, spec § 4 et § 5) — chaque valeur de
 * chaque vocabulaire peint quelque chose sans lever ; la signature est
 * toujours tracée ; le nom du groupe ne s'écrit qu'en groupe ; un ornement
 * de premier plan est découpé aux marges ; une capture n'est jamais en miroir.
 */

const PORTRAIT = { width: 1080, height: 1920 } as const;
const NAMES = ['Awa', 'Karim', 'Lina', 'Tomás', 'Mei', 'Noah', 'Inès', 'Yuki', 'Omar', 'Sofia', 'Léo', 'Zara'];
const people = (count: number): readonly FramePerson[] => NAMES.slice(0, count).map((name, index) => ({ id: `u${index}`, name, handle: name.toLowerCase(), isSelf: index === 0 }));
const TEXTS: FrameTexts = { groupName: 'Les Copains', isGroup: true, date: '29 sept. 2026', accent: null };
const face = (): FrameFace => ({ source: {} as CanvasImageSource, size: { width: 1280, height: 720 } });

const LOOK: FramePaintable = {
  layout: { arrangement: 'grid', margin: 0.06, gap: 0.03, top: 0.18, bottom: 0.14 },
  slot: { shape: 'round', radius: 0.08, stroke: { color: '#FFFFFF', width: 0.006 }, tilt: 'none', tone: 'color' },
  background: { kind: 'solid', color: '#111827' },
  ornaments: [],
  brand: { mark: 'both', place: 'bottom', color: '#FFFFFF', size: 'm' },
  names: { show: 'name', style: 'caption', font: 'bubble', color: '#FFFFFF' },
  title: { source: 'group', font: 'elegant', color: '#FFFFFF', place: 'top', size: 'l' },
};

const look = (overrides: Partial<FrameLook>): FramePaintable => ({ ...LOOK, ...overrides });

const paint = (frame: FramePaintable, count = 3, texts: FrameTexts = TEXTS, faces: readonly (FrameFace | null)[] = Array.from({ length: count }, face)) => {
  const { log, context } = recorder();
  paintFrame(context, frame, people(count), faces, texts, PORTRAIT);
  return log;
};

describe('les quatorze motifs', () => {
  FRAME_PATTERNS.forEach((kind) =>
    test(`${kind} peint à son opacité`, () => {
      const { log, context } = recorder();
      paintPattern(context, { kind, color: '#FFFFFF', opacity: 0.2 }, PORTRAIT);
      expect(inked(log)).toBeGreaterThan(0);
      expect(sets(log, 'globalAlpha')).toContain(0.2);
    }),
  );
});

describe('les quatorze bordures', () => {
  FRAME_BORDERS.forEach((kind) =>
    test(`${kind} peint autour de la toile`, () => {
      const { log, context } = recorder();
      paintBorder(context, { kind, color: '#C9A45C', width: 0.008, inset: 0.02 }, PORTRAIT);
      expect(inked(log)).toBeGreaterThan(0);
    }),
  );
});

describe('les trente-quatre ornements', () => {
  const scene = frameScene(look({}), people(4), TEXTS, PORTRAIT);
  FRAME_ORNAMENTS.forEach((kind) =>
    (['back', 'front'] as const).forEach((layer) =>
      test(`${kind} (${layer}) se dessine`, () => {
        const { log, context } = recorder();
        paintOrnament(context, { kind, color: '#F3E3B5', density: 'high', layer }, ornamentStage(scene, layer === 'front'), 0);
        expect(inked(log)).toBeGreaterThan(0);
      }),
    ),
  );

  test('au premier plan, un ornement est découpé aux marges et aux réserves — jamais sur un visage', () => {
    const stage = ornamentStage(scene, true);
    FRAME_ORNAMENTS.filter((kind) => kind !== 'crown' && kind !== 'tape').forEach((kind) => {
      const { log, context } = recorder();
      paintOrnament(context, { kind, color: '#FFFFFF', density: 'mid', layer: 'front' }, stage, 0);
      const clip = log.findIndex((entry) => entry.key === 'clip');
      const firstInk = log.findIndex((entry) => ['fill', 'stroke', 'fillRect', 'fillText'].includes(entry.key));
      expect(clip).toBeGreaterThanOrEqual(0);
      expect(clip).toBeLessThan(firstInk);
      const clipRects = log.slice(0, clip).filter((entry) => entry.key === 'rect').map((entry) => entry.value);
      expect(clipRects).toEqual(stage.zones.map((zone) => [zone.x, zone.y, zone.width, zone.height]));
    });
  });

  test('la zone de contenu n’est jamais une zone de premier plan', () => {
    const stage = ornamentStage(scene, true);
    const content = scene.areas.content;
    stage.zones.forEach((zone) => {
      const overlapX = Math.min(zone.x + zone.width, content.x + content.width) - Math.max(zone.x, content.x);
      const overlapY = Math.min(zone.y + zone.height, content.y + content.height) - Math.max(zone.y, content.y);
      expect(overlapX <= 1e-6 || overlapY <= 1e-6).toBe(true);
    });
  });

  test('le même ornement se pose au même endroit à chaque image', () => {
    const first = recorder();
    const second = recorder();
    paintOrnament(first.context, { kind: 'sparkles', color: '#FFFFFF', density: 'mid', layer: 'back' }, ornamentStage(scene, false), 2);
    paintOrnament(second.context, { kind: 'sparkles', color: '#FFFFFF', density: 'mid', layer: 'back' }, ornamentStage(scene, false), 2);
    expect(JSON.stringify(second.log)).toBe(JSON.stringify(first.log));
  });
});

describe('les douze formes de case', () => {
  const box = { x: 100, y: 200, width: 400, height: 520 };
  SLOT_SHAPES.forEach((shape) =>
    test(`${shape} se trace dans sa case`, () => {
      const { log, context } = recorder();
      slotPath(context, shape, box, { radius: 0.1, seed: 3 });
      expect(log[0]?.key).toBe('beginPath');
      const points = log.filter((entry) => ['moveTo', 'lineTo'].includes(entry.key)).map((entry) => entry.value as [number, number]);
      const slack = box.width * 0.04;
      points.forEach(([x, y]) => {
        expect(x).toBeGreaterThanOrEqual(box.x - slack);
        expect(x).toBeLessThanOrEqual(box.x + box.width + slack);
        expect(y).toBeGreaterThanOrEqual(box.y - slack);
        expect(y).toBeLessThanOrEqual(box.y + box.height + slack);
      });
      expect(log.length).toBeGreaterThan(1);
    }),
  );
});

describe('les huit tons', () => {
  SLOT_TONES.forEach((tone) =>
    test(`${tone} développe le visage${tone === 'color' ? ' tel quel' : ''}`, () => {
      const log = paint(look({ slot: { ...LOOK.slot, tone, duotone: ['#1E1B4B', '#FDE68A'] } }), 2);
      expect(calls(log, 'drawImage')).toHaveLength(2);
      const filters = sets(log, 'filter');
      if (tone === 'color') expect(filters).toEqual([]);
      else expect(filters).toContain(TONE_FILTERS[tone]);
      if (tone === 'duotone') {
        const operations = sets(log, 'globalCompositeOperation');
        expect(operations).toContain('multiply');
        expect(operations).toContain('lighten');
        expect(sets(log, 'fillStyle')).toContain('#FDE68A');
      }
    }),
  );

  test('une capture n’est jamais en miroir : aucune échelle négative, aucune destination retournée', () => {
    const log = paint(look({ slot: { ...LOOK.slot, tilt: 'wild' } }), 5);
    calls(log, 'scale').forEach(([x, y]) => {
      expect(Number(x)).toBeGreaterThan(0);
      expect(Number(y)).toBeGreaterThan(0);
    });
    calls(log, 'drawImage').forEach((args) => {
      expect(Number(args[3])).toBeGreaterThan(0);
      expect(Number(args[7])).toBeGreaterThan(0);
    });
  });

  test('caméra coupée : un dégradé et l’initiale, jamais une case retirée', () => {
    const log = paint(LOOK, 3, TEXTS, [face(), null, face()]);
    expect(calls(log, 'drawImage')).toHaveLength(2);
    expect(written(log)).toContain('K');
  });

  test('les visages seuls : la seule peinture de chaque image', () => {
    const { log, context } = recorder();
    paintFaces(context, frameScene(LOOK, people(4), TEXTS, PORTRAIT), [face(), face(), face(), face()]);
    expect(calls(log, 'drawImage')).toHaveLength(4);
    expect(written(log)).toEqual([]);
  });
});

describe('les sept styles de noms', () => {
  NAME_STYLES.forEach((style) =>
    test(`${style} écrit chaque nom`, () => {
      const text = written(paint(look({ names: { show: 'name', style, font: 'note', color: '#FFFFFF' } }), 3)).join(' | ');
      ['Awa', 'Karim', 'Lina'].forEach((name) => expect(text).toContain(name));
    }),
  );

  test('both : le nom puis le @pseudo', () => {
    const text = written(paint(look({ names: { show: 'both', style: 'plate', font: 'note', color: '#FFFFFF' } }), 2));
    expect(text).toContain('Awa');
    expect(text).toContain('@awa');
  });

  test('none : aucun nom', () => {
    const text = written(paint(look({ names: { show: 'none', style: 'caption', font: 'note', color: '#FFFFFF' } }), 2));
    expect(text).not.toContain('Awa');
  });

  test('une légende sous la case descend sur un bandeau quand la place manque sous une case', () => {
    const tight = look({ layout: { ...LOOK.layout, arrangement: 'grid', gap: 0 }, names: { show: 'name', style: 'caption', font: 'note', color: '#FFFFFF' } });
    const log = paint(tight, 4);
    const slot = frameSlots(tight, 4, PORTRAIT)[0]?.rect;
    const awa = calls(log, 'fillText').find((args) => args[0] === 'Awa');
    expect(slot).toBeDefined();
    expect(Number(awa?.[2])).toBeLessThan((slot?.y ?? 0) + (slot?.height ?? 0));
    expect(Number(awa?.[2])).toBeGreaterThan(slot?.y ?? 0);
  });
});

describe('la signature Meeshy — toujours', () => {
  BRAND_PLACES.forEach((place) =>
    BRAND_MARKS.forEach((mark) =>
      test(`${mark} · ${place}`, () => {
        const log = paint(look({ brand: { mark, place, color: '#FFFFFF', size: 'm' } }), 3);
        if (mark !== 'logo') expect(written(log)).toContain('meeshy');
        if (mark !== 'wordmark') expect(drewBrandDashes(log)).toBe(true);
        if (place === 'watermark') expect(written(log).filter((text) => text === 'meeshy').length + (mark === 'logo' ? 99 : 0)).toBeGreaterThan(8);
      }),
    ),
  );

  test('filigrane du logo : l’opacité de chaque trait MULTIPLIE celle du filigrane, elle ne la remplace pas', () => {
    const log = paint(look({ brand: { mark: 'logo', place: 'watermark', color: '#FFFFFF', size: 'm' } }), 2);
    const alphas = sets(log, 'globalAlpha').map(Number);
    expect(alphas).toContain(WATERMARK_ALPHA);
    BRAND_DASHES.forEach((dash) => expect(alphas).toContain(WATERMARK_ALPHA * dash.opacity));
    expect(Math.max(...alphas)).toBeLessThanOrEqual(WATERMARK_ALPHA);
  });

  test('le logo : trois traits aux bouts ronds, aux opacités de la marque', () => {
    const log = paint(look({ brand: { mark: 'logo', place: 'bottom-right', color: '#FFFFFF', size: 'l' } }), 2);
    expect(sets(log, 'lineCap')).toContain('round');
    const alphas = sets(log, 'globalAlpha');
    BRAND_DASHES.forEach((dash) => expect(alphas).toContain(dash.opacity));
  });

  test('la marque reste en minuscules, même quand le titre est en capitales', () => {
    const log = paint(look({ title: { source: 'brand', font: 'poster', color: '#FFFFFF', place: 'top', size: 'l', case: 'upper' } }), 2);
    expect(written(log)).toContain('meeshy');
    expect(written(log)).not.toContain('MEESHY');
  });

  test('sans réserve basse, la signature se peint quand même', () => {
    const log = paint(look({ layout: { ...LOOK.layout, bottom: 0 }, brand: { mark: 'wordmark', place: 'bottom', color: '#FFFFFF', size: 's' } }), 2);
    expect(written(log)).toContain('meeshy');
  });
});

describe('le titre', () => {
  test('le nom du groupe ne s’écrit qu’en groupe', () => {
    expect(written(paint(LOOK, 4))).toContain('Les Copains');
    const duo = written(paint(LOOK, 2, { ...TEXTS, isGroup: false }));
    expect(duo).not.toContain('Les Copains');
    expect(duo).toContain('Awa & Karim');
  });

  (['none', 'shadow', 'glow', 'outline'] as const).forEach((effect) =>
    test(`effet ${effect}`, () => {
      const log = paint(look({ title: { source: 'date', font: 'classic', color: '#FFFFFF', place: 'top', size: 'm', effect, case: 'upper' } }), 2);
      expect(written(log)).toContain('29 SEPT. 2026');
      if (effect === 'outline') expect(calls(log, 'strokeText').length).toBeGreaterThan(0);
      if (effect === 'glow') expect(sets(log, 'shadowBlur').length).toBeGreaterThan(0);
    }),
  );

  test('le plan : titre et sous-titre en haut, liste et signature en bas, dans leurs réserves', () => {
    const frame = look({ subtitle: { source: 'date', font: 'classic', color: '#FFFFFF', place: 'top', size: 's' }, names: { show: 'name', style: 'list', font: 'note', color: '#FFFFFF' } });
    const areas = frameAreas(frame.layout, PORTRAIT);
    const plan = planText(frame, 4, areas, (text, px) => text.length * px * 0.5);
    [plan.title, plan.subtitle].forEach((row) => {
      expect(row).not.toBeNull();
      expect(row?.y ?? -1).toBeGreaterThanOrEqual(areas.top.y - 1e-6);
      expect((row?.y ?? 0) + (row?.height ?? 0)).toBeLessThanOrEqual(areas.top.y + areas.top.height + 1e-6);
    });
    expect((plan.subtitle?.y ?? 0) > (plan.title?.y ?? 0)).toBe(true);
    [plan.list, plan.brand].forEach((row) => expect((row?.y ?? -1) >= areas.bottom.y - 1e-6).toBe(true));
    expect((plan.brand?.y ?? 0) > (plan.list?.y ?? 0)).toBe(true);
  });

  test('sans réserve haute, le titre se tait plutôt que de couvrir un visage', () => {
    const frame = look({ layout: { ...LOOK.layout, top: 0 } });
    expect(planText(frame, 3, frameAreas(frame.layout, PORTRAIT), (text, px) => text.length * px * 0.5).title).toBeNull();
  });
});

describe('le fond', () => {
  test('accent : le dégradé de la conversation, repli indigo Meeshy', () => {
    const fallback = paint(look({ background: { kind: 'accent' } }), 2);
    expect(calls(fallback, 'createLinearGradient').length).toBeGreaterThan(0);
    const accented = paint(look({ background: { kind: 'accent' } }), 2, { ...TEXTS, accent: { primary: '#10B981', secondary: '#047857' } });
    expect(accented).not.toEqual(fallback);
  });

  (['solid', 'linear', 'radial'] as const).forEach((kind) =>
    test(`${kind}`, () => {
      const background: FrameLook['background'] = kind === 'solid' ? { kind, color: '#000000' } : kind === 'linear' ? { kind, colors: ['#000000', '#FFFFFF'], angle: 30 } : { kind, colors: ['#000000', '#FFFFFF'] };
      const log = paint(look({ background }), 2);
      expect(calls(log, 'fillRect').length).toBeGreaterThan(0);
    }),
  );
});

describe('les couleurs', () => {
  test('un mélange se remélange : `rgb()`/`rgba()` se lisent, jamais comme du noir', () => {
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor('rgb(200, 100, 50)')).toEqual({ r: 200, g: 100, b: 50, a: 1 });
    expect(tint('rgba(10, 20, 30, 0.5)', 0.5)).toBe('rgba(10, 20, 30, 0.25)');
    const pink = mix('#FF0000', '#FFFFFF', 0.5);
    expect(mix(pink, '#000000', 0)).toBe(pink);
    expect(mix(pink, '#FFFFFF', 0.5)).toBe('rgba(255, 192, 192, 1)');
    expect(luminance(mix('#FFFFFF', '#FFFFFF', 0.3))).toBeCloseTo(1, 6);
  });

  test('les hex du catalogue : #RGB, #RRGGBB, #RRGGBBAA', () => {
    expect(parseColor('#F00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('#C9A45C')).toEqual({ r: 201, g: 164, b: 92, a: 1 });
    expect(parseColor('#00000080').a).toBeCloseTo(128 / 255, 6);
  });
});

describe('les polices', () => {
  test('les dix-huit familles rendent une chaîne de canevas, la famille embarquée en tête', () => {
    FRAME_FONTS.forEach((font) => expect(frameCanvasFont(font, 40)).toMatch(/^(italic )?\d{3} 40px /));
    expect(frameCanvasFont('elegant', 40)).toContain('"Prata"');
    expect(frameCanvasFont('bubble', 40)).toMatch(/^600 40px "Fredoka"/);
    expect(frameCanvasFont('italic', 40)).toMatch(/^italic 400/);
    expect(BRAND_FONT).toBe('bubble');
  });

  test('les polices d’un cadre : noms, titre, sous-titre, marque', () => {
    expect(framesFonts([look({ names: { show: 'name', style: 'caption', font: 'note', color: '#FFFFFF' } })])).toEqual(['note', 'elegant', 'bubble']);
  });

  test('loadFrameFonts attend les seules polices embarquées, et ne lève pas si une échoue', async () => {
    const asked: string[] = [];
    await loadFrameFonts([look({ names: { show: 'name', style: 'caption', font: 'bold', color: '#FFFFFF' } })], {
      load: (font: string) => {
        asked.push(font);
        return Promise.reject(new Error('offline'));
      },
    });
    expect(asked.some((font) => font.includes('Prata'))).toBe(true);
    expect(asked.some((font) => font.includes('Fredoka'))).toBe(true);
    expect(asked).toHaveLength(2);
    await loadFrameFonts([LOOK], undefined);
  });
});

describe('le rendu en couches', () => {
  const factory = (): { readonly factory: CanvasFactory; readonly logs: Entry[][] } => {
    const logs: Entry[][] = [];
    return {
      logs,
      factory: () => {
        const { log, context } = recorder();
        logs.push(log);
        return { canvas: { layer: logs.length } as unknown as CanvasImageSource, context };
      },
    };
  };
  const FRAME = { ...LOOK, id: 'test.look.comite' };

  test('le fond et le dessus se peignent une fois ; chaque image ne repeint que les visages', () => {
    const made = factory();
    const layers = renderFrameLayers(FRAME, people(3), PORTRAIT, TEXTS, made.factory);
    expect(layers).not.toBeNull();
    expect(made.logs).toHaveLength(2);
    expect(written(made.logs[1] ?? [])).toContain('meeshy');
    expect(calls(made.logs[0] ?? [], 'drawImage')).toEqual([]);
    const { log, context } = recorder();
    if (layers !== null) composeFrame(context, layers, [face(), face(), face()]);
    const draws = calls(log, 'drawImage');
    expect(draws).toHaveLength(5);
    expect(draws[0]?.[0]).toBe(layers?.backdrop);
    expect(draws[4]?.[0]).toBe(layers?.overlay);
    expect(written(log)).toEqual([]);
  });

  test('le cache sert le même jeu de couches sans repeindre, et reste borné', () => {
    const made = factory();
    const cache = frameLayerCache(made.factory, 24);
    const first = cache.get(FRAME, people(3), PORTRAIT, TEXTS);
    expect(cache.get(FRAME, people(3), PORTRAIT, TEXTS)).toBe(first);
    expect(made.logs).toHaveLength(2);
    expect(cache.get(FRAME, people(3), PORTRAIT, { ...TEXTS, groupName: 'Autre' })).not.toBe(first);
    Array.from({ length: 30 }, (_, index) => cache.get({ ...FRAME, id: `test.look.${index}` }, people(2), PORTRAIT, TEXTS));
    expect(cache.size).toBe(24);
  });

  test('une case par personne, dans l’ordre des personnes', () => {
    expect(frameSlots(LOOK, 5, PORTRAIT).map((box) => box.index)).toEqual([0, 1, 2, 3, 4]);
  });
});
