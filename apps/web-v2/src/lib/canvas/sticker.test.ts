import { describe, expect, test } from 'bun:test';

import { DEFAULT_STICKER_BASE_SIZE, STICKER_IMAGE_FALLBACK_EMOJI, stickerGlyph, stickerWidthFraction } from './sticker';

// T-D10 — miroir CanvasV3Migration.stickerObject, le repli du composer.
describe('stickerGlyph — le repli du composer (T-D10)', () => {
  test('emoji ⇒ lui-même', () => {
    expect(stickerGlyph({ emoji: '🔥' })).toBe('🔥');
  });

  test("templateId sans emoji ⇒ '🖼️' (repli générique, on NE porte PAS le catalogue de gabarits)", () => {
    expect(stickerGlyph({ templateId: 'confetti' })).toBe(STICKER_IMAGE_FALLBACK_EMOJI);
  });

  test('postMediaId sans emoji ⇒ repli générique', () => {
    expect(stickerGlyph({ postMediaId: 'm1' })).toBe(STICKER_IMAGE_FALLBACK_EMOJI);
  });

  test('rien ⇒ null (rejeté)', () => {
    expect(stickerGlyph({})).toBeNull();
  });
});

describe('stickerWidthFraction (T-D10)', () => {
  test('stickerWidthFraction(baseSize 140, scale 1) = 140/1080', () => {
    expect(stickerWidthFraction(140, 1)).toBeCloseTo(140 / 1080, 9);
  });

  test('baseSize absent ⇒ 140 (DEFAULT_STICKER_BASE_SIZE)', () => {
    expect(stickerWidthFraction(undefined, 1)).toBeCloseTo(DEFAULT_STICKER_BASE_SIZE / 1080, 9);
  });
});
