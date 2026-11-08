import { describe, expect, it } from 'vitest';
import { RING_DECOR_MAX_REACH, parseAvatarRingDesign, ringDecorFit } from '../avatar-ring-design';

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

  it('sans place déclarée, le cadre tient dans la boîte de l’anneau seul : tout se réduit d’un même facteur (#15157)', () => {
    expect(ringDecorFit({ box: 100, reach: 1.4 })).toEqual({ scale: 1 / 1.4, side: 100, offset: 0 });
  });

  it('la place que l’hôte déclare libre autour de la boîte se prend, jamais plus que le film ne le demande (#15157)', () => {
    expect(ringDecorFit({ box: 100, reach: 1.4, room: 10 })).toEqual({ scale: 120 / 140, side: 120, offset: -10 });
    expect(ringDecorFit({ box: 100, reach: 1.4, room: 40 })).toEqual({ scale: 1, side: 140, offset: -20 });
    expect(ringDecorFit({ box: 48, reach: 1 })).toEqual({ scale: 1, side: 48, offset: 0 });
  });

  it('le film ne sort jamais de la boîte plus la place déclarée, à toutes les tailles (#15157)', () => {
    [18, 22, 28, 44, 62, 88, 107, 140].forEach((box) =>
      [1, 1.2, 1.4, RING_DECOR_MAX_REACH].forEach((reach) =>
        [0, 4, 12].forEach((room) => {
          const fit = ringDecorFit({ box, reach, room });
          expect(fit.side).toBeLessThanOrEqual(box + 2 * room + 1e-9);
          expect(fit.side).toBeCloseTo(box * reach * fit.scale, 9);
          expect(fit.scale).toBeLessThanOrEqual(1);
        }),
      ),
    );
  });

  it('le cadre se pose entier à toutes les tailles, liste, bulle et mini-avatar compris (#16114)', () => {
    expect(ringDecorFit({ box: 52, reach: 1.4 })).toEqual({ scale: 1 / 1.4, side: 52, offset: 0 });
    expect(ringDecorFit({ box: 32, reach: 1 })).toEqual({ scale: 1, side: 32, offset: 0 });
    expect(ringDecorFit({ box: 22, reach: RING_DECOR_MAX_REACH }).side).toBe(22);
  });
});
