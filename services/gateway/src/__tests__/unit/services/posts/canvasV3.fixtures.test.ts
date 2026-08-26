import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { CanvasV3Schema } from '@meeshy/shared/types/canvas-v3';
import { convertV1ToV3 } from '../../../../services/posts/storyEffectsV3';

const DIR = join(__dirname, '../../../../../../../packages/shared/fixtures/canvas-v3');

describe('canvas-v3 fixtures (le gel inter-lots)', () => {
  it('every v3 fixture parses strictly', () => {
    const files = readdirSync(DIR).filter(f => f.endsWith('.json') && !f.startsWith('v1-') && !f.endsWith('.v3.json'));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const f of files) {
      const raw = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
      const res = CanvasV3Schema.safeParse(raw);
      expect(res.success ? true : { f, issues: res.error.issues }).toBe(true);
    }
  });

  it('the v1 legacy fixture does NOT parse as v3 (it feeds the converter)', () => {
    const raw = JSON.parse(readFileSync(join(DIR, 'v1-legacy-full.json'), 'utf8'));
    expect(CanvasV3Schema.safeParse(raw).success).toBe(false);
  });
});

describe('canvas-v3 fixtures additives (rattrapage B8a)', () => {
  it('the rich v1 fixture does NOT parse as v3 either (it feeds the converter)', () => {
    const raw = JSON.parse(readFileSync(join(DIR, 'v1-legacy-rich.json'), 'utf8'));
    expect(CanvasV3Schema.safeParse(raw).success).toBe(false);
  });

  it('the additive rich golden parses strictly AND keeps its extended keys', () => {
    const raw = JSON.parse(readFileSync(join(DIR, 'v1-legacy-rich.v3.json'), 'utf8'));
    const res = CanvasV3Schema.safeParse(raw);
    expect(res.success ? true : res.error.issues).toBe(true);
    if (!res.success) return;
    expect(res.data.scenes?.[0].thumbHash).toBe('1QcSHQRnh493V4dIh4eXh0h4kJUI');
    expect(res.data.sound?.variants).toHaveLength(2);
    expect(res.data.scenes?.[0].objects.find(o => o.kind === 'drawing')?.payload.data).toBe('AQIDBA==');
  });
});

describe('convertV1ToV3 — bounds audio ne sortent jamais un intervalle corrompu', () => {
  it('preserves a complete, ordered audio trim (start <= end)', () => {
    const doc = convertV1ToV3({ backgroundAudioId: 'snd1', backgroundAudioStart: 2, backgroundAudioEnd: 17 });
    expect(doc.sound?.bounds).toEqual({ start: 2, end: 17 });
    expect(CanvasV3Schema.safeParse(doc).success).toBe(true);
  });

  it('drops bounds when only ONE edge is present (no spurious end:0)', () => {
    const doc = convertV1ToV3({ backgroundAudioId: 'snd1', backgroundAudioStart: 5 });
    expect(doc.sound?.bounds).toBeUndefined();
    expect(CanvasV3Schema.safeParse(doc).success).toBe(true);
  });

  it('drops an INVERTED audio trim (end < start) instead of emitting corruption', () => {
    const doc = convertV1ToV3({ backgroundAudioId: 'snd1', backgroundAudioStart: 17, backgroundAudioEnd: 2 });
    expect(doc.sound?.bounds).toBeUndefined();
    expect(CanvasV3Schema.safeParse(doc).success).toBe(true);
  });
});

describe('convertV1ToV3 — le timing d\'un objet ne sort jamais un intervalle corrompu', () => {
  const textObject = (startTime: unknown, endTime: unknown) =>
    convertV1ToV3({ textObjects: [{ id: 'txt', text: 'salut', startTime, endTime }] })
      .scenes[0].objects.find(o => o.kind === 'text');

  it('preserves a complete, ordered object timing (start <= end)', () => {
    const doc = convertV1ToV3({ textObjects: [{ id: 'txt', text: 'salut', startTime: 1, endTime: 4 }] });
    expect(doc.scenes[0].objects.find(o => o.kind === 'text')?.timing).toEqual({ start: 1, end: 4 });
    expect(CanvasV3Schema.safeParse(doc).success).toBe(true);
  });

  it('accepts a zero-duration object timing (end === start)', () => {
    const doc = convertV1ToV3({ textObjects: [{ id: 'txt', text: 'salut', startTime: 2, endTime: 2 }] });
    expect(doc.scenes[0].objects.find(o => o.kind === 'text')?.timing).toEqual({ start: 2, end: 2 });
    expect(CanvasV3Schema.safeParse(doc).success).toBe(true);
  });

  it('keeps a partial object timing when only ONE edge is present', () => {
    expect(textObject(5, undefined)?.timing).toEqual({ start: 5 });
    expect(textObject(undefined, 3)?.timing).toEqual({ end: 3 });
    expect(CanvasV3Schema.safeParse(
      convertV1ToV3({ textObjects: [{ id: 'txt', text: 'salut', startTime: 5 }] })
    ).success).toBe(true);
  });

  it('drops an INVERTED object timing (end < start) instead of emitting corruption', () => {
    const doc = convertV1ToV3({ textObjects: [{ id: 'txt', text: 'salut', startTime: 4, endTime: 1 }] });
    expect(doc.scenes[0].objects.find(o => o.kind === 'text')?.timing).toBeUndefined();
    expect(CanvasV3Schema.safeParse(doc).success).toBe(true);
  });
});
