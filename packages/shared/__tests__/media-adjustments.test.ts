import { describe, it, expect } from 'vitest';
import {
  MEDIA_ADJUSTMENT_KINDS,
  MEDIA_ADJUSTMENT_NEUTRAL,
  MEDIA_ADJUSTMENT_RANGES,
  isAdjustmentServed,
  readMediaAdjustments,
} from '../utils/media-adjustments';

/**
 * Les réglages d'un média de scène (#9175 image, #9169 vidéo, #9497 lecture
 * web) — miroir de `ImageAdjustments` / `AdjustmentKind`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/Story/ImageAdjustments.swift`).
 */
describe('le vocabulaire des réglages', () => {
  it('les neuf réglages, dans l’ordre de `AdjustmentKind.allCases`', () => {
    expect(MEDIA_ADJUSTMENT_KINDS).toEqual([
      'exposure', 'brightness', 'contrast', 'saturation', 'vibrance', 'temperature', 'sharpness', 'blur', 'vignette',
    ]);
  });

  it('les bornes et le neutre de chaque curseur sont ceux d’iOS', () => {
    expect(MEDIA_ADJUSTMENT_RANGES).toEqual({
      exposure: { min: -2, max: 2 },
      brightness: { min: -0.4, max: 0.4 },
      contrast: { min: 0.5, max: 1.5 },
      saturation: { min: 0, max: 2 },
      vibrance: { min: -1, max: 1 },
      temperature: { min: -1, max: 1 },
      sharpness: { min: 0, max: 1 },
      blur: { min: 0, max: 1 },
      vignette: { min: 0, max: 2 },
    });
    expect(MEDIA_ADJUSTMENT_NEUTRAL.contrast).toBe(1);
    expect(MEDIA_ADJUSTMENT_NEUTRAL.saturation).toBe(1);
    expect(MEDIA_ADJUSTMENT_NEUTRAL.exposure).toBe(0);
  });

  it('une vidéo ne reçoit ni netteté ni flou ; une image reçoit tout', () => {
    expect(MEDIA_ADJUSTMENT_KINDS.filter((k) => isAdjustmentServed(k, 'video'))).toEqual([
      'exposure', 'brightness', 'contrast', 'saturation', 'vibrance', 'temperature', 'vignette',
    ]);
    expect(MEDIA_ADJUSTMENT_KINDS.every((k) => isAdjustmentServed(k, 'image'))).toBe(true);
  });
});

describe('readMediaAdjustments — la lecture tolérante de `payload.adjustments`', () => {
  it('sans réglages, ou avec une forme qui n’est pas un objet : rien', () => {
    expect(readMediaAdjustments({}, 'image')).toBeNull();
    expect(readMediaAdjustments({ adjustments: null }, 'image')).toBeNull();
    expect(readMediaAdjustments({ adjustments: 'fort' }, 'image')).toBeNull();
    expect(readMediaAdjustments({ adjustments: [0.5] }, 'image')).toBeNull();
  });

  it('les valeurs actives sont lues telles quelles', () => {
    expect(readMediaAdjustments({ adjustments: { exposure: 0.5, contrast: 1.2 } }, 'image')).toEqual({ exposure: 0.5, contrast: 1.2 });
  });

  it('une valeur neutre, non numérique, non finie ou inconnue ne compte pas', () => {
    expect(
      readMediaAdjustments({ adjustments: { contrast: 1, saturation: 'x', exposure: Number.NaN, blur: Infinity, grain: 0.3 } }, 'image'),
    ).toBeNull();
  });

  it('une valeur hors bornes est ramenée à la borne de son curseur', () => {
    expect(readMediaAdjustments({ adjustments: { blur: 400, exposure: -9, vignette: 10 } }, 'image')).toEqual({ blur: 1, exposure: -2, vignette: 2 });
  });

  it('une vidéo perd la netteté et le flou que sa charge porterait', () => {
    expect(readMediaAdjustments({ adjustments: { blur: 0.5, sharpness: 0.5, saturation: 0 } }, 'video')).toEqual({ saturation: 0 });
    expect(readMediaAdjustments({ adjustments: { blur: 0.5 } }, 'video')).toBeNull();
  });
});
