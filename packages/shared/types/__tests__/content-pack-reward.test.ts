import { describe, expect, it } from 'vitest';
import { frameUsageOf, parsePackIndex } from '../content-pack-index';

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

const rankReward = { kind: 'rank', rank: 'ambassadeur' } as const;
const trophyReward = { kind: 'trophy', key: 'coupe-du-premier-pas' } as const;
const seasonReward = { kind: 'season', number: 2 } as const;

describe('un pack libre ou récompensé — la garde par pack (#11273)', () => {
  it('un contour d’avatar récompensé par un rang est accepté, et sa récompense est lue', () => {
    const { entries } = parsePackIndex([frame({ usage: undefined, reward: rankReward })]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.reward).toEqual(rankReward);
  });

  it('un cadre de bannière récompensé par un trophée est accepté', () => {
    const { entries } = parsePackIndex([frame({ domain: 'banner-frame', slug: 'bandeau-or', usage: undefined, reward: trophyReward })]);
    expect(entries.map((entry) => entry.reward)).toEqual([trophyReward]);
  });

  it('un contour d’avatar récompensé par une saison est accepté', () => {
    const { entries } = parsePackIndex([frame({ usage: undefined, reward: seasonReward })]);
    expect(entries.map((entry) => entry.reward)).toEqual([seasonReward]);
  });

  it('un pack récompensé qui déclare aussi un usage libre tombe : il est gagné ou libre, jamais les deux', () => {
    expect(parsePackIndex([frame({ reward: rankReward })]).entries).toEqual([]);
  });

  it('un pack récompensé dont une collection déclare un usage tombe', () => {
    const collections = [{ slug: 'libres', usage: { kind: 'free', surfaces: ['avatar'] } }];
    expect(parsePackIndex([frame({ usage: undefined, collections, reward: rankReward })]).entries).toEqual([]);
  });

  it('une récompense sur un cadre de capture, de gloire ou un sticker tombe', () => {
    const capture = frame({ domain: 'capture-frame', usage: undefined, reward: rankReward });
    const glory = frame({ domain: 'glory-frame', atmosphere: 'egypte', usage: undefined, reward: rankReward });
    const sticker = frame({ domain: 'sticker', usage: undefined, reward: rankReward });
    expect(parsePackIndex([capture, glory, sticker]).entries).toEqual([]);
  });

  it('un contour libre sans récompense et sans usage reste rejeté', () => {
    expect(parsePackIndex([frame({ usage: undefined })]).entries).toEqual([]);
  });

  it('une récompense de forme illisible fait tomber l’entrée seule', () => {
    const unknownRank = frame({ usage: undefined, reward: { kind: 'rank', rank: 'roi' } });
    const emptyTrophy = frame({ slug: 'trophee-vide', usage: undefined, reward: { kind: 'trophy', key: '' } });
    const seasonZero = frame({ slug: 'saison-zero', usage: undefined, reward: { kind: 'season', number: 0 } });
    expect(parsePackIndex([unknownRank, emptyTrophy, seasonZero]).entries).toEqual([]);
  });

  it('un pack récompensé ne se propose à aucune surface libre : son usage est absent', () => {
    const [reward] = parsePackIndex([frame({ usage: undefined, reward: rankReward })]).entries;
    expect(reward).toBeDefined();
    expect(frameUsageOf(reward!)).toBeNull();
  });
});
