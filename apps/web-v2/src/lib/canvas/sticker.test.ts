import { describe, expect, test } from 'bun:test';

import { DEFAULT_STICKER_BASE_SIZE, STICKER_IMAGE_FALLBACK_EMOJI, STICKER_MIN_PX, stickerGlyph, stickerWidthFraction } from './sticker';

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

  /* T-D10b (revue-correction #6901) — `CanvasGeometry.stickerFontSize`
     (`CanvasGeometry.swift:106-112`) borne AUSSI ses deux entrées : `designSide
     = max(0, baseSize) × max(0, scale)`. Sans ces bornes, un `scale` négatif —
     que `parseTransform` accepte, il ne valide pas les signes — rendait une
     fraction NÉGATIVE, donc une déclaration `font-size` invalide que le
     navigateur JETTE : le sticker héritait alors de la taille du document, à
     des lieues de l'espace design. */
  test('baseSize ou scale négatif ⇒ 0, jamais une fraction négative', () => {
    expect(stickerWidthFraction(140, -1)).toBe(0);
    expect(stickerWidthFraction(-140, 1)).toBe(0);
  });
});

/* T-D10c (revue-correction #6901) — LE PLANCHER DE 8 PX EXISTE. Le
   doc-comment du module disait « le CSS le pose (`max(8px, Ncqw)`) » ; aucune
   feuille ne le posait. `STICKER_MIN_PX` est la constante que la couche
   compose dans son `max()` CSS — miroir du `max(8, …)` d'iOS, dont le
   commentaire dit pourquoi : « sous cette taille le glyphe n'est plus qu'un
   artefact d'anticrénelage ». */
describe('STICKER_MIN_PX — le plancher du glyphe (T-D10c)', () => {
  test('vaut 8, la valeur du plancher iOS', () => {
    expect(STICKER_MIN_PX).toBe(8);
  });
});
