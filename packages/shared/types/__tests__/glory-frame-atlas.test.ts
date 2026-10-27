import { describe, expect, it } from 'vitest';
import {
  GLORY_FRAME_ATLAS_CELL,
  GLORY_FRAME_ATLAS_MAX_CELLS,
  PACK_PREVIEW_MAX_BYTES,
  gloryFrameAtlasCell,
  gloryFrameAtlasFrames,
  gloryFrameAtlasSize,
  servablePackPreview,
} from '../glory-frame-atlas';

const ref = (bytes: number) => ({ src: '0123456789abcdef.webp', bytes, sha256: '0123456789abcdef'.padEnd(64, '0') });
const frame = (id: string, hidden = false) => ({ id, hidden });

describe('l’atlas des vignettes d’un pack de cadres (#10275, § 5.10.5)', () => {
  it('est une bande d’une cellule 9:16 par cadre VISIBLE, dans l’ordre du contrat', () => {
    expect(GLORY_FRAME_ATLAS_CELL.width * 16).toBe(GLORY_FRAME_ATLAS_CELL.height * 9);
    expect(gloryFrameAtlasFrames([frame('a'), frame('b', true), frame('c')]).map((entry) => entry.id)).toEqual(['a', 'c']);
    expect(gloryFrameAtlasSize(3)).toEqual({ width: 3 * GLORY_FRAME_ATLAS_CELL.width, height: GLORY_FRAME_ATLAS_CELL.height });
  });

  it('dit où se trouve la vignette de rang n, pour qu’un client la découpe sans rien télécharger d’autre', () => {
    expect(gloryFrameAtlasCell(0)).toEqual({ x: 0, y: 0, ...GLORY_FRAME_ATLAS_CELL });
    expect(gloryFrameAtlasCell(4)).toEqual({ x: 4 * GLORY_FRAME_ATLAS_CELL.width, y: 0, ...GLORY_FRAME_ATLAS_CELL });
  });

  it('ne dépasse jamais la largeur qu’un décodeur WebP accepte', () => {
    expect(gloryFrameAtlasSize(GLORY_FRAME_ATLAS_MAX_CELLS).width).toBeLessThanOrEqual(16_383);
    expect(gloryFrameAtlasSize(GLORY_FRAME_ATLAS_MAX_CELLS + 1).width).toBeGreaterThan(16_383);
  });
});

describe('un aperçu de pack a une taille BORNÉE, fail-closed', () => {
  it('servi tel quel sous la borne, et à la borne', () => {
    expect(servablePackPreview(ref(1024))).toEqual(ref(1024));
    expect(servablePackPreview(ref(PACK_PREVIEW_MAX_BYTES))).toEqual(ref(PACK_PREVIEW_MAX_BYTES));
  });

  it('refusé au-delà : le pack se montre par sa couverture, jamais par une image démesurée', () => {
    expect(servablePackPreview(ref(PACK_PREVIEW_MAX_BYTES + 1))).toBeNull();
    expect(servablePackPreview(null)).toBeNull();
  });
});
