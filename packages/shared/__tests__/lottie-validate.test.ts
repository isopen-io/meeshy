import { describe, expect, it } from 'vitest';
import { LOTTIE_LIMITS, validateLottie } from '../utils/lottie-validate';

const valid = () => ({ v: '5.7.0', fr: 30, ip: 0, op: 90, w: 200, h: 200, layers: [{ ty: 4, ks: {} }], assets: [] });

describe('le validateur du JSON Lottie servi (#10638)', () => {
  it('accepte une animation sobre', () => {
    expect(validateLottie(valid()).ok).toBe(true);
  });
  it.each([
    ['not-object', null],
    ['not-object', []],
    ['version', { ...valid(), v: undefined }],
    ['size', { ...valid(), w: 0 }],
    ['size', { ...valid(), h: LOTTIE_LIMITS.maxSide + 1 }],
    ['fps', { ...valid(), fr: 240 }],
    ['fps', { ...valid(), fr: 0 }],
    ['frames', { ...valid(), op: 0 }],
    ['frames', { ...valid(), op: LOTTIE_LIMITS.maxFrames + 5 }],
    ['layers', { ...valid(), layers: [] }],
    ['external-asset', { ...valid(), assets: [{ id: 'a', u: 'https://x.test/', p: 'a.png' }] }],
    ['external-asset', { ...valid(), assets: [{ id: 'a', p: 'https://x.test/a.png' }] }],
    ['expression', { ...valid(), layers: [{ ty: 4, ks: { o: { a: 0, k: 1, x: 'time*2' } } }] }],
  ])('refuse « %s »', (reason, input) => {
    expect(validateLottie(input)).toEqual({ ok: false, reason });
  });
  it('refuse au-delà du plafond d’octets', () => {
    expect(validateLottie(valid(), { bytes: LOTTIE_LIMITS.maxBytes + 1 })).toEqual({ ok: false, reason: 'bytes' });
  });
});
