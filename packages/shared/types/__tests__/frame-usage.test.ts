import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CAPTURE_FRAME_SURFACES,
  FRAME_USAGE_LABEL_KEYS,
  FrameUseContextSchema,
  canUseFrame,
  captureFrameUsage,
  describeFrameUsage,
  parseFrameUsage,
  type CaptureFrameSurface,
  type FrameUsage,
  type FrameUseContext,
} from '../frame-usage';
import { FRAME_SURFACES } from '../../scripts/generate-call-frames-swift';

type Vectors = {
  readonly cases: readonly { readonly name: string; readonly rule: string; readonly usage: unknown; readonly context: unknown; readonly expected: boolean }[];
  readonly labels: readonly { readonly usage: unknown; readonly key: string; readonly params: Record<string, string> }[];
  readonly captureProjection: readonly { readonly surfaces: CaptureFrameSurface[] | null; readonly usage: FrameUsage }[];
  readonly invalidUsages: readonly unknown[];
  readonly invalidContexts: readonly unknown[];
};

const vectors = JSON.parse(readFileSync(resolve(__dirname, '../../design/packs/frame-usage-vectors.json'), 'utf8')) as Vectors;

const usage = (input: unknown): FrameUsage => {
  const parsed = parseFrameUsage(input);
  if (parsed === null) throw new Error(`usage illisible : ${JSON.stringify(input)}`);
  return parsed;
};
const context = (input: unknown): FrameUseContext => FrameUseContextSchema.parse(input);

const CALL: FrameUseContext = { kind: 'call' };
const PHOTO: FrameUseContext = { kind: 'capture', media: 'photo' };
const VIDEO: FrameUseContext = { kind: 'capture', media: 'video' };
const ACHIEVEMENT: FrameUseContext = { kind: 'achievement', rarity: 'epic' };

describe('la loi d’usage des cadres — directive porteur 2026-10-11', () => {
  it('un cadre d’appel vidéo sert l’appel ET la capture caméra hors appel', () => {
    const callFrame: FrameUsage = { kind: 'free', surfaces: ['call'] };
    expect([CALL, PHOTO, VIDEO].map((c) => canUseFrame(callFrame, c))).toEqual([true, true, true]);
  });

  it('un cadre de capture photo/vidéo seule ne sert JAMAIS l’appel vidéo', () => {
    const captureFrame: FrameUsage = { kind: 'free', surfaces: ['photo', 'video'] };
    expect(canUseFrame(captureFrame, CALL)).toBe(false);
    expect(canUseFrame(captureFrame, PHOTO)).toBe(true);
    expect(canUseFrame({ kind: 'free', surfaces: ['photo'] }, VIDEO)).toBe(false);
  });

  it('aucun cadre libre ne s’applique aux succès, aux rangs, au prestige ni aux moments', () => {
    const free: FrameUsage = { kind: 'free', surfaces: ['call', 'photo', 'video'] };
    const game: readonly FrameUseContext[] = [
      ACHIEVEMENT,
      { kind: 'rank', rank: 'ambassadeur', division: 4 },
      { kind: 'prestige' },
      { kind: 'moment', family: 'flame' },
    ];
    expect(game.some((c) => canUseFrame(free, c))).toBe(false);
  });

  it('un cadre de rang ne sert que le rang indiqué (et sa division quand il en déclare une)', () => {
    const amb4: FrameUsage = { kind: 'rank', rank: 'ambassadeur', division: 4 };
    expect(canUseFrame(amb4, { kind: 'rank', rank: 'ambassadeur', division: 4 })).toBe(true);
    expect(canUseFrame(amb4, { kind: 'rank', rank: 'ambassadeur', division: 3 })).toBe(false);
    expect(canUseFrame(amb4, { kind: 'rank', rank: 'orateur', division: 4 })).toBe(false);
    expect(canUseFrame({ kind: 'rank', rank: 'ambassadeur' }, { kind: 'rank', rank: 'ambassadeur', division: 1 })).toBe(true);
    expect([CALL, PHOTO, { kind: 'prestige' } as const, ACHIEVEMENT].some((c) => canUseFrame(amb4, c))).toBe(false);
  });

  it('un cadre de prestige ne sert que le prestige', () => {
    const prestige: FrameUsage = { kind: 'prestige' };
    expect(canUseFrame(prestige, { kind: 'prestige' })).toBe(true);
    expect([CALL, PHOTO, ACHIEVEMENT, { kind: 'rank', rank: 'mythe', division: null } as const].some((c) => canUseFrame(prestige, c))).toBe(false);
  });
});

