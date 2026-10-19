import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FRAME_USAGE_LABEL_KEYS, FrameUseContextSchema, canUseFrame, describeFrameUsage, parseFrameUsage } from '../frame-usage';

type Vectors = {
  readonly cases: readonly { readonly name: string; readonly usage: unknown; readonly context: unknown; readonly expected: boolean }[];
  readonly labels: readonly { readonly usage: unknown; readonly key: string; readonly params: Record<string, string> }[];
  readonly invalidUsages: readonly unknown[];
};

const vectors = JSON.parse(readFileSync(resolve(__dirname, '../../design/packs/frame-usage-banner-vectors.json'), 'utf8')) as Vectors;

describe('la surface bannière de la loi d’usage des cadres (#10932)', () => {
  it.each(vectors.cases.map((v) => [v.name, v] as const))('%s', (_name, v) => {
    const usage = parseFrameUsage(v.usage);
    expect(usage).not.toBeNull();
    expect(canUseFrame(usage!, FrameUseContextSchema.parse(v.context))).toBe(v.expected);
  });

  it.each(vectors.labels.map((v) => [v.key, v] as const))('libellé %s', (_key, v) => {
    expect(describeFrameUsage(parseFrameUsage(v.usage)!)).toEqual({ key: v.key, params: v.params });
    expect(v.key).toBe(FRAME_USAGE_LABEL_KEYS.bannerFrameOnly);
  });

  it.each(vectors.invalidUsages.map((v) => [JSON.stringify(v), v] as const))('usage illisible %s ⇒ null', (_label, v) => {
    expect(parseFrameUsage(v)).toBeNull();
  });

  it('« Cadre de bannière » ne qualifie que l’usage bannière seul, et le contour garde le sien', () => {
    expect(describeFrameUsage({ kind: 'free', surfaces: ['banner'] }).key).toBe(FRAME_USAGE_LABEL_KEYS.bannerFrameOnly);
    expect(describeFrameUsage({ kind: 'free', surfaces: ['avatar'] }).key).toBe(FRAME_USAGE_LABEL_KEYS.avatarOnly);
    expect(describeFrameUsage({ kind: 'free', surfaces: ['photo', 'video'] }).key).toBe(FRAME_USAGE_LABEL_KEYS.captureOnly);
  });

  it('un contexte bannière se lit', () => {
    expect(FrameUseContextSchema.safeParse({ kind: 'banner' }).success).toBe(true);
  });
});
