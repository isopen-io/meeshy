import { describe, expect, it } from 'vitest';
import {
  GLORY_FRAME_FAMILIES,
  gloryFrameAssets,
  parseGloryFrameCollection,
  parseGloryFrameContract,
  usageFitsAppliesTo,
  type GloryFrame,
} from '../glory-frames';
import { parseGloryFramePackContract } from '../glory-frame-pack';

const sha = (prefix: string): string => prefix.padEnd(64, '0');
const ref = (prefix: string) => ({ src: `${prefix}.webp`, bytes: 1_000, sha256: sha(prefix) });
const layer = (prefix: string, box = [0, 0, 1080, 1920]) => ({ ...ref(prefix), box });

const slot = (over: Record<string, unknown> = {}) => ({
  x: 540,
  baseline: 1698,
  anchor: 'middle',
  font: { family: 'Cinzel', weight: 700, style: 'normal', size: 80, tracking: 0 },
  fill: { solid: '#E8B53CFF' },
  stroke: null,
  opacity: 1,
  effects: [],
  filter: null,
  path: null,
  bbox: [225, 1620, 628, 108],
  contrast: 7.86,
  sample: 'Ambassadeur I',
  ...over,
});

const story = (over: Record<string, unknown> = {}) => ({
  size: [1080, 1920],
  window: { box: [198, 538, 684, 924], mask: layer('a000000000000001', [198, 538, 684, 924]), veilMaxAlpha: 0 },
  stack: ['photo', 'grade:0', 'decor', 'crest', 'plate', 'birds', 'text'],
  layers: {
    decor: layer('a000000000000002'),
    windowFill: layer('a000000000000003', [198, 538, 684, 924]),
    grade: [{ ...layer('a000000000000004', [198, 538, 684, 924]), blend: 'screen' }],
    front: {},
    plate: { message: layer('a000000000000005', [73, 1529, 934, 354]) },
  },
  crest: { box: [450, 177, 180, 283] },
  text: { title: slot(), 'decor.1': slot({ sample: 'CARNET DE BORD' }) },
  birds: {
    default: 'pied',
    layouts: {
      pied: {
        mee: { sticker: 'mee-fete', box: [14, 1378, 220, 220], rotate: -4, flip: false, opacity: 1 },
        meo: { sticker: 'meo-champagne', box: [846, 1378, 220, 220], rotate: 4, flip: true, opacity: 1 },
      },
    },
  },
  banner: { box: [0, 1720, 1080, 200] },
  ...over,
});

const frame = (over: Record<string, unknown> = {}) => ({
  id: 'savane.ambassadeur-1',
  usage: { kind: 'rank', rank: 'ambassadeur' },
  thumb: ref('b000000000000001'),
  i18n: { name: 'game.frame.savane.ambassadeur-1.name', story: 'game.frame.savane.ambassadeur-1.story' },
  collection: 'savane',
  appliesTo: { family: 'rank', rank: 'ambassadeur', division: 1 },
  option: 'I',
  motifs: ['afrique'],
  hidden: false,
  formats: { story: story(), square: null },
  ...over,
});

const frames = (input: readonly unknown[]): readonly GloryFrame[] => parseGloryFrameContract({ schema: 1, frames: input })?.contract.frames ?? [];

