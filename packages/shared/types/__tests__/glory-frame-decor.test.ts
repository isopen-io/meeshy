import { describe, expect, it } from 'vitest';
import { PACK_LANGUAGES } from '../content-pack';
import { readGloryFrame, type GloryFrame } from '../glory-frames';
import {
  bakedGloryDecorTextsInContract,
  gloryDecorStringsOf,
  gloryDecorTextViolations,
  parseGloryDecorTextTable,
  sortGloryDecorTexts,
  type GloryDecorCatalogue,
} from '../glory-frame-decor';

const sha = (prefix: string): string => prefix.padEnd(64, '0');
const ref = (prefix: string) => ({ src: `${prefix}.webp`, bytes: 1_000, sha256: sha(prefix) });
const layer = (prefix: string, box = [0, 0, 1080, 1920]) => ({ ...ref(prefix), box });

const slot = (sample: string, over: Record<string, unknown> = {}) => ({
  x: 540,
  baseline: 300,
  anchor: 'middle',
  font: { family: 'Manrope', weight: 800, style: 'normal', size: 24, tracking: 0 },
  fill: { solid: '#E8B53CFF' },
  stroke: null,
  opacity: 1,
  effects: [],
  filter: null,
  path: null,
  bbox: [400, 280, 280, 30],
  contrast: 7.86,
  sample,
  ...over,
});

const frameOf = (text: Record<string, unknown>, id = 'celeste.mythe-b'): GloryFrame => {
  const frame = readGloryFrame({
    id,
    usage: { kind: 'rank', rank: 'mythe' },
    thumb: ref('b000000000000001'),
    i18n: { name: `game.frame.${id}.name` },
    collection: id.split('.')[0],
    appliesTo: { family: 'rank', rank: 'mythe', division: null },
    option: 'B',
    motifs: ['cosmos'],
    hidden: false,
    formats: {
      story: {
        size: [1080, 1920],
        window: { box: [198, 538, 684, 924], mask: layer('a000000000000001', [198, 538, 684, 924]), veilMaxAlpha: 0 },
        stack: ['photo', 'decor', 'text'],
        layers: { decor: layer('a000000000000002'), windowFill: layer('a000000000000003', [198, 538, 684, 924]), grade: [], front: {}, plate: {} },
        crest: null,
        text: { title: slot('Mythe'), ...text },
        birds: { default: 'pied', layouts: { pied: { pair: { sticker: 'duo-mee-trinquer', box: [80, 1300, 300, 300], rotate: 0, flip: false, opacity: 1 } } } },
        banner: null,
      },
      square: null,
    },
  });
  if (frame === null) throw new Error('cadre de témoin illisible');
  return frame;
};

const table = (frames: Record<string, unknown>) => {
  const parsed = parseGloryDecorTextTable({ frames });
  if (parsed === null) throw new Error('table de témoin illisible');
  return parsed;
};

const everywhere = (strings: Record<string, string>): GloryDecorCatalogue => Object.fromEntries(PACK_LANGUAGES.map((language) => [language, strings]));

const CELL = { sample: 'CELLULE', sort: 'translated', key: 'game.frame.decor.cell' } as const;
const SCALE = { sample: '10−5 m', sort: 'baked' } as const;
const CATALOGUE = everywhere({ 'game.frame.decor.cell': 'CELL' });

