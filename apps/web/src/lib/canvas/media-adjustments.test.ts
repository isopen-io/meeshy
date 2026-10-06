import { describe, expect, test } from 'bun:test';

import { mediaAdjustmentsPaint } from './media-adjustments';

/**
 * LES RÉGLAGES D'UN MÉDIA POSÉ, PEINTS PAR LE WEB (#9497) — `payload.adjustments`
 * (iOS, #9175 / #9169) approché en filtres CSS et en calques superposés.
 */
const image = (adjustments: unknown, designPixelsPerSourcePixel?: number) =>
  mediaAdjustmentsPaint({ adjustments }, { target: 'image', ...(designPixelsPerSourcePixel !== undefined ? { designPixelsPerSourcePixel } : {}) });
const video = (adjustments: unknown) => mediaAdjustmentsPaint({ adjustments }, { target: 'video' });

const NOTHING = { filter: undefined, overlays: [] };

describe('mediaAdjustmentsPaint — ce qui ne peint rien', () => {
  const cases: readonly (readonly [string, unknown])[] = [
    ['aucune charge', undefined],
    ['un objet vide', {}],
    ['des valeurs neutres', { exposure: 0, brightness: 0, contrast: 1, saturation: 1, vibrance: 0, temperature: 0, sharpness: 0, blur: 0, vignette: 0 }],
    ['une forme illisible', 'fort'],
    ['des valeurs non numériques ou inconnues', { exposure: 'x', halo: 0.4 }],
  ];
  for (const [label, adjustments] of cases) {
    test(label, () => {
      expect(image(adjustments)).toEqual(NOTHING);
    });
  }

  test('la netteté n’a pas d’équivalent CSS : elle ne peint rien', () => {
    expect(image({ sharpness: 1 })).toEqual(NOTHING);
  });
});

describe('mediaAdjustmentsPaint — chaque réglage', () => {
  const cases: readonly (readonly [string, Record<string, number>, string])[] = [
    ['exposition +2 EV : ×2^(EV/2,2) en espace sRGB', { exposure: 2 }, 'brightness(1.8779)'],
    ['exposition −1 EV', { exposure: -1 }, 'brightness(0.7297)'],
    ['luminosité +0,2 : égale au gris moyen (0,5 + b) / 0,5', { brightness: 0.2 }, 'brightness(1.4)'],
    ['luminosité −0,4', { brightness: -0.4 }, 'brightness(0.2)'],
    ['contraste : même formule que CIColorControls', { contrast: 1.3 }, 'contrast(1.3)'],
    ['saturation à 0 : le gris', { saturation: 0 }, 'saturate(0)'],
    ['vibrance +1 : une saturation à demi-force', { vibrance: 1 }, 'saturate(1.5)'],
    ['vibrance −1', { vibrance: -1 }, 'saturate(0.5)'],
    ['flou 0,5 : 8 px de la source sur le repère 1080', { blur: 0.5 }, 'blur(0.7407cqw)'],
  ];
  for (const [label, adjustments, filter] of cases) {
    test(label, () => {
      expect(image(adjustments)).toEqual({ filter, overlays: [] });
    });
  }

  test('le flou suit l’échelle de la source : une source deux fois plus large floute deux fois moins', () => {
    expect(image({ blur: 0.5 }, 0.5).filter).toBe('blur(0.3704cqw)');
  });

  test('la température chaude pose une teinte orangée en lumière douce', () => {
    expect(image({ temperature: 1 })).toEqual({
      filter: undefined,
      overlays: [{ background: 'rgba(255, 138, 0, 0.5)', mixBlendMode: 'soft-light' }],
    });
  });

  test('la température froide pose une teinte bleutée, proportionnelle', () => {
    expect(image({ temperature: -0.5 }).overlays).toEqual([{ background: 'rgba(0, 122, 255, 0.25)', mixBlendMode: 'soft-light' }]);
  });

  test('la vignette assombrit les bords par un dégradé radial, opaque à son maximum', () => {
    expect(image({ vignette: 1 }).overlays).toEqual([
      { background: 'radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 45%, rgba(0, 0, 0, 0.5) 100%)' },
    ]);
    expect(image({ vignette: 2 }).overlays[0]?.background).toContain('rgba(0, 0, 0, 1) 100%');
  });
});

describe('mediaAdjustmentsPaint — bornes, ordre et vidéo', () => {
  test('une valeur hors bornes est peinte à la borne de son curseur', () => {
    expect(image({ exposure: 9, blur: 400 })).toEqual(image({ exposure: 2, blur: 1 }));
  });

  test('les filtres suivent l’ordre de la chaîne CoreImage', () => {
    expect(image({ blur: 1, vibrance: 1, saturation: 0.5, contrast: 1.2, brightness: 0.1, exposure: 1 }).filter).toBe(
      'brightness(1.3704) brightness(1.2) contrast(1.2) saturate(0.5) saturate(1.5) blur(1.4815cqw)',
    );
  });

  test('la teinte se pose sous la vignette', () => {
    expect(image({ vignette: 1, temperature: 1 }).overlays.map((o) => o.mixBlendMode ?? 'normal')).toEqual(['soft-light', 'normal']);
  });

  test('une vidéo ne reçoit ni netteté ni flou, mais tout le reste', () => {
    expect(video({ blur: 1, sharpness: 1 })).toEqual(NOTHING);
    expect(video({ blur: 1, saturation: 0, vignette: 1 })).toEqual({
      filter: 'saturate(0)',
      overlays: [{ background: 'radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 45%, rgba(0, 0, 0, 0.5) 100%)' }],
    });
  });
});

/**
 * LES EFFETS D'UNE IMAGE (#9498, D-176) — le bloom et le grain, ce que l'outil
 * « Effets » de l'ancien éditeur offrait de plus que les réglages. Le bloom est
 * un HALO (un filtre SVG que le média référence), le grain un calque de bruit.
 */
describe('mediaAdjustmentsPaint — les effets', () => {
  test('le bloom ne touche pas la chaîne CSS : il dit son intensité, que le média peint en halo', () => {
    expect(image({ bloom: 0.5 })).toEqual({ filter: undefined, overlays: [], glow: 0.5 });
  });

  test('le grain pose un calque de bruit noir, d’opacité 0,1 × la valeur, au-dessus de la vignette', () => {
    const { overlays } = image({ grain: 0.5, vignette: 1 });
    expect(overlays.length).toBe(2);
    expect(overlays[0]?.background).toContain('radial-gradient');
    const svg = decodeURIComponent(overlays[1]?.background ?? '');
    expect(svg).toContain('feTurbulence');
    expect(svg).toContain('0.05 0 0 0 0');
    expect(overlays[1]?.mixBlendMode).toBeUndefined();
  });

  test('un effet hors bornes est peint à la borne de son curseur', () => {
    expect(image({ bloom: 7 })).toEqual(image({ bloom: 1 }));
    expect(image({ grain: 7 })).toEqual(image({ grain: 1 }));
  });

  test('une vidéo ne reçoit ni bloom ni grain', () => {
    expect(video({ bloom: 1, grain: 1 })).toEqual(NOTHING);
  });
});
