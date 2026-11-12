import { describe, expect, test } from 'bun:test';

import { NO_RAIL_CLEARANCE, RAIL_MIN_BAND, RAIL_TILE_GAP, railLength, railsClearance } from './call-rails-clearance';
import { SCREEN_SELF_TILE, SELF_TILE_MARGIN, selfTileBox, selfTileFootprint, selfTileSize, type SelfTileCorner, type TileFootprint } from './call-self-tile';

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

const tile = (corner: SelfTileCorner, viewport: { readonly width: number; readonly height: number }, scale: 1 | 2 | 3 = 2): TileFootprint => ({
  corner,
  ...selfTileBox({ corner, size: selfTileSize(scale, viewport), viewport }),
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
    for (const viewport of [phone, small, landscape]) {
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

  test('en paysage, ma vignette couchée est plus basse que haute : le rail tient encore sous elle (L1.5)', () => {
    const mine = tile('top-right', landscapeRoomy);
    const clearance = railsClearance({ tile: mine, viewport: landscapeRoomy, rtl: false, lengths });
    expect(clearance.trailing).toEqual({ top: mine.y + mine.height - 56 + RAIL_TILE_GAP, bottom: 0, inline: 0 });
  });

  test('en paysage court, sans bande utile sous ma vignette, le rail se pose À CÔTÉ d’elle et s’arrête au-dessus de la pilule', () => {
    const mine = tile('top-right', landscape);
    const clearance = railsClearance({ tile: mine, viewport: landscape, rtl: false, lengths });
    expect(clearance.trailing).toEqual({ top: 0, bottom: 104, inline: SELF_TILE_MARGIN + mine.width + RAIL_TILE_GAP });
    expect(clearance.leading).toEqual(NO_RAIL_CLEARANCE);
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
