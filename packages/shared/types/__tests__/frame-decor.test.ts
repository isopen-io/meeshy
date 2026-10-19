import { describe, expect, it } from 'vitest';
import { FRAME_MOTION_KINDS, FRAME_MOTION_LIMITS, FrameGradientSchema, FrameMotionListSchema, parseFrameMotions } from '../frame-decor';
import { parseAvatarRingDesign } from '../avatar-ring-design';

const motion = (over: Record<string, unknown> = {}) => ({ kind: 'rotate', targets: ['tresse'], duration: 9, ...over });

describe('les mouvements déclarés d’un cadre (#10932)', () => {
  it('cinq mouvements, skew ancré compris', () => {
    expect([...FRAME_MOTION_KINDS]).toEqual(['rotate', 'pulse', 'sweep', 'twinkle', 'skew']);
  });

  it('lit les mouvements de la planche', () => {
    const planche = [
      motion({ kind: 'rotate', targets: ['meandre'], duration: 120 }),
      motion({ kind: 'rotate', targets: ['balayage'], duration: 9, direction: 'reverse', origin: 'frame' }),
      motion({ kind: 'rotate', targets: ['frange'], duration: 4.5, amplitude: 3, direction: 'alternate', origin: 'top' }),
      motion({ kind: 'pulse', targets: ['palmettes'], duration: 3.6, amplitude: 0.1, stagger: 1.2, origin: 'self' }),
      motion({ kind: 'sweep', targets: ['reflet'], duration: 6.5 }),
      motion({ kind: 'twinkle', targets: ['rosace-a', 'rosace-b'], duration: 3.4, stagger: 0.8, delay: 0.5 }),
      motion({ kind: 'skew', targets: ['frange'], duration: 4, amplitude: 7, direction: 'alternate', origin: 'top' }),
    ];
    expect(parseFrameMotions(planche)).toEqual(planche);
  });

  it.each([
    ['une durée trop courte', motion({ duration: 0.1 })],
    ['une durée trop longue', motion({ duration: 600 })],
    ['aucune cible', motion({ targets: [] })],
    ['une cible dupliquée', motion({ targets: ['a', 'a'] })],
    ['une cible qui n’est pas un identifiant', motion({ targets: ['<script>'] })],
    ['une inclinaison de 40°', motion({ kind: 'skew', amplitude: 40 })],
    ['une pulsation qui double la taille', motion({ kind: 'pulse', amplitude: 1 })],
    ['un reflet avec une amplitude', motion({ kind: 'sweep', amplitude: 2 })],
    ['un scintillement ancré', motion({ kind: 'twinkle', origin: 'top' })],
    ['un reflet qui tourne autour du cadre', motion({ kind: 'sweep', origin: 'frame' })],
    ['un décalage de 60 s', motion({ stagger: 60 })],
    ['un sens inconnu', motion({ direction: 'spiral' })],
  ])('ignore %s', (_name, input) => {
    expect(parseFrameMotions([input])).toEqual([]);
  });

  it('un mouvement INCONNU est ignoré, les autres restent : un client ancien lit un cadre récent', () => {
    expect(parseFrameMotions([{ kind: 'morph', targets: ['a'], duration: 2 }, motion()])).toEqual([motion()]);
  });

  it('borne la liste à huit mouvements, refuse une liste démesurée', () => {
    const many = Array.from({ length: 12 }, (_, index) => motion({ targets: [`g${index}`] }));
    expect(parseFrameMotions(many)).toHaveLength(FRAME_MOTION_LIMITS.maxMotions);
    expect(FrameMotionListSchema.safeParse(Array.from({ length: 1000 }, () => motion())).success).toBe(false);
    expect(FrameMotionListSchema.safeParse('rotate').success).toBe(false);
  });
});

describe('les dégradés d’un cadre', () => {
  const gradient = (over: Record<string, unknown> = {}) => ({ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ color: 0, at: 0 }, { color: 1, at: 1, opacity: 0.4 }], ...over });

  it('lit un dégradé linéaire de deux à quatre arrêts', () => {
    expect(FrameGradientSchema.safeParse(gradient()).success).toBe(true);
  });

  it.each([
    ['un seul arrêt', gradient({ stops: [{ color: 0, at: 0 }] })],
    ['des arrêts dans le désordre', gradient({ stops: [{ color: 0, at: 0.8 }, { color: 1, at: 0.2 }] })],
    ['un arrêt hors de 0…1', gradient({ stops: [{ color: 0, at: 0 }, { color: 1, at: 1.4 }] })],
    ['un dégradé radial (pas encore dans le format)', gradient({ kind: 'radial' })],
  ])('refuse %s', (_name, input) => {
    expect(FrameGradientSchema.safeParse(input).success).toBe(false);
  });
});

