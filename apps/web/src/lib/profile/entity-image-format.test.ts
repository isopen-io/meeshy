import { describe, expect, test } from 'bun:test';

import { entityImageAspect, entityImageRenderSize } from './entity-image-format';

/**
 * LE FORMAT D'UNE IMAGE D'IDENTITÉ (#17256, jumelle de `EntityImageFormat`
 * iOS, #17251) — l'avatar est un rond 1:1, la bannière un bandeau 3:1 ; la
 * retouche rend une image à ces proportions exactes.
 */
describe('le format d’une image d’identité', () => {
  test('l’avatar est carré, la bannière trois fois plus large que haute', () => {
    expect(entityImageAspect('avatar')).toBe(1);
    expect(entityImageAspect('banner')).toBe(3);
  });

  test('la taille rendue tient exactement ces proportions', () => {
    const avatar = entityImageRenderSize('avatar');
    const banner = entityImageRenderSize('banner');
    expect(avatar.width / avatar.height).toBe(1);
    expect(banner.width / banner.height).toBe(3);
  });

  test('la bannière rendue couvre la plus grande largeur que la recompression garde', () => {
    expect(entityImageRenderSize('banner')).toEqual({ width: 1500, height: 500 });
    expect(entityImageRenderSize('avatar')).toEqual({ width: 1080, height: 1080 });
  });
});
