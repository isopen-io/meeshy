import { describe, expect, test } from 'bun:test';

import { NO_RAIL_CLEARANCE, RAIL_MIN_BAND, RAIL_TILE_GAP, railLength, railsClearance } from './call-rails-clearance';
import { RAIL_YIELD, SCREEN_SELF_TILE, SELF_TILE_MARGIN, selfTileBox, selfTileFootprint, selfTileRailShift, selfTileSize, type SelfTileCorner, type TileFootprint } from './call-self-tile';

/**
 * **UN RAIL NE MASQUE JAMAIS MA VIGNETTE** (#17327, #17429) — la planche P2
 * pose ma vignette en haut à droite, AU-DESSUS du rail « l'appel ». Le rail du
 * côté de ma vignette se DÉCALE : sous elle (ou au-dessus, en coin bas) quand
 * la place reste, sinon à côté d'elle, vers l'intérieur. L'autre rail ne bouge
 * pas. Les mesures sont celles de l'écran sous sa zone sûre.
 */

const phone = { width: 390, height: 844 };
const small = { width: 375, height: 667 };
const landscape = { width: 568, height: 240 };
const landscapeRoomy = { width: 568, height: 320 };

const tile = (corner: SelfTileCorner, viewport: { readonly width: number; readonly height: number }, scale: 1 | 2 | 3 = 2, bleed = 0): TileFootprint => ({
  corner,
  ...selfTileBox({ corner, size: selfTileSize(scale, viewport), viewport, bleed }),
});

const lengths = { leading: railLength(2), trailing: railLength(7) };

const overlaps = (a: { readonly top: number; readonly bottom: number }, b: { readonly top: number; readonly bottom: number }): boolean => a.top < b.bottom && b.top < a.bottom;

/** Où le rail se pose, centré dans sa bande et borné par elle, dans les mesures de l'écran. */
const railSpan = (viewport: { readonly width: number; readonly height: number }, clearance: { readonly top: number; readonly bottom: number }, length: number) => {
  const areaTop = 56 + clearance.top;
  const areaBottom = viewport.height - (viewport.width >= 560 ? 0 : 104) - clearance.bottom;
  const shown = Math.min(length, areaBottom - areaTop);
  const top = areaTop + (areaBottom - areaTop - shown) / 2;
  return { top, bottom: top + shown };
};

describe('railLength', () => {
  test('des boutons de 44, 8 entre eux, 8 de verre autour', () => {
    expect(railLength(7)).toBe(372);
    expect(railLength(2)).toBe(112);
    expect(railLength(0)).toBe(0);
  });
});