describe('les vecteurs croisés (rejoués aussi par le miroir Swift)', () => {
  it.each(vectors.cases.map((v) => [v.name, v] as const))('%s', (_name, v) => {
    expect(canUseFrame(usage(v.usage), context(v.context))).toBe(v.expected);
  });

  it('chaque règle a au moins un cas positif ET un cas négatif', () => {
    const rules = new Set(vectors.cases.map((v) => v.rule));
    const covered = [...rules].filter((rule) => {
      const outcomes = new Set(vectors.cases.filter((v) => v.rule === rule).map((v) => v.expected));
      return outcomes.has(true) && outcomes.has(false);
    });
    expect(covered.sort()).toEqual([...rules].sort());
  });

  it('chaque genre d’usage et chaque genre de contexte y figurent', () => {
    expect(new Set(vectors.cases.map((v) => usage(v.usage).kind))).toEqual(new Set(['free', 'rank', 'prestige', 'achievement', 'moment']));
    expect(new Set(vectors.cases.map((v) => context(v.context).kind))).toEqual(
      new Set(['call', 'capture', 'rank', 'prestige', 'achievement', 'moment']),
    );
  });

  it.each(vectors.labels.map((v) => [v.key, v] as const))('libellé %s', (_key, v) => {
    expect(describeFrameUsage(usage(v.usage))).toEqual({ key: v.key, params: v.params });
  });

  it('les libellés des vecteurs couvrent toutes les clés exportées', () => {
    const avatarLabels = JSON.parse(readFileSync(resolve(__dirname, '../../design/packs/frame-usage-avatar-vectors.json'), 'utf8')) as Vectors;
    const bannerLabels = JSON.parse(readFileSync(resolve(__dirname, '../../design/packs/frame-usage-banner-vectors.json'), 'utf8')) as Vectors;
    expect(new Set([...vectors.labels, ...avatarLabels.labels, ...bannerLabels.labels].map((v) => v.key))).toEqual(new Set(Object.values(FRAME_USAGE_LABEL_KEYS)));
  });

  it.each(vectors.invalidUsages.map((v) => [JSON.stringify(v), v] as const))('usage illisible %s ⇒ null', (_label, v) => {
    expect(parseFrameUsage(v)).toBeNull();
  });

  it.each(vectors.invalidContexts.map((v) => [JSON.stringify(v), v] as const))('contexte illisible %s ⇒ refusé', (_label, v) => {
    expect(FrameUseContextSchema.safeParse(v).success).toBe(false);
  });
});

describe('la projection des cadres de capture d’appel', () => {
  it('suit les surfaces du générateur Swift', () => {
    expect([...CAPTURE_FRAME_SURFACES]).toEqual([...FRAME_SURFACES]);
  });

  it.each(vectors.captureProjection.map((v) => [JSON.stringify(v.surfaces), v] as const))('surfaces %s', (_label, v) => {
    expect(captureFrameUsage(v.surfaces ?? undefined)).toEqual(v.usage);
  });

  it('un cadre « live » sert l’appel, un cadre « capture » seul ne le sert pas', () => {
    expect(canUseFrame(captureFrameUsage(['live']), CALL)).toBe(true);
    expect(canUseFrame(captureFrameUsage(['capture']), CALL)).toBe(false);
    expect(canUseFrame(captureFrameUsage(undefined), PHOTO)).toBe(true);
  });
});
