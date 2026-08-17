import {
  FOCAL_FALLOFF,
  FOCAL_OFFSET_FROM_BOTTOM,
  focalFocusLine,
  focalGeometry,
  pickFocusedRowId,
} from '../focal-geometry';

describe('focalFocusLine — où se pose la mise au point', () => {
  it('sits 150px above the bottom of the viewport', () => {
    expect(focalFocusLine(660)).toBe(660 - FOCAL_OFFSET_FROM_BOTTOM);
  });

  // Sur un très petit conteneur (clavier ouvert sur téléphone), une ligne de
  // focus négative renverrait TOUTES les rangées dans la zone lointaine et
  // ferait disparaître la conversation. On la borne au milieu du conteneur.
  it('never falls above the middle of a very short viewport', () => {
    expect(focalFocusLine(200)).toBe(100);
    expect(focalFocusLine(0)).toBe(0);
  });
});

describe('focalGeometry — la courbe du volume 4', () => {
  it('leaves a row at or below the focus line at full size', () => {
    expect(focalGeometry({ rowMidY: 510, focusY: 510 })).toEqual({
      distance: 0,
      scale: 1,
      opacity: 1,
    });
    expect(focalGeometry({ rowMidY: 600, focusY: 510 })).toEqual({
      distance: 0,
      scale: 1,
      opacity: 1,
    });
  });

  it('applies scale = 1 − 0.40·f and opacity = 1 − 0.82·f', () => {
    // d = 190 → f = 0.5
    const geometry = focalGeometry({ rowMidY: 320, focusY: 510 });

    expect(geometry.distance).toBe(190);
    expect(geometry.scale).toBeCloseTo(0.8, 5);
    expect(geometry.opacity).toBeCloseTo(0.59, 5);
  });

  it('clamps f at 1 beyond the falloff so far rows stop shrinking', () => {
    const atFalloff = focalGeometry({ rowMidY: 510 - FOCAL_FALLOFF, focusY: 510 });
    const farBeyond = focalGeometry({ rowMidY: 510 - FOCAL_FALLOFF * 4, focusY: 510 });

    expect(atFalloff.scale).toBeCloseTo(0.6, 5);
    expect(atFalloff.opacity).toBeCloseTo(0.18, 5);
    expect(farBeyond.scale).toBeCloseTo(0.6, 5);
    expect(farBeyond.opacity).toBeCloseTo(0.18, 5);
  });
});

describe('pickFocusedRowId — le message net', () => {
  const rows = [
    { id: 'm1', midY: 120 },
    { id: 'm2', midY: 380 },
    { id: 'm3', midY: 505 },
    { id: 'm4', midY: 640 },
  ];

  it('picks the row nearest the focus line', () => {
    expect(pickFocusedRowId(rows, 510)).toBe('m3');
  });

  it('picks a row below the line when it is the nearest one', () => {
    expect(pickFocusedRowId(rows, 620)).toBe('m4');
  });

  it('returns null when nothing is visible', () => {
    expect(pickFocusedRowId([], 510)).toBeNull();
  });
});