describe('railsClearance', () => {
  test('sans vignette, aucun rail ne bouge', () => {
    expect(railsClearance({ tile: null, viewport: phone, rtl: false, lengths })).toEqual({ leading: NO_RAIL_CLEARANCE, trailing: NO_RAIL_CLEARANCE });
  });

  test('P2 : ma vignette en haut à droite, le rail « l’appel » se pose SOUS elle et ne la recouvre plus', () => {
    const mine = tile('top-right', phone);
    const clearance = railsClearance({ tile: mine, viewport: phone, rtl: false, lengths });
    expect(clearance.leading).toEqual(NO_RAIL_CLEARANCE);
    expect(clearance.trailing).toEqual({ top: mine.y + mine.height - 56 + RAIL_TILE_GAP, bottom: 0, inline: 0 });
    const span = railSpan(phone, clearance.trailing, lengths.trailing);
    expect(span.top).toBeGreaterThanOrEqual(mine.y + mine.height + RAIL_TILE_GAP);
    expect(span.bottom - span.top).toBe(lengths.trailing);
  });

  test('sans le décalage, le rail « l’appel » recouvrait bien le bas de ma vignette (le défaut corrigé)', () => {
    const mine = tile('top-right', phone);
    const span = railSpan(phone, NO_RAIL_CLEARANCE, lengths.trailing);
    expect(overlaps(span, { top: mine.y, bottom: mine.y + mine.height })).toBe(true);
  });

  test('en coin bas, le rail se pose AU-DESSUS de ma vignette', () => {
    const mine = tile('bottom-left', phone);
    const clearance = railsClearance({ tile: mine, viewport: phone, rtl: false, lengths });
    expect(clearance.trailing).toEqual(NO_RAIL_CLEARANCE);
    expect(clearance.leading.top).toBe(0);
    expect(clearance.leading.inline).toBe(0);
    const span = railSpan(phone, clearance.leading, lengths.leading);
    expect(span.bottom).toBeLessThanOrEqual(mine.y - RAIL_TILE_GAP);
  });

  test('de droite à gauche, ma vignette à droite décale le rail de DÉBUT, qui est à droite', () => {
    const clearance = railsClearance({ tile: tile('top-right', phone), viewport: phone, rtl: true, lengths });
    expect(clearance.trailing).toEqual(NO_RAIL_CLEARANCE);
    expect(clearance.leading.top).toBeGreaterThan(0);
  });

  test('chaque coin, chaque taille, trois écrans : le rail de son côté ne recouvre jamais ma vignette', () => {
    const corners: readonly SelfTileCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    for (const viewport of [phone, small]) {
      for (const scale of [1, 2, 3] as const) {
        for (const corner of corners) {
          const mine = tile(corner, viewport, scale);
          const side = corner.endsWith('right') ? 'trailing' : 'leading';
          const clearance = railsClearance({ tile: mine, viewport, rtl: false, lengths })[side];
          const span = railSpan(viewport, clearance, lengths[side]);
          const beside = clearance.inline >= SELF_TILE_MARGIN + mine.width + RAIL_TILE_GAP;
          expect({ viewport, scale, corner, masked: !beside && overlaps(span, { top: mine.y, bottom: mine.y + mine.height }) }).toEqual({ viewport, scale, corner, masked: false });
        }
      }
    }
  });

  test('un écran court garde le rail sous ma vignette tant qu’une bande utile reste : il y défile au doigt', () => {
    const mine = tile('top-right', small);
    const clearance = railsClearance({ tile: mine, viewport: small, rtl: false, lengths });
    expect(clearance.trailing.inline).toBe(0);
    expect(clearance.trailing.top).toBe(mine.y + mine.height - 56 + RAIL_TILE_GAP);
    expect(railSpan(small, clearance.trailing, lengths.trailing).bottom - railSpan(small, clearance.trailing, lengths.trailing).top).toBeGreaterThanOrEqual(RAIL_MIN_BAND);
  });

  test('L2.8 (#17965) — en paysage, le rail reste à son BORD, centré sur toute sa hauteur : c’est ma vignette qui lui cède le coin', () => {
    for (const viewport of [landscapeRoomy, landscape]) {
      for (const corner of ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const) {
        expect(railsClearance({ tile: tile(corner, viewport), viewport, rtl: false, lengths })).toEqual({ leading: NO_RAIL_CLEARANCE, trailing: NO_RAIL_CLEARANCE });
        expect(railsClearance({ tile: tile(corner, viewport), viewport, rtl: true, lengths })).toEqual({ leading: NO_RAIL_CLEARANCE, trailing: NO_RAIL_CLEARANCE });
      }
    }
  });

  test('un écran debout trop court pour une bande utile garde le rail À CÔTÉ de ma vignette, au-dessus de la pilule (l’ancien recours, hors paysage)', () => {
    const shortPortrait = { width: 400, height: 480 };
    const mine = tile('top-right', shortPortrait);
    const clearance = railsClearance({ tile: mine, viewport: shortPortrait, rtl: false, lengths });
    expect(clearance.trailing).toEqual({ top: 0, bottom: 0, inline: SELF_TILE_MARGIN + mine.width + RAIL_TILE_GAP });
    expect(clearance.leading).toEqual(NO_RAIL_CLEARANCE);
  });
});

/**
 * **L2.8 — EN PAYSAGE, MA VIGNETTE CÈDE LE COIN AU RAIL** (décision porteur du 2026-11-13, #17965 point 1 ; capture L2) :
 * `(…)` ouvert, le rail reste à son bord et ma vignette se décale vers l'intérieur, contre lui ; les rails rangés,
 * elle revient à son coin. Debout (P2), rien ne change : le rail se pose sous elle. La loi vit avec ma vignette
 * (`selfTileRailShift`), le rail n'a qu'à rester au bord en paysage (`railsClearance`) : les deux lisent la MÊME forme de
 * fenêtre, plus large que haute.
 */
