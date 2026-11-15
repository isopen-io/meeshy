import { describe, expect, test } from 'bun:test';

import {
  CAPTURE_LOCK_TRAVEL,
  captureLock,
  digitalZoomCrop,
  flashFloorColor,
  flashIntensityOf,
  flashSliderShown,
  readFlashIntensity,
  writeFlashIntensity,
  zoomAfterDrag,
  zoomRangeOf,
} from './studio-capture-gestures';

/** LE VERROU, LE ZOOM ET LE CURSEUR DU FLASH (#8672, jumelle de #8671). */
describe('captureLock — glisser jusqu’au cadenas verrouille le film', () => {
  test('immobile : rien n’est verrouillé, le cadenas est au repos', () => {
    expect(captureLock({ dx: 0, direction: 'ltr' })).toEqual({ reached: false, progress: 0 });
  });

  test('vers le cadenas (à gauche en LTR), à mi-course : il se rapproche sans verrouiller', () => {
    const half = captureLock({ dx: -CAPTURE_LOCK_TRAVEL / 2, direction: 'ltr' });
    expect(half.reached).toBe(false);
    expect(half.progress).toBeCloseTo(0.5);
  });

  test('la course entière atteint le cadenas : le film est verrouillé', () => {
    expect(captureLock({ dx: -CAPTURE_LOCK_TRAVEL, direction: 'ltr' })).toEqual({ reached: true, progress: 1 });
    expect(captureLock({ dx: -CAPTURE_LOCK_TRAVEL * 3, direction: 'ltr' })).toEqual({ reached: true, progress: 1 });
  });

  test('dans l’autre sens : jamais verrouillé', () => {
    expect(captureLock({ dx: CAPTURE_LOCK_TRAVEL * 2, direction: 'ltr' })).toEqual({ reached: false, progress: 0 });
  });

  test('RTL : le cadenas est à droite, le glisser vers la droite verrouille', () => {
    expect(captureLock({ dx: CAPTURE_LOCK_TRAVEL, direction: 'rtl' }).reached).toBe(true);
    expect(captureLock({ dx: -CAPTURE_LOCK_TRAVEL, direction: 'rtl' }).reached).toBe(false);
  });
});

describe('zoomRangeOf — le zoom matériel quand la caméra l’expose, sinon numérique', () => {
  test('capacité `zoom` exposée : zoom MATÉRIEL, borné à ses capacités', () => {
    expect(zoomRangeOf({ hardware: { min: 1, max: 8, step: 0.1 }, canvasCapture: true })).toEqual({ mode: 'hardware', min: 1, max: 8, step: 0.1 });
  });

  test('sans capacité, un canvas qui s’enregistre : zoom numérique du RENDU ENREGISTRÉ', () => {
    expect(zoomRangeOf({ hardware: null, canvasCapture: true })).toEqual({ mode: 'recorded', min: 1, max: 4, step: 0 });
  });

  test('ni l’un ni l’autre : zoom de l’APERÇU seul', () => {
    expect(zoomRangeOf({ hardware: null, canvasCapture: false })).toEqual({ mode: 'preview', min: 1, max: 4, step: 0 });
  });

  test('une capacité dégénérée (max ≤ min) ne compte pas comme zoom matériel', () => {
    expect(zoomRangeOf({ hardware: { min: 1, max: 1, step: 0.1 }, canvasCapture: true }).mode).toBe('recorded');
  });
});

describe('zoomAfterDrag — glisser vers le haut zoome, vers le bas dézoome', () => {
  const range = { mode: 'recorded', min: 1, max: 4, step: 0 } as const;

  test('immobile : le zoom ne bouge pas', () => {
    expect(zoomAfterDrag({ from: 1.5, dy: 0, range })).toBe(1.5);
  });

  test('vers le haut : il grandit, progressivement', () => {
    const little = zoomAfterDrag({ from: 1, dy: -40, range });
    const more = zoomAfterDrag({ from: 1, dy: -120, range });
    expect(little).toBeGreaterThan(1);
    expect(more).toBeGreaterThan(little);
  });

  test('vers le bas : il diminue', () => {
    expect(zoomAfterDrag({ from: 3, dy: 80, range })).toBeLessThan(3);
  });

  test('borné aux capacités de la caméra, dans les deux sens', () => {
    expect(zoomAfterDrag({ from: 1, dy: -5000, range })).toBe(4);
    expect(zoomAfterDrag({ from: 2, dy: 5000, range })).toBe(1);
  });

  test('un zoom matériel à pas se cale sur le pas', () => {
    const value = zoomAfterDrag({ from: 1, dy: -37, range: { mode: 'hardware', min: 1, max: 8, step: 0.5 } });
    expect(value * 2).toBe(Math.round(value * 2));
  });
});

describe('digitalZoomCrop — le cadre centré que le zoom numérique enregistre', () => {
  test('×1 : l’image entière', () => {
    expect(digitalZoomCrop({ width: 1080, height: 1920, zoom: 1 })).toEqual({ sx: 0, sy: 0, sw: 1080, sh: 1920 });
  });

  test('×2 : le quart central', () => {
    expect(digitalZoomCrop({ width: 1080, height: 1920, zoom: 2 })).toEqual({ sx: 270, sy: 480, sw: 540, sh: 960 });
  });

  test('un zoom sous 1 est lu comme 1', () => {
    expect(digitalZoomCrop({ width: 100, height: 100, zoom: 0.5 })).toEqual({ sx: 0, sy: 0, sw: 100, sh: 100 });
  });
});

describe('le curseur du flash — l’intensité du blanc du sol', () => {
  test('il s’allonge quand le flash est activé ET que le sol blanc éclaire', () => {
    expect(flashSliderShown({ flash: true, plan: 'screen' })).toBe(true);
  });

  test('replié quand le flash est coupé, ou quand la torche éclaire (le web ne règle pas sa puissance)', () => {
    expect(flashSliderShown({ flash: false, plan: 'off' })).toBe(false);
    expect(flashSliderShown({ flash: true, plan: 'torch' })).toBe(false);
  });

  test('l’intensité est bornée, un réglage illisible rend le blanc plein', () => {
    expect(flashIntensityOf(0.6)).toBe(0.6);
    expect(flashIntensityOf(2)).toBe(1);
    expect(flashIntensityOf(0)).toBe(0.3);
    expect(flashIntensityOf(Number.NaN)).toBe(1);
    expect(flashIntensityOf('0.5')).toBe(0.5);
    expect(flashIntensityOf(null)).toBe(1);
  });

  test('le blanc du sol suit l’intensité : plein à 1, gris lumineux plus bas', () => {
    expect(flashFloorColor(1)).toBe('rgb(255, 255, 255)');
    expect(flashFloorColor(0.3)).toBe('rgb(77, 77, 77)');
  });

  test('la valeur est mémorisée, et un stockage qui refuse ne casse rien', () => {
    const memory = new Map<string, string>();
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => void memory.set(key, value) };
    expect(readFlashIntensity(storage)).toBe(1);
    writeFlashIntensity(storage, 0.45);
    expect(readFlashIntensity(storage)).toBe(0.45);

    const refusing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(readFlashIntensity(refusing)).toBe(1);
    expect(() => writeFlashIntensity(refusing, 0.5)).not.toThrow();
    expect(readFlashIntensity(null)).toBe(1);
  });
});
