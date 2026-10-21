import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FRAME_USAGE_LABEL_KEYS, FrameUseContextSchema, canUseFrame, describeFrameUsage, parseFrameUsage } from '../frame-usage';

type Vectors = {
  readonly cases: readonly { readonly name: string; readonly usage: unknown; readonly context: unknown; readonly expected: boolean }[];
  readonly labels: readonly { readonly usage: unknown; readonly key: string; readonly params: Record<string, string> }[];
  readonly invalidUsages: readonly unknown[];
};

const vectors = JSON.parse(readFileSync(resolve(__dirname, '../../design/packs/frame-usage-avatar-vectors.json'), 'utf8')) as Vectors;

describe('la surface avatar de la loi d’usage des cadres (#10632)', () => {
  it.each(vectors.cases.map((v) => [v.name, v] as const))('%s', (_name, v) => {
    const usage = parseFrameUsage(v.usage);
    expect(usage).not.toBeNull();
    expect(canUseFrame(usage!, FrameUseContextSchema.parse(v.context))).toBe(v.expected);
  });

  it.each(vectors.labels.map((v) => [v.key, v] as const))('libellé %s', (_key, v) => {
    expect(describeFrameUsage(parseFrameUsage(v.usage)!)).toEqual({ key: v.key, params: v.params });
    expect(v.key).toBe(FRAME_USAGE_LABEL_KEYS.avatarOnly);
  });

  it.each(vectors.invalidUsages.map((v) => [JSON.stringify(v), v] as const))('usage illisible %s ⇒ null', (_label, v) => {
    expect(parseFrameUsage(v)).toBeNull();
  });

  it('« Contour de profil » ne qualifie que l’usage avatar seul', () => {
    expect(describeFrameUsage({ kind: 'free', surfaces: ['photo', 'video'] }).key).toBe(FRAME_USAGE_LABEL_KEYS.captureOnly);
    expect(describeFrameUsage({ kind: 'prestige' }).key).toBe(FRAME_USAGE_LABEL_KEYS.prestigeOnly);
    expect(describeFrameUsage({ kind: 'free', surfaces: ['avatar'] }).key).toBe(FRAME_USAGE_LABEL_KEYS.avatarOnly);
  });

  it('un contexte avatar se lit', () => {
    expect(FrameUseContextSchema.safeParse({ kind: 'avatar' }).success).toBe(true);
  });
});
