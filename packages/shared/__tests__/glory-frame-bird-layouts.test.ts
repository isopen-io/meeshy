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
import { GloryFrameFormatSchema, type GloryFrameFormat } from '../types/glory-frame-format';
import { readGloryFrameSources } from '../scripts/generate-glory-frames';
import { GLORY_FRAME_OVERLAP_RULE, gloryFrameBirdFailures, gloryFrameLayoutVerdict, rasterizeGloryWindowPath } from '../utils/glory-frame-birds';

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
