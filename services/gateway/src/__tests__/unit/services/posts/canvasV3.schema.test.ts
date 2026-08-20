import { CanvasV3Schema, RESERVED_KINDS } from '@meeshy/shared/types/canvas-v3';

describe('CanvasV3Schema', () => {
  const minimal = {
    v: 3,
    scenes: [{
      id: 's1',
      objects: [{
        id: 'o1', kind: 'text',
        anchor: { t: 'free', x: 0.5, y: 0.4 },
        plane: 'fg', z: 0,
        transform: { scale: 1, rotation: 0, opacity: 1 },
        payload: { text: 'Bonjour', textStyle: 'bold' },
      }],
    }],
  };

  it('parses a minimal v3 document', () => {
    expect(CanvasV3Schema.parse(minimal).v).toBe(3);
  });

  it('rejects a v1-shaped blob (no v:3)', () => {
    expect(CanvasV3Schema.safeParse({ textObjects: [] }).success).toBe(false);
  });

  it('timing is optional — nil means "suit la slide" (O4)', () => {
    expect(CanvasV3Schema.parse(minimal).scenes[0].objects[0].timing).toBeUndefined();
  });

  it('band anchor parses', () => {
    const doc = structuredClone(minimal);
    (doc.scenes[0].objects[0] as { anchor: unknown }).anchor = { t: 'band', edge: 'top' };
    expect(CanvasV3Schema.parse(doc).scenes[0].objects[0].anchor).toEqual({ t: 'band', edge: 'top' });
  });

  it.each(RESERVED_KINDS)('refuses the RESERVED kind %s with a dedicated message', (kind) => {
    const doc = structuredClone(minimal);
    (doc.scenes[0].objects[0] as { kind: string }).kind = kind;
    const res = CanvasV3Schema.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) expect(JSON.stringify(res.error.issues)).toContain('KIND_RESERVED');
  });

  it('background sound carries its PROVENANCE (original vs library)', () => {
    const doc = structuredClone(minimal) as Record<string, unknown>;
    doc.sound = { source: { t: 'library', soundId: 'snd1' }, volume: 0.6, bounds: { start: 2, end: 17 } };
    expect(CanvasV3Schema.parse(doc).sound?.source).toEqual({ t: 'library', soundId: 'snd1' });
  });
});
