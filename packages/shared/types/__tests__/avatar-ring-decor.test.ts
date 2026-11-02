import { describe, expect, it } from 'vitest';
import { RING_DECOR_MAX_REACH, parseAvatarRingDesign, ringDecorCanvas } from '../avatar-ring-design';

const ref = (src: string) => ({ src, bytes: 1200, sha256: `${src.slice(0, 16)}${'0'.repeat(48)}` });
const ring = (decor: unknown) => ({ key: 'masque-felin', stroke: { style: 'solid', width: 0.04, colors: ['#2A1840'] }, decor });

describe('les calques illustrés d’un contour (#13960)', () => {
  it('lit un calque arrière, un calque avant et le débordement', () => {
    const decor = { reach: 1.4, back: ref('aaaaaaaaaaaaaaaa.json'), front: ref('bbbbbbbbbbbbbbbb.json') };
    expect(parseAvatarRingDesign(ring(decor))?.decor).toEqual(decor);
  });

  it('un seul calque suffit, et sans débordement le film tient dans la boîte du contour', () => {
    expect(parseAvatarRingDesign(ring({ reach: 1, front: ref('bbbbbbbbbbbbbbbb.json') }))?.decor?.back).toBeUndefined();
  });

  it.each([
    ['aucun calque', { reach: 1.2 }],
    ['un débordement en deçà du contour', { reach: 0.9, front: ref('bbbbbbbbbbbbbbbb.json') }],
    ['un débordement au-delà du plafond', { reach: RING_DECOR_MAX_REACH + 0.1, front: ref('bbbbbbbbbbbbbbbb.json') }],
    ['un calque qui n’est pas une référence de pack', { reach: 1.2, front: { src: '../x.json' } }],
  ])('refuse %s', (_label, decor) => {
    expect(parseAvatarRingDesign(ring(decor))).toBeNull();
  });

  it('un contour sans calques reste lu à l’identique (rétrocompatible)', () => {
    expect(parseAvatarRingDesign(ring(undefined))?.decor).toBeUndefined();
  });

  it('un client qui ne connaît pas les calques garde l’anneau fixe : le champ inconnu ne fait pas tomber le contour', () => {
    const { decor: _ignored, ...older } = parseAvatarRingDesign(ring({ reach: 1.4, front: ref('bbbbbbbbbbbbbbbb.json') }))!;
    expect(parseAvatarRingDesign(older)?.stroke.colors).toEqual(['#2A1840']);
  });

  it('pose le film centré sur l’avatar, de côté `reach ×` la boîte du contour', () => {
    expect(ringDecorCanvas({ box: 100, reach: 1.4 })).toEqual({ side: 140, offset: -20 });
    expect(ringDecorCanvas({ box: 48, reach: 1 })).toEqual({ side: 48, offset: 0 });
  });
});