describe('un contour d’avatar gagne dégradés et mouvements, sans rien perdre', () => {
  const ring = (over: Record<string, unknown> = {}) => ({
    key: 'tresse-celte',
    stroke: { style: 'solid', width: 0.08, colors: ['#C9A34A', '#2E3A46'] },
    ornament: { paths: [{ d: 'M50 6 L52 8 Z', color: 0, opacity: 1, group: 'triskele', gradient: 0 }] },
    gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ color: 0, at: 0 }, { color: 1, at: 1 }] }],
    motion: [{ kind: 'rotate', targets: ['triskele'], duration: 8, origin: 'self' }],
    ...over,
  });

  it('lit un contour animé et dégradé', () => {
    const parsed = parseAvatarRingDesign(ring());
    expect(parsed?.gradients).toHaveLength(1);
    expect(parsed?.motion).toEqual([{ kind: 'rotate', targets: ['triskele'], duration: 8, origin: 'self' }]);
    expect(parsed?.ornament?.paths[0]).toMatchObject({ group: 'triskele', gradient: 0 });
  });

  it('un contour de l’ancien format se lit toujours, sans dégradé ni mouvement', () => {
    const parsed = parseAvatarRingDesign(ring({ gradients: undefined, motion: undefined, ornament: { paths: [{ d: 'M0 0 Z', color: 1, opacity: 0.5 }] } }));
    expect(parsed).not.toBeNull();
    expect(parsed?.motion).toBeUndefined();
  });

  it('un trait qui désigne un dégradé absent, ou un arrêt qui désigne une couleur absente, est refusé', () => {
    expect(parseAvatarRingDesign(ring({ gradients: undefined }))).toBeNull();
    expect(parseAvatarRingDesign(ring({ gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ color: 0, at: 0 }, { color: 3, at: 1 }] }] }))).toBeNull();
  });

  it('un mouvement inconnu n’emporte pas le contour', () => {
    expect(parseAvatarRingDesign(ring({ motion: [{ kind: 'warp', targets: ['x'], duration: 2 }] }))?.motion).toEqual([]);
  });

  it('une palette de huit couleurs, comme un cadre de bannière : le contour rituel en porte huit (#10936)', () => {
    const colors = ['#1F4E79', '#2E1C12', '#6B4A2E', '#9C7838', '#B3261E', '#C9A15B', '#EDE6D6', '#F7F3EA'];
    const parsed = parseAvatarRingDesign(ring({ stroke: { style: 'solid', width: 0.07, colors }, ornament: { paths: [{ d: 'M0 0 Z', color: 7, opacity: 1 }] }, gradients: undefined }));
    expect(parsed?.stroke.colors).toHaveLength(8);
    expect(parseAvatarRingDesign(ring({ stroke: { style: 'solid', width: 0.07, colors: [...colors, '#000000'] } }))).toBeNull();
    expect(parseAvatarRingDesign(ring({ ornament: { paths: [{ d: 'M0 0 Z', color: 8, opacity: 1 }] } }))).toBeNull();
  });

  it('un contour de la planche peut n’avoir AUCUN trait de base (`none`) : son ornement dessine tout, rien ne déborde au bord (#10936)', () => {
    const parsed = parseAvatarRingDesign(ring({ stroke: { style: 'none', width: 0.02, colors: ['#C9A15B'] }, ornament: { paths: [{ d: 'M0 0 Z', color: 0, opacity: 1 }] }, gradients: undefined }));
    expect(parsed?.stroke.style).toBe('none');
  });

  it('la limite de 48 chemins est conservée', () => {
    const paths = Array.from({ length: 49 }, () => ({ d: 'M0 0 Z', color: 0, opacity: 1 }));
    expect(parseAvatarRingDesign(ring({ ornament: { paths } }))).toBeNull();
  });
});
