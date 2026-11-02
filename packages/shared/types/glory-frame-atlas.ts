/**
 * L'ATLAS des vignettes d'un pack de cadres (#10275, § 5.10.5) — UNE image,
 * adressée par contenu, qui montre le pack sans l'installer : une bande d'une
 * cellule 9:16 par cadre VISIBLE, dans l'ordre du contrat (un cadre masqué ne
 * se propose plus, il ne se montre pas non plus).
 *
 * Composée hors ligne par `compose:glory-frame-atlases` depuis les vignettes
 * du magasin, référencée par `preview` dans le registre, comptée dans
 * l'empreinte et la `version` du pack (`generate:glory-frames`), servie par
 * `/api/v1/pack-assets`. Elle n'entre pas dans `downloadBytes` : c'est le coût
 * de VOIR un pack, pas celui de l'AVOIR.
 *
 * Sa taille est BORNÉE (`PACK_PREVIEW_MAX_BYTES`) : le compositeur refuse de
 * l'écrire au-delà, et la passerelle ne sert pas un aperçu démesuré — le pack
 * se montre alors par sa seule couverture.
 */
import type { PackAssetRef } from './content-pack.js';

/** Une cellule : la vignette 270 × 480 réduite au tiers. */
export const GLORY_FRAME_ATLAS_CELL = { width: 90, height: 160 } as const;

/** La largeur maximale d'une image WebP (16 383 px), en cellules. */
export const GLORY_FRAME_ATLAS_MAX_CELLS = Math.floor(16_383 / GLORY_FRAME_ATLAS_CELL.width);

/** 256 Kio : quelques Kio par cellule, l'Afrique (38 cadres) comprise. */
export const PACK_PREVIEW_MAX_BYTES = 262_144;

export const gloryFrameAtlasFrames = <F extends { readonly hidden: boolean }>(frames: readonly F[]): readonly F[] => frames.filter((frame) => !frame.hidden);

export const gloryFrameAtlasSize = (cells: number): { readonly width: number; readonly height: number } => ({
  width: cells * GLORY_FRAME_ATLAS_CELL.width,
  height: GLORY_FRAME_ATLAS_CELL.height,
});

export const gloryFrameAtlasCell = (index: number): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } => ({
  x: index * GLORY_FRAME_ATLAS_CELL.width,
  y: 0,
  ...GLORY_FRAME_ATLAS_CELL,
});

/** L'aperçu qu'un serveur ou un client accepte de montrer : absent ou au-delà de la borne ⇒ `null`. */
export const servablePackPreview = (preview: PackAssetRef | null): PackAssetRef | null =>
  preview !== null && preview.bytes <= PACK_PREVIEW_MAX_BYTES ? preview : null;
