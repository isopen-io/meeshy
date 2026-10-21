import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GLORY_FRAME_PACK_SCHEMA,
  parseGloryFramePackContract,
  parsePackStrings,
  type GloryFramePackContract,
} from '../glory-frame-pack';
import { parsePackIndex } from '../content-pack-index';
import { PACK_LANGUAGES } from '../content-pack';
import { describeFrameUsage } from '../frame-usage';

const sha = (prefix: string): string => prefix.padEnd(64, '0');
const thumb = (prefix: string) => ({ src: `${prefix}.webp`, bytes: 18_000, sha256: sha(prefix) });

const frame = (over: Record<string, unknown> = {}) => ({
  id: 'exemple-savane.ambassadeur-4',
  usage: { kind: 'rank', rank: 'ambassadeur', division: 4 },
  thumb: thumb('a1b2c3d4e5f60718'),
  i18n: { name: 'frame.exemple-savane.ambassadeur-4.name' },
  ...over,
});

const contract = (frames: readonly unknown[]): unknown => ({ schema: 1, frames });

const read = (input: unknown): GloryFramePackContract => {
  const parsed = parseGloryFramePackContract(input);
  if (parsed === null) throw new Error('contrat illisible');
  return parsed.contract;
};

describe('le contrat minimal d’un pack de cadres de gloire — fail-closed par cadre', () => {
  it('lit un contrat de version 1 et rend ses cadres tels quels', () => {
    const parsed = parseGloryFramePackContract(contract([frame()]));
    expect(parsed).toEqual({ contract: { schema: 1, frames: [frame()] }, rejected: 0 });
    expect(GLORY_FRAME_PACK_SCHEMA).toBe(1);
  });

  it('un cadre LIBRE ne vit jamais dans un pack de gloire : il tombe seul, les autres restent', () => {
    const free = frame({ id: 'exemple-savane.libre', usage: { kind: 'free', surfaces: ['call'] } });
    const parsed = parseGloryFramePackContract(contract([free, frame()]));
    expect(parsed?.contract.frames.map((f) => f.id)).toEqual(['exemple-savane.ambassadeur-4']);
    expect(parsed?.rejected).toBe(1);
  });

  it('un cadre sans usage lisible, sans vignette adressée par contenu ou sans clé de nom tombe seul', () => {
    const broken = [
      frame({ usage: undefined }),
      frame({ usage: { kind: 'rank', rank: 'mythe', division: 2 } }),
      frame({ thumb: { src: '../secret.webp', bytes: 1, sha256: sha('a1') } }),
      frame({ thumb: { src: 'b1b2c3d4e5f60718.webp', bytes: 1, sha256: sha('c1b2c3d4e5f60718') } }),
      frame({ i18n: {} }),
      frame({ id: 'Majuscules Interdites' }),
      'pas un objet',
    ];
    const parsed = parseGloryFramePackContract(contract([...broken, frame()]));
    expect(parsed?.contract.frames).toHaveLength(1);
    expect(parsed?.rejected).toBe(broken.length);
  });

  it('un identifiant repris tombe : le premier gagne', () => {
    const twin = frame({ usage: { kind: 'prestige' } });
    const parsed = parseGloryFramePackContract(contract([frame(), twin]));
    expect(parsed?.contract.frames.map((f) => f.usage.kind)).toEqual(['rank']);
    expect(parsed?.rejected).toBe(1);
  });

  it('grandit vers le § 5.2 sans rupture : les champs à venir sont ignorés, pas refusés', () => {
    const later = { ...frame(), family: 'rank', option: 'IV', formats: { story: { size: [1080, 1920] } }, i18n: { name: 'k.name', story: 'k.story' } };
    const read1 = read({ schema: 1, collection: 'savane', atmosphere: 'afrique', frames: [later] });
    expect(read1.frames[0]).toEqual({ ...frame(), i18n: { name: 'k.name', story: 'k.story' } });
  });

  it('une version de contrat inconnue ou une forme illisible ne se lit pas du tout', () => {
    expect(parseGloryFramePackContract({ schema: 2, frames: [frame()] })).toBeNull();
    expect(parseGloryFramePackContract({ frames: [frame()] })).toBeNull();
    expect(parseGloryFramePackContract({ schema: 1 })).toBeNull();
    expect(parseGloryFramePackContract(null)).toBeNull();
    expect(parseGloryFramePackContract([frame()])).toBeNull();
  });

  it('chaque cadre lu sait dire où il est utilisable', () => {
    const [only] = read(contract([frame()])).frames;
    expect(describeFrameUsage(only.usage)).toEqual({ key: 'frame.usage.rankDivisionOnly', params: { rank: 'ambassadeur', division: 'IV' } });
  });
});

describe('les chaînes d’un pack, par langue', () => {
  it('garde les seules paires clé → texte non vide', () => {
    expect(parsePackStrings({ 'a.name': 'Les Takienta', 'b.name': '', 'c.name': 3, 'd.name': '  ' })).toEqual({ 'a.name': 'Les Takienta' });
  });

  it('une forme illisible rend une table vide', () => {
    expect(parsePackStrings(null)).toEqual({});
    expect(parsePackStrings(['a'])).toEqual({});
    expect(parsePackStrings('texte')).toEqual({});
  });
});

describe('le pack d’EXEMPLE du staging se lit entier', () => {
  const design = resolve(__dirname, '../../design/packs/samples');
  const assets = resolve(__dirname, '../../../../services/gateway/assets/packs');
  const registry = JSON.parse(readFileSync(resolve(design, 'glory-frame.json'), 'utf8')) as unknown;
  const { entries, rejected } = parsePackIndex(registry);

  it('une entrée glory-frame officielle, installable, retirable, non installée par défaut, nommée dans les sept langues', () => {
    expect(rejected).toBe(0);
    expect(entries).toHaveLength(1);
    const [sample] = entries;
    expect(sample).toMatchObject({ slug: 'exemple-savane', domain: 'glory-frame', origin: 'official', installedByDefault: false, removable: true, hidden: false });
    expect(Object.keys(sample.names).sort()).toEqual([...PACK_LANGUAGES].sort());
    expect(Object.keys(sample.strings).sort()).toEqual([...PACK_LANGUAGES].sort());
  });

  it('son contrat porte quatre cadres d’Ambassadeur IV à I, chacun nommé dans les sept langues', () => {
    const [sample] = entries;
    const parsed = parseGloryFramePackContract(JSON.parse(readFileSync(resolve(assets, sample.contract.src), 'utf8')) as unknown);
    expect(parsed?.rejected).toBe(0);
    const frames = parsed?.contract.frames ?? [];
    expect(frames.map((f) => f.usage)).toEqual([4, 3, 2, 1].map((division) => ({ kind: 'rank', rank: 'ambassadeur', division })));
    for (const language of PACK_LANGUAGES) {
      const ref = sample.strings[language];
      const strings = parsePackStrings(JSON.parse(readFileSync(resolve(assets, ref?.src ?? 'absent'), 'utf8')) as unknown);
      expect(frames.every((f) => strings[f.i18n.name] !== undefined)).toBe(true);
    }
  });
});