describe('L2.8 — en paysage, ma vignette cède le coin au rail, et y revient', () => {
  const wide = { width: 844, height: 390 };

  test('le pas de côté : le rail (44 de bouton, 8 de verre de chaque côté) posé à 12 du bord, plus l’écart de 8, moins la marge de ma vignette', () => {
    expect(SELF_TILE_MARGIN + RAIL_YIELD).toBe(12 + railLength(1) + RAIL_TILE_GAP);
  });

  test('(…) ouvert en paysage : un coin droit glisse vers la gauche, un coin gauche vers la droite ; rangés, aucun pas', () => {
    expect(selfTileRailShift({ corner: 'top-right', viewport: wide, railsOpen: true })).toBe(-RAIL_YIELD);
    expect(selfTileRailShift({ corner: 'bottom-right', viewport: wide, railsOpen: true })).toBe(-RAIL_YIELD);
    expect(selfTileRailShift({ corner: 'top-left', viewport: wide, railsOpen: true })).toBe(RAIL_YIELD);
    expect(selfTileRailShift({ corner: 'bottom-left', viewport: wide, railsOpen: true })).toBe(RAIL_YIELD);
    expect(selfTileRailShift({ corner: 'top-right', viewport: wide, railsOpen: false })).toBe(0);
  });

  test('debout, ma vignette garde son coin : le rail se pose sous elle (P2)', () => {
    expect(selfTileRailShift({ corner: 'top-right', viewport: phone, railsOpen: true })).toBe(0);
  });

  test('l’empreinte remise aux rails est la vignette décalée : aucun rail resté au bord ne la recouvre, dans aucun coin, aucune taille, aucun sens', () => {
    const corners: readonly SelfTileCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    for (const viewport of [wide, landscapeRoomy, landscape]) {
      for (const scale of [1, 2, 3] as const) {
        for (const corner of corners) {
          const mine = selfTileFootprint({ layout: 'video-duo', cameraOn: true, swapped: false, framed: false, immersive: false, corner, scale, viewport, topInset: 0, railsOpen: true });
          const rested = tile(corner, viewport, scale);
          expect(mine?.x).toBe(rested.x + selfTileRailShift({ corner, viewport, railsOpen: true }));
          const railInner = 12 + railLength(1);
          const clear = corner.endsWith('right') ? viewport.width - ((mine?.x ?? 0) + (mine?.width ?? 0)) >= railInner + RAIL_TILE_GAP : (mine?.x ?? 0) >= railInner + RAIL_TILE_GAP;
          for (const rtl of [false, true]) expect({ viewport, scale, corner, rtl, clear, none: railsClearance({ tile: mine, viewport, rtl, lengths }) }).toEqual({ viewport, scale, corner, rtl, clear: true, none: { leading: NO_RAIL_CLEARANCE, trailing: NO_RAIL_CLEARANCE } });
        }
      }
    }
  });

  test('les rails rangés, l’empreinte reprend son coin', () => {
    const base = { layout: 'video-duo' as const, cameraOn: true, swapped: false, framed: false, immersive: false, corner: 'top-right' as const, scale: 2 as const, viewport: wide, topInset: 0 };
    expect(selfTileFootprint({ ...base, railsOpen: false })).toEqual(tile('top-right', wide));
    expect(selfTileFootprint(base)).toEqual(tile('top-right', wide));
  });
});

/**
 * **W1 — LA COLONNE DU JOURNAL RÉDUIT LA SCÈNE, PAS LA FENÊTRE** (W1.5, #17918) : ma vignette se mesure dans la
 * scène que la colonne laisse (`selfTileBox`, `bleed`), et le rail de fin, déjà arrêté à la colonne (`inset`),
 * se décale d'elle depuis le bord de cette scène — la colonne ne se compte jamais deux fois, quel que soit le sens
 * de lecture.
 */
