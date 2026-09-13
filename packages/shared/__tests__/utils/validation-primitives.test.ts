import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { utf16Bounded } from '../../utils/validation-primitives.js';

// `utf16Bounded` exists because zod's own `.min()`/`.max()` semantics are NOT
// stable across versions: zod ≤4.4 counts UTF-16 code units (`String.length`),
// zod ≥4.5 counts Unicode code points (#6235). Every case below is chosen to
// distinguish the two countings — a BMP-only fixture cannot, since both
// countings agree there.
describe('utf16Bounded', () => {
  it('accepts a string within both bounds', () => {
    const schema = utf16Bounded(z.string(), { min: 1, max: 5 });
    expect(schema.safeParse('abc').success).toBe(true);
  });

  it('rejects a string under the min (BMP)', () => {
    const schema = utf16Bounded(z.string(), { min: 3 });
    expect(schema.safeParse('ab').success).toBe(false);
  });

  it('rejects a string over the max (BMP)', () => {
    const schema = utf16Bounded(z.string(), { max: 3 });
    expect(schema.safeParse('abcd').success).toBe(false);
  });

  it('accepts exactly at the max boundary', () => {
    const schema = utf16Bounded(z.string(), { max: 3 });
    expect(schema.safeParse('abc').success).toBe(true);
  });

  it('rejects astral input whose UTF-16 length exceeds max, even though its code-point count does not', () => {
    // 20 astral emoji = 40 UTF-16 units, 20 code points. A count-by-code-point
    // reading of `.max(32)` would wrongly accept this — it is the exact
    // regression #6235 documents against a bare `z.string().max(32)` on zod
    // 4.5+.
    const schema = utf16Bounded(z.string(), { max: 32 });
    const astral = '😀'.repeat(20);
    expect(astral.length).toBe(40);
    expect([...astral].length).toBe(20);
    expect(schema.safeParse(astral).success).toBe(false);
  });

  it('accepts astral input whose UTF-16 length is within max', () => {
    const schema = utf16Bounded(z.string(), { max: 32 });
    const astral = '😀'.repeat(16); // 32 UTF-16 units, 16 code points
    expect(astral.length).toBe(32);
    expect(schema.safeParse(astral).success).toBe(true);
  });

  it('rejects astral input under min counted in UTF-16 units', () => {
    // 3 astral emoji = 6 UTF-16 units. A count-by-code-point reading of
    // `.min(4)` would wrongly accept 3 code points as "at least 4".
    const schema = utf16Bounded(z.string(), { min: 4 });
    const astral = '😀'.repeat(3);
    expect(astral.length).toBe(6);
    expect([...astral].length).toBe(3);
    expect(schema.safeParse(astral).success).toBe(true); // 6 units >= 4
  });

  it('composes with .trim() applied first', () => {
    const schema = utf16Bounded(z.string().trim(), { min: 1, max: 3 });
    expect(schema.safeParse('  a  ').success).toBe(true);
    expect(schema.safeParse('    ').success).toBe(false);
  });

  it('composes with .optional()', () => {
    const schema = utf16Bounded(z.string(), { max: 3 }).optional();
    expect(schema.safeParse(undefined).success).toBe(true);
    expect(schema.safeParse('abcd').success).toBe(false);
  });

  it('composes with .default()', () => {
    const schema = utf16Bounded(z.string(), { max: 3 }).default('x');
    expect(schema.parse(undefined)).toBe('x');
    expect(schema.safeParse('abcd').success).toBe(false);
  });

  it('applies no bound when neither min nor max is given', () => {
    const schema = utf16Bounded(z.string(), {});
    expect(schema.safeParse('').success).toBe(true);
  });
});
