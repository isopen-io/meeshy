/**
 * Les MISES EN PAGE de Mee et Meo, jugées SANS navigateur sur le contrat (#10277, prompt § 5.7) : chaque cadre
 * versionné déclare ses mises en page, chacune validée par le détecteur du générateur (`validated`, dans la règle),
 * son défaut n'est jamais un selfie, et le DESSIN de chaque oiseau reste hors de la fenêtre photo (selfie excepté).
 * Le détecteur pixel à pixel est `docs/product/cadres-de-gloire/generateur/lib/overlap.mjs --check` (CI) ; ce témoin
 * géométrique tourne partout où `packages/shared` tourne, et rougit sur une ancre mutée.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GloryFrameFormatSchema, type GloryFrameBirdAnchor, type GloryFrameFormat } from '../types/glory-frame-format';
import { readGloryFrameSources } from '../scripts/generate-glory-frames';
import { GLORY_FRAME_OVERLAP_RULE, gloryBirdArtInWindow, gloryBirdArtRect, gloryFrameBirdFailures, gloryFrameLayoutVerdict, rasterizeGloryWindowPath } from '../utils/glory-frame-birds';

const frames = [...readGloryFrameSources().collections.values()].flatMap((collection) => collection.frames);
const stories = frames.map((frame) => ({ id: frame.id, format: frame.formats.story }));

const square = 'M10 10h20v20h-20Z';

describe('la règle d’empiètement, lue sur le contrat', () => {
  it('juge un verdict mesuré : overlap, profondeur et visage ; le selfie n’est exempté que de l’overlap et de la profondeur', () => {
    expect(GLORY_FRAME_OVERLAP_RULE).toEqual({ overlap: 250, depth: 6, face: 0 });
    expect(gloryFrameLayoutVerdict('pied', { overlap: 250, depth: 6, face: 0 })).toBe('ok');
    expect(gloryFrameLayoutVerdict('pied', { overlap: 251, depth: 0, face: 0 })).toBe('hors-regle');
    expect(gloryFrameLayoutVerdict('cotes', { overlap: 0, depth: 7, face: 0 })).toBe('hors-regle');
    expect(gloryFrameLayoutVerdict('selfie', { overlap: 9000, depth: 120, face: 0 })).toBe('ok');
    expect(gloryFrameLayoutVerdict('selfie', { overlap: 0, depth: 0, face: 1 })).toBe('face');
  });

  it('rastérise la fenêtre comme le générateur la trace (règle non nulle, centre des pixels), sur une sous-boîte', () => {
    const inside = rasterizeGloryWindowPath(square, { origin: [5, 5], width: 30, height: 30 });
    expect(inside.reduce((sum, v) => sum + v, 0)).toBe(400);
    expect(inside[5 * 30 + 5]).toBe(1);
    expect(inside[4 * 30 + 5]).toBe(0);
    const hole = rasterizeGloryWindowPath(`${square}M15 15v10h10v-10Z`, { origin: [0, 0], width: 40, height: 40 });
    expect(hole.reduce((sum, v) => sum + v, 0)).toBe(300);
  });
});

describe('la part du dessin dans la fenêtre est celle qu’un pixel à pixel compterait', () => {
  const sidesOf = (d: string) =>
    [...d.matchAll(/M(\d+) (\d+)((?:[hv]-?\d+)+)Z/g)].flatMap(([, sx, sy, moves]) => {
      const start = [Number(sx), Number(sy)] as const;
      const points = [...(moves ?? '').matchAll(/([hv])(-?\d+)/g)].reduce<readonly (readonly [number, number])[]>((acc, [, axis, n]) => {
        const [px, py] = acc[acc.length - 1] ?? start;
        return [...acc, axis === 'h' ? [px + Number(n), py] : [px, py + Number(n)]];
      }, [start]);
      return [...points, start].slice(1).flatMap((to, at) => {
        const from = points[at] ?? start;
        return from[0] === to[0] && from[1] !== to[1] ? [{ x: from[0], low: Math.min(from[1], to[1]), high: Math.max(from[1], to[1]), sign: to[1] > from[1] ? 1 : -1 }] : [];
      });
    });
  const inPath = (sides: ReturnType<typeof sidesOf>, px: number, py: number) =>
    sides.reduce((winding, side) => (side.x <= px && side.low < py + 0.5 && py + 0.5 < side.high ? winding + side.sign : winding), 0) !== 0;
  const pixelShare = (format: GloryFrameFormat, anchor: GloryFrameBirdAnchor) => {
    const sides = sidesOf(format.window.path ?? '');
    const [rx, ry, rw, rh] = gloryBirdArtRect(anchor);
    const [x0, y0, x1, y1] = [Math.max(0, Math.floor(rx)), Math.max(0, Math.floor(ry)), Math.min(format.size[0], Math.ceil(rx + rw)), Math.min(format.size[1], Math.ceil(ry + rh))];
    if (x1 <= x0 || y1 <= y0 || rw * rh === 0) return 0;
    const rows = Array.from({ length: y1 - y0 }, (_, row) => Array.from({ length: x1 - x0 }, (__, col) => inPath(sides, x0 + col, y0 + row)).filter(Boolean).length);
    return rows.reduce((sum, count) => sum + count, 0) / (rw * rh);
  };
  const base = stories[0]?.format as GloryFrameFormat;
  const baseAnchor = Object.values(base.birds.layouts[base.birds.default] ?? {})[0] as GloryFrameBirdAnchor;
  const paths = [
    'M100 100h600v900h-600ZM250 300v300h300v-300Z',
    'M100 100h400v400h-400ZM300 300h400v400h-400Z',
    'M50 60h100v40h80v-20h120v300h-300Z',
    'M700 800h500v500h-500Z',
  ];
  const anchors: readonly GloryFrameBirdAnchor[] = [
    { ...baseAnchor, box: [120, 140, 300, 300], art: [0, 0, 1, 1], rotate: 0, flip: false },
    { ...baseAnchor, box: [210.4, 260.7, 333.3, 333.3], art: [0.12, 0.05, 0.71, 0.88], rotate: 17.5, flip: true },
    { ...baseAnchor, box: [640, 760, 420, 420], art: [0.2, 0.1, 0.6, 0.8], rotate: -33, flip: false },
    { ...baseAnchor, box: [-80, -60, 260, 260], art: [0, 0.3, 1, 0.5], rotate: 90, flip: true },
    { ...baseAnchor, box: [1500, 1500, 100, 100], art: [0, 0, 1, 1], rotate: 0, flip: false },
  ];

  it('sur des fenêtres à trou, à recouvrement, en escalier et débordantes, chaque ancre compte les mêmes pixels', () => {
    const windowed = (path: string): GloryFrameFormat => ({ ...base, size: [1000, 1100], window: { ...base.window, path } });
    const cases = paths.flatMap((path) => anchors.map((anchor) => ({ format: windowed(path), anchor })));
    expect(cases.map(({ format, anchor }) => gloryBirdArtInWindow(format, anchor))).toEqual(cases.map(({ format, anchor }) => pixelShare(format, anchor)));
    expect(cases.filter(({ format, anchor }) => gloryBirdArtInWindow(format, anchor) > 0).length).toBeGreaterThanOrEqual(10);
    const { path: _path, ...pathless } = base.window;
    expect(anchors.map((anchor) => gloryBirdArtInWindow({ ...base, window: pathless }, anchor))).toEqual(anchors.map(() => 0));
  });

  it('le masque d’une sous-boîte décalée est celui du pixel à pixel', () => {
    const box = { origin: [237, 285] as const, width: 300, height: 260 };
    paths.forEach((path) => {
      const sides = sidesOf(path);
      const expected = Array.from({ length: box.width * box.height }, (_, at) => (inPath(sides, box.origin[0] + (at % box.width), box.origin[1] + Math.floor(at / box.width)) ? 1 : 0));
      expect([...rasterizeGloryWindowPath(path, box)]).toEqual(expected);
    });
  });
});

describe('chaque cadre versionné déclare ses mises en page, validées', () => {
  it('lit les contrats (sinon ce témoin ne prouverait rien)', () => {
    expect(stories.length).toBeGreaterThanOrEqual(180);
  });

  it('aucun cadre n’est en défaut : défaut hors selfie, verdict déclaré et dans la règle, dessin hors de la photo', () => {
    const failures = stories.flatMap(({ id, format }) => gloryFrameBirdFailures(format).map((failure) => `${id} : ${failure}`));
    expect(failures).toEqual([]);
  });

  it('la mise en page dessinée n’est plus la seule : des cadres en déclarent plusieurs', () => {
    const several = stories.filter(({ format }) => Object.keys(format.birds.layouts).length > 1);
    expect(several.length).toBeGreaterThanOrEqual(100);
  });

  it('chaque ancre déclare où son dessin tient dans sa boîte carrée', () => {
    const missing = stories.flatMap(({ id, format }) =>
      Object.entries(format.birds.layouts).flatMap(([layout, birds]) => Object.values(birds ?? {}).filter((anchor) => anchor.art === undefined).map(() => `${id}:${layout}`)),
    );
    expect(missing).toEqual([]);
  });
});

describe('le témoin rougit sur un contrat muté', () => {
  const pick = stories.find(({ format }) => format.birds.default !== 'selfie' && Object.keys(format.birds.layouts).length > 1);
  const format = pick?.format as GloryFrameFormat;
  const [x, y, w, h] = format.window.box;

  it('une ancre posée au centre de la fenêtre', () => {
    const layout = format.birds.default;
    const birds = format.birds.layouts[layout] ?? {};
    const [key, anchor] = Object.entries(birds)[0] ?? [];
    const moved = { ...anchor, box: [x + w / 2 - 120, y + h / 2 - 120, 240, 240] };
    const mutated = { ...format, birds: { ...format.birds, layouts: { ...format.birds.layouts, [layout]: { ...birds, [key as string]: moved } } } };
    expect(gloryFrameBirdFailures(mutated as GloryFrameFormat).join(' ')).toMatch(/dans la photo/);
  });

  it('un verdict hors règle, un verdict absent, un défaut selfie', () => {
    const layout = format.birds.default;
    const outOfRule = { ...format, birds: { ...format.birds, validated: { ...format.birds.validated, [layout]: { overlap: 400, depth: 9, face: 0 } } } };
    expect(gloryFrameBirdFailures(outOfRule as GloryFrameFormat).join(' ')).toMatch(/hors-regle/);
    const unvalidated = { ...format, birds: { ...format.birds, validated: {} } };
    expect(gloryFrameBirdFailures(unvalidated as GloryFrameFormat).join(' ')).toMatch(/sans verdict/);
    const selfie = { ...format, birds: { ...format.birds, default: 'selfie', layouts: { ...format.birds.layouts, selfie: format.birds.layouts[layout] } } };
    expect(gloryFrameBirdFailures(selfie as GloryFrameFormat).join(' ')).toMatch(/défaut/);
  });
});

describe('le schéma reste lisible par les clients d’avant les mises en page', () => {
  const contract = JSON.parse(readFileSync(join(__dirname, '../design/glory-frames/neon.json'), 'utf8')) as { readonly frames: readonly { readonly formats: { readonly story: unknown } }[] };
  const story = contract.frames[0]?.formats.story as GloryFrameFormat;

  it('un format sans `validated` ni `art` (contrat d’avant #10277) se lit encore', () => {
    const { validated, ...birds } = story.birds;
    const bare = Object.fromEntries(Object.entries(birds.layouts).map(([layout, set]) => [layout, Object.fromEntries(Object.entries(set ?? {}).map(([key, { art, ...anchor }]) => [key, anchor]))]));
    expect(GloryFrameFormatSchema.safeParse({ ...story, birds: { default: birds.default, layouts: bare } }).success).toBe(true);
  });

  it('`validated` et `art` voyagent dans le contrat lu', () => {
    const parsed = GloryFrameFormatSchema.parse(story);
    expect(parsed.birds.validated?.[parsed.birds.default]).toBeDefined();
    expect(Object.values(parsed.birds.layouts[parsed.birds.default] ?? {})[0]?.art).toHaveLength(4);
  });
});
