import { describe, expect, it } from 'vitest';
import { isPackOwned, packChoiceKey } from '../content-pack';
import { frameUsageOf, parsePackIndex } from '../content-pack-index';
import { canUseFrame } from '../frame-usage';

const sha = (prefix: string): string => prefix.padEnd(64, '0');
const asset = (prefix: string, ext = 'webp') => ({ src: `${prefix}.${ext}`, bytes: 1200, sha256: sha(prefix) });

const frame = (over: Record<string, unknown> = {}) => ({
  slug: 'contour-or',
  domain: 'avatar-ring',
  origin: 'official',
  version: 1,
  order: 3,
  installedByDefault: false,
  removable: true,
  hidden: false,
  contractSchema: 1,
  cover: asset('a1b2c3d4e5f60718'),
  preview: null,
  contract: asset('c1b2c3d4e5f60718', 'json'),
  strings: { fr: asset('d1b2c3d4e5f60718', 'json') },
  downloadBytes: { story: 1_800_000, square: null },
  names: { fr: { name: 'Contour or', description: 'Un contour doré.' } },
  usage: { kind: 'free', surfaces: ['avatar'] },
  ...over,
});

const bannerFrame = (over: Record<string, unknown> = {}) =>
  frame({ domain: 'banner-frame', slug: 'bandeau-or', usage: { kind: 'free', surfaces: ['banner'] }, ...over });

const rankReward = { kind: 'rank', rank: 'ambassadeur' } as const;
const trophyReward = { kind: 'trophy', key: 'coupe-du-premier-pas' } as const;
const seasonReward = { kind: 'season', number: 2 } as const;

describe('un pack libre ou récompensé — la garde par pack (#11273)', () => {
  it('un contour d’avatar récompensé par un rang est accepté, et sa récompense est lue', () => {
    const { entries } = parsePackIndex([frame({ reward: rankReward })]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.reward).toEqual(rankReward);
  });

  it('un cadre de bannière récompensé par un trophée est accepté', () => {
    const { entries } = parsePackIndex([bannerFrame({ reward: trophyReward })]);
    expect(entries.map((entry) => entry.reward)).toEqual([trophyReward]);
  });

  it('un contour d’avatar récompensé par une saison est accepté', () => {
    const { entries } = parsePackIndex([frame({ reward: seasonReward })]);
    expect(entries.map((entry) => entry.reward)).toEqual([seasonReward]);
  });

  it('un pack récompensé se porte là où son domaine le dit : son usage reste la loi des cadres', () => {
    const [ring] = parsePackIndex([frame({ reward: rankReward })]).entries;
    const [banner] = parsePackIndex([bannerFrame({ reward: trophyReward })]).entries;
    const ringUsage = frameUsageOf(ring!);
    const bannerUsage = frameUsageOf(banner!);
    expect(ringUsage).not.toBeNull();
    expect(canUseFrame(ringUsage!, { kind: 'avatar' })).toBe(true);
    expect(canUseFrame(ringUsage!, { kind: 'call' })).toBe(false);
    expect(canUseFrame(bannerUsage!, { kind: 'banner' })).toBe(true);
  });

  it('un pack récompensé sans usage tombe, comme tout cadre sans usage', () => {
    expect(parsePackIndex([frame({ usage: undefined, reward: rankReward })]).entries).toEqual([]);
  });

  it('un pack récompensé garde le confinement de ses surfaces', () => {
    const leaking = frame({ usage: { kind: 'free', surfaces: ['avatar', 'call'] }, reward: rankReward });
    expect(parsePackIndex([leaking]).entries).toEqual([]);
  });

  it('un pack récompensé ne s’achète pas : une récompense avec un prix tombe', () => {
    expect(parsePackIndex([frame({ reward: rankReward, price: 40 })]).entries).toEqual([]);
  });

  it('un pack intégré ne peut pas être une récompense : il voyage dans chaque client', () => {
    expect(parsePackIndex([frame({ origin: 'builtin', installedByDefault: true, reward: rankReward })]).entries).toEqual([]);
  });

  it('une récompense sur un cadre de capture, de gloire ou un sticker tombe', () => {
    const capture = frame({ domain: 'capture-frame', usage: { kind: 'free', surfaces: ['photo'] }, reward: rankReward });
    const glory = frame({ domain: 'glory-frame', atmosphere: 'egypte', usage: undefined, reward: rankReward });
    const sticker = frame({ domain: 'sticker', usage: undefined, reward: rankReward });
    expect(parsePackIndex([capture, glory, sticker]).entries).toEqual([]);
  });

  it('un contour libre sans récompense et sans usage reste rejeté', () => {
    expect(parsePackIndex([frame({ usage: undefined })]).entries).toEqual([]);
  });

  it('une récompense de forme illisible fait tomber l’entrée seule', () => {
    const unknownRank = frame({ reward: { kind: 'rank', rank: 'roi' } });
    const emptyTrophy = frame({ slug: 'trophee-vide', reward: { kind: 'trophy', key: '' } });
    const seasonZero = frame({ slug: 'saison-zero', reward: { kind: 'season', number: 0 } });
    const kept = frame({ slug: 'contour-libre' });
    const { entries, rejected } = parsePackIndex([unknownRank, emptyTrophy, seasonZero, kept]);
    expect(entries.map((entry) => entry.slug)).toEqual(['contour-libre']);
    expect(rejected).toBe(3);
  });
});

describe('la possession d’un pack récompensé (#11273)', () => {
  const owned = new Set([packChoiceKey('avatar-ring', 'contour-or')]);

  it('un pack récompensé sans prix n’est PAS possédé par tout compte : il se gagne', () => {
    expect(isPackOwned({ domain: 'avatar-ring', slug: 'contour-or', reward: rankReward }, new Set())).toBe(false);
  });

  it('un pack récompensé est possédé dès que sa ligne de possession existe', () => {
    expect(isPackOwned({ domain: 'avatar-ring', slug: 'contour-or', reward: rankReward }, owned)).toBe(true);
  });

  it('un pack sans prix ni récompense reste possédé par tout compte', () => {
    expect(isPackOwned({ domain: 'avatar-ring', slug: 'contour-libre', reward: null }, new Set())).toBe(true);
    expect(isPackOwned({ domain: 'avatar-ring', slug: 'contour-libre' }, new Set())).toBe(true);
  });
});