describe('le tri des textes de décor (#10256) : traduit, cuit parce que neutre, ou vivant', () => {
  it('refuse un texte de décor que la table ne range pas, en le nommant', () => {
    const frames = [frameOf({ 'decor.1': slot('CELLULE'), 'decor.2': slot('ON AIR') })];
    const sorts = table({ 'celeste.mythe-b': { 'decor.1': CELL } });
    expect(gloryDecorTextViolations({ frames: frames.map((frame) => sortGloryDecorTexts(frame, sorts)), table: sorts, catalogue: CATALOGUE })).toEqual([
      'celeste.mythe-b#decor.2 : texte de décor ni traduit ni déclaré neutre (« ON AIR »)',
    ]);
  });

  it('un texte traduit porte sa clé dans le contrat, et sa clé existe dans les sept langues', () => {
    const sorts = table({ 'celeste.mythe-b': { 'decor.1': CELL } });
    const sorted = sortGloryDecorTexts(frameOf({ 'decor.1': slot('CELLULE') }), sorts);
    expect(sorted.formats.story.text['decor.1']?.i18n).toBe('game.frame.decor.cell');
    expect(gloryDecorTextViolations({ frames: [sorted], table: sorts, catalogue: CATALOGUE })).toEqual([]);
    const { ar: _ar, ...withoutArabic } = CATALOGUE;
    expect(gloryDecorTextViolations({ frames: [sorted], table: sorts, catalogue: withoutArabic })).toEqual(['game.frame.decor.cell : clé absente en ar']);
  });

  it('un texte vivant déclare la donnée que le peintre remplit, sans clé de chaîne', () => {
    const sorts = table({ 'olympe.mythe-a': { 'decor.1': { sample: 'Nº 42', sort: 'live', data: 'mythe-number' } } });
    const sorted = sortGloryDecorTexts(frameOf({ 'decor.1': slot('Nº 42') }, 'olympe.mythe-a'), sorts);
    expect(sorted.formats.story.text['decor.1']).toMatchObject({ live: 'mythe-number' });
    expect(sorted.formats.story.text['decor.1']?.i18n).toBeUndefined();
    expect(gloryDecorTextViolations({ frames: [sorted], table: sorts, catalogue: everywhere({}) })).toEqual([]);
  });

  it('un texte neutre ne porte ni clé ni donnée ; resté dans le contrat, il attend le réexport qui le cuit, sans être refusé', () => {
    const sorts = table({ 'celeste.mythe-b': { 'decor.1': CELL, 'decor.3': SCALE } });
    const sorted = sortGloryDecorTexts(frameOf({ 'decor.1': slot('CELLULE'), 'decor.3': slot('10−5 m') }), sorts);
    expect(sorted.formats.story.text['decor.3']).not.toHaveProperty('i18n');
    expect(sorted.formats.story.text['decor.3']).not.toHaveProperty('live');
    expect(gloryDecorTextViolations({ frames: [sorted], table: sorts, catalogue: CATALOGUE })).toEqual([]);
    expect(bakedGloryDecorTextsInContract([sorted], sorts)).toEqual(['celeste.mythe-b#decor.3']);
  });

  it('cuit à l’export, un texte neutre a quitté le contrat : sa ligne de table n’est pas orpheline', () => {
    const sorts = table({ 'celeste.mythe-b': { 'decor.1': CELL, 'decor.3': SCALE } });
    const sorted = sortGloryDecorTexts(frameOf({ 'decor.1': slot('CELLULE') }), sorts);
    expect(gloryDecorTextViolations({ frames: [sorted], table: sorts, catalogue: CATALOGUE })).toEqual([]);
    expect(bakedGloryDecorTextsInContract([sorted], sorts)).toEqual([]);
  });

  it('un emplacement renuméroté ne garde pas son tri en silence : l’échantillon doit être celui de l’export', () => {
    const sorts = table({ 'celeste.mythe-b': { 'decor.1': CELL } });
    const sorted = sortGloryDecorTexts(frameOf({ 'decor.1': slot('ATOME') }), sorts);
    expect(gloryDecorTextViolations({ frames: [sorted], table: sorts, catalogue: CATALOGUE })).toEqual([
      'celeste.mythe-b#decor.1 : la table range « CELLULE », l’export porte « ATOME »',
    ]);
  });

  it('un contrat que la table n’a pas rejoué est refusé', () => {
    const sorts = table({ 'celeste.mythe-b': { 'decor.1': CELL } });
    expect(gloryDecorTextViolations({ frames: [frameOf({ 'decor.1': slot('CELLULE') })], table: sorts, catalogue: CATALOGUE })).toEqual([
      'celeste.mythe-b#decor.1 : le contrat ne porte pas le tri de la table (rejouer `bun run glory-frames:decor-texts`)',
    ]);
  });

  it('une entrée traduite ou vivante sans emplacement, et une clé que rien n’emploie, sont orphelines', () => {
    const sorts = table({ 'celeste.mythe-b': { 'decor.1': CELL, 'decor.9': { sample: 'ATOME', sort: 'translated', key: 'game.frame.decor.atom' } } });
    const sorted = sortGloryDecorTexts(frameOf({ 'decor.1': slot('CELLULE') }), sorts);
    const catalogue = everywhere({ 'game.frame.decor.cell': 'CELL', 'game.frame.decor.atom': 'ATOM', 'game.frame.decor.moon': 'MOON' });
    expect(gloryDecorTextViolations({ frames: [sorted], table: sorts, catalogue })).toEqual([
      'celeste.mythe-b#decor.9 : entrée de table sans emplacement dans le contrat',
      'game.frame.decor.moon : clé du catalogue que rien n’emploie',
    ]);
  });

  it('les chaînes d’un pack ne portent que les clés de décor que ses cadres emploient', () => {
    const sorts = table({ 'celeste.mythe-b': { 'decor.1': CELL } });
    const sorted = sortGloryDecorTexts(frameOf({ 'decor.1': slot('CELLULE') }), sorts);
    expect(gloryDecorStringsOf([sorted], { 'game.frame.decor.cell': 'CELL', 'game.frame.decor.atom': 'ATOM' })).toEqual({ 'game.frame.decor.cell': 'CELL' });
  });

  it('la table est fail-closed : un tri inconnu, une clé hors de l’espace de décor ou une donnée vivante inconnue la rendent illisible', () => {
    expect(parseGloryDecorTextTable({ frames: { 'celeste.mythe-b': { 'decor.1': { sample: 'X', sort: 'maybe' } } } })).toBeNull();
    expect(parseGloryDecorTextTable({ frames: { 'celeste.mythe-b': { 'decor.1': { sample: 'X', sort: 'translated', key: 'game.frame.celeste.name' } } } })).toBeNull();
    expect(parseGloryDecorTextTable({ frames: { 'celeste.mythe-b': { 'decor.1': { sample: 'X', sort: 'live', data: 'weather' } } } })).toBeNull();
    expect(parseGloryDecorTextTable({ frames: { 'celeste.mythe-b': { title: { sample: 'X', sort: 'baked' } } } })).toBeNull();
  });

  it('le contrat refuse un cadre dont un texte porte une clé hors de l’espace de décor', () => {
    expect(() => frameOf({ 'decor.1': slot('CELLULE', { i18n: 'game.frame.celeste.mythe-b.name' }) })).toThrow('cadre de témoin illisible');
  });
});