describe('le contrat COMPLET d’un cadre de gloire (§ 5.2) — fail-closed par cadre', () => {
  it('lit un cadre complet tel quel', () => {
    const parsed = parseGloryFrameContract({ schema: 1, frames: [frame()] });
    expect(parsed).toEqual({ contract: { schema: 1, frames: [frame()] }, rejected: 0 });
  });

  it('étend le contrat de la boutique sans le casser : le même fichier se lit par les deux lecteurs', () => {
    const input = { schema: 1, frames: [frame()] };
    expect(parseGloryFramePackContract(input)?.contract.frames.map((f) => f.id)).toEqual(['savane.ambassadeur-1']);
    expect(frames([frame()]).map((f) => f.id)).toEqual(['savane.ambassadeur-1']);
  });

  it('un cadre de la boutique sans format ni placement (le pack d’exemple) ne se peint pas : il tombe du contrat complet', () => {
    const minimal = { id: 'exemple-savane.ambassadeur-4', usage: { kind: 'rank', rank: 'ambassadeur', division: 4 }, thumb: ref('c000000000000001'), i18n: { name: 'k.name' } };
    expect(parseGloryFrameContract({ schema: 1, frames: [minimal] })).toEqual({ contract: { schema: 1, frames: [] }, rejected: 1 });
  });

  it('l’usage et la cible doivent dire la même chose : un cadre de rang ne sert que son rang', () => {
    const wrongRank = frame({ usage: { kind: 'rank', rank: 'orateur' } });
    const wrongDivision = frame({ usage: { kind: 'rank', rank: 'ambassadeur', division: 3 } });
    const wrongFamily = frame({ usage: { kind: 'moment', family: 'tier' } });
    expect(frames([wrongRank, wrongDivision, wrongFamily, frame()]).map((f) => f.id)).toEqual(['savane.ambassadeur-1']);
  });

  it('chaque famille a sa cible, et sa cible son usage', () => {
    expect([...GLORY_FRAME_FAMILIES]).toEqual(['rank', 'tier', 'meesh', 'treasury', 'flame', 'day', 'achievement']);
    expect(usageFitsAppliesTo({ kind: 'moment', family: 'tier' }, { family: 'tier', tier: 'aurore' })).toBe(true);
    expect(usageFitsAppliesTo({ kind: 'moment', family: 'flame' }, { family: 'flame', days: 30 })).toBe(true);
    expect(usageFitsAppliesTo({ kind: 'moment', family: 'meesh' }, { family: 'meesh', edition: 'gold' })).toBe(true);
    expect(usageFitsAppliesTo({ kind: 'moment', family: 'treasury' }, { family: 'treasury', treasury: 'coffre' })).toBe(true);
    expect(usageFitsAppliesTo({ kind: 'moment', family: 'day' }, { family: 'day' })).toBe(true);
    expect(usageFitsAppliesTo({ kind: 'achievement', rarity: 'rare' }, { family: 'achievement', rarity: 'rare' })).toBe(true);
    expect(usageFitsAppliesTo({ kind: 'achievement' }, { family: 'achievement', rarity: null })).toBe(true);
    expect(usageFitsAppliesTo({ kind: 'achievement' }, { family: 'achievement', rarity: 'common' })).toBe(false);
    expect(usageFitsAppliesTo({ kind: 'rank', rank: 'mythe' }, { family: 'rank', rank: 'mythe', division: null })).toBe(true);
    expect(usageFitsAppliesTo({ kind: 'prestige' }, { family: 'rank', rank: 'ambassadeur', division: 1 })).toBe(false);
  });

  it('une cible hors des clés de la loi tombe : jamais un libellé (« braise », « Palier de niveau »)', () => {
    const labels = [
      frame({ id: 'moments.flamme-7', usage: { kind: 'moment', family: 'flame' }, appliesTo: { family: 'flame', days: 8 } }),
      frame({ id: 'moments.palier-x', usage: { kind: 'moment', family: 'tier' }, appliesTo: { family: 'tier', tier: 'Palier de niveau' } }),
      frame({ appliesTo: { family: 'rank', rank: 'Ambassadeur', division: 1 } }),
      frame({ appliesTo: { family: 'rank', rank: 'mythe', division: 2 }, usage: { kind: 'rank', rank: 'mythe' } }),
    ];
    expect(frames(labels)).toEqual([]);
  });

  it('un format illisible fait tomber le cadre — jamais un cadre peint à moitié', () => {
    const broken = [
      frame({ formats: { story: story({ stack: ['photo', 'decor', 'grade:0', 'grade:0'] }), square: null } }),
      frame({ formats: { story: story({ stack: ['decor', 'text'] }), square: null } }),
      frame({ formats: { story: story({ birds: { default: 'selfie', layouts: {} } }), square: null } }),
      frame({ formats: { story: story({ text: { title: slot({ fill: { solid: '#e8b53c' } }) } }), square: null } }),
      frame({ formats: { story: story({ text: { title: slot({ font: { family: 'Comic Sans', weight: 700, style: 'normal', size: 80, tracking: 0 } }) } }), square: null } }),
      frame({
        formats: {
          story: story({
            birds: {
              default: 'pied',
              layouts: { pied: { mee: { sticker: 'mee-fete', box: [0, 0, 1, 1], rotate: 0, flip: false, opacity: 1 }, meo: { sticker: 'meo-love', box: [0, 0, 1, 1], rotate: 0, flip: false, opacity: 1 }, pair: { sticker: 'duo-coucou', box: [0, 0, 1, 1], rotate: 0, flip: false, opacity: 1 } } },
            },
          }),
          square: null,
        },
      }),
      frame({ formats: { story: story({ window: { box: [0, 0, 1, 1], mask: { src: '../x.webp', bytes: 1, sha256: sha('a'), box: [0, 0, 1, 1] }, veilMaxAlpha: 0 } }), square: null } }),
    ];
    expect(frames(broken)).toEqual([]);
  });

  it('une mise en page à DEUX oiseaux ou à UNE paire, jamais les deux', () => {
    const duo = frame({
      formats: { story: story({ birds: { default: 'duo', layouts: { duo: { pair: { sticker: 'duo-mee-trinquer', box: [80, 1300, 300, 300], rotate: -3, flip: false, opacity: 1 } } } } }), square: null },
    });
    expect(frames([duo])).toHaveLength(1);
  });

  it('dit tous les fichiers qu’un cadre demande au magasin : vignette, masque, couches, passes', () => {
    const [only] = frames([frame()]);
    if (only === undefined) throw new Error('cadre illisible');
    expect(gloryFrameAssets(only).map((asset) => asset.src).sort()).toEqual(
      ['b000000000000001', 'a000000000000001', 'a000000000000002', 'a000000000000003', 'a000000000000004', 'a000000000000005'].map((p) => `${p}.webp`).sort(),
    );
  });
});

describe('le manifeste NORMALISÉ d’une collection', () => {
  it('se lit avec sa collection et son atmosphère ; un cadre d’une autre collection tombe', () => {
    const stranger = frame({ id: 'royaumes.ambassadeur-1', collection: 'royaumes' });
    const parsed = parseGloryFrameCollection({ schema: 1, collection: 'savane', atmosphere: 'afrique', frames: [frame(), stranger] });
    expect(parsed?.collection).toEqual({ schema: 1, collection: 'savane', atmosphere: 'afrique', frames: [frame()] });
    expect(parsed?.rejected).toBe(1);
  });

  it('une collection hors atmosphère (moments, trésor) porte `atmosphere: null` ; une atmosphère inconnue ne se lit pas', () => {
    expect(parseGloryFrameCollection({ schema: 1, collection: 'moments', atmosphere: null, frames: [] })?.collection.atmosphere).toBeNull();
    expect(parseGloryFrameCollection({ schema: 1, collection: 'savane', atmosphere: 'atlantide', frames: [] })).toBeNull();
    expect(parseGloryFrameCollection({ schema: 2, collection: 'savane', atmosphere: 'afrique', frames: [] })).toBeNull();
  });
});