describe('W1 — colonne ouverte, le rail longe ma vignette depuis le bord de la scène', () => {
  const wideShort = { width: 1400, height: 240 };
  const column = 384;
  const tallNarrow = { width: 900, height: 1000 };

  test('L2.8 — fenêtre couchée, colonne ouverte : le rail de fin reste au bord de la scène réduite, ma vignette lui cède le coin', () => {
    for (const rtl of [false, true]) {
      for (const corner of ['top-right', 'top-left'] as const) {
        expect(railsClearance({ tile: tile(corner, wideShort, 2, column), viewport: wideShort, inset: column, rtl, lengths })).toEqual({ leading: NO_RAIL_CLEARANCE, trailing: NO_RAIL_CLEARANCE });
      }
    }
    const mine = selfTileFootprint({ layout: 'video-duo', cameraOn: true, swapped: false, framed: false, immersive: false, corner: 'top-right', scale: 2, viewport: wideShort, topInset: 0, bleed: column, railsOpen: true });
    expect(mine?.x).toBe(tile('top-right', wideShort, 2, column).x - RAIL_YIELD);
  });

  test('fenêtre debout, colonne ouverte : le rail de fin se pose sous ma vignette, depuis le bord de la scène réduite', () => {
    const mine = tile('top-right', tallNarrow, 2, column);
    const clearance = railsClearance({ tile: mine, viewport: tallNarrow, inset: column, rtl: false, lengths });
    expect(clearance.trailing).toEqual({ top: mine.y + mine.height - 56 + RAIL_TILE_GAP, bottom: 0, inline: 0 });
    expect(clearance.leading).toEqual(NO_RAIL_CLEARANCE);
  });

  test('selfTileFootprint remet ma vignette où la scène réduite la pose, et l’écran partagé aussi', () => {
    const base = { cameraOn: true, swapped: false, framed: false, immersive: false, scale: 2 as const, viewport: wideShort, topInset: 0, bleed: column };
    expect(selfTileFootprint({ ...base, layout: 'video-duo', corner: 'top-right' })).toEqual(tile('top-right', wideShort, 2, column));
    expect(selfTileFootprint({ ...base, layout: 'video-duo', corner: 'top-left' })).toEqual(tile('top-left', wideShort, 2, column));
    expect(selfTileFootprint({ ...base, layout: 'screen', corner: 'top-right' })?.x).toBe(wideShort.width - column - SELF_TILE_MARGIN - SCREEN_SELF_TILE.width);
  });
});

describe('selfTileFootprint', () => {
  const base = { cameraOn: true, swapped: false, framed: false, immersive: false, corner: 'top-right' as const, scale: 2 as const, viewport: phone, topInset: 0 };

  test('en duo vidéo, ma vignette en coin est celle que la scène pose', () => {
    expect(selfTileFootprint({ ...base, layout: 'video-duo' })).toEqual(tile('top-right', phone));
  });

  test('la capsule de capture la fait descendre d’autant', () => {
    expect(selfTileFootprint({ ...base, layout: 'video-duo', topInset: 44 })?.y).toBe(tile('top-right', phone).y + 44);
  });

  test('caméra coupée, aucune vignette ; échangée, le coin montre l’autre et reste une vignette', () => {
    expect(selfTileFootprint({ ...base, layout: 'video-duo', cameraOn: false })).toBeNull();
    expect(selfTileFootprint({ ...base, layout: 'video-duo', cameraOn: false, swapped: true })).not.toBeNull();
  });

  test('composée dans un cadre en direct, ma vignette se retire : rien à éviter', () => {
    expect(selfTileFootprint({ ...base, layout: 'video-duo', framed: true })).toBeNull();
  });

  test('l’écran partagé par l’autre garde ma vignette en haut à droite, sauf en plein écran', () => {
    expect(selfTileFootprint({ ...base, layout: 'screen' })).toEqual({ corner: 'top-right', x: phone.width - SELF_TILE_MARGIN - SCREEN_SELF_TILE.width, ...SCREEN_SELF_TILE });
    expect(selfTileFootprint({ ...base, layout: 'screen', immersive: true })).toBeNull();
    expect(selfTileFootprint({ ...base, layout: 'screen', cameraOn: false })).toBeNull();
  });

  test('ni appel vocal, ni grille', () => {
    expect(selfTileFootprint({ ...base, layout: 'portrait' })).toBeNull();
    expect(selfTileFootprint({ ...base, layout: 'grid' })).toBeNull();
  });
});
