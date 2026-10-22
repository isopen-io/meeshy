import type { GloryFrameBirdAnchor, GloryFrameBirdLayout, GloryFrameBirds, GloryFrameBox, GloryFrameFormat, GloryFrameLayer, GloryFrameTextSlot } from '@meeshy/shared/types/glory-frame-format';
import type { GloryFrame } from '@meeshy/shared/types/glory-frames';

import type { Rect } from '../layout';

/**
 * **CE QUE LE PEINTRE LIT D'UN CADRE DE GLOIRE** (#10159, L7, § 5.5 du prompt
 * des Cadres de gloire) — le contrat partagé relu tel quel (`glory-frames.ts`
 * le valide, fail-closed par cadre ; rien n'est redéfini ici), plus ce que le
 * web pose dessus : la RECETTE d'une photo (pose, message, recadrage, miroir,
 * Flamme et lien retirables, H-2) et les emplacements de texte VIVANTS que le
 * moment remplit (les autres gardent le texte d'exemple de l'export).
 */

export type { GloryFrame, GloryFrameBirdAnchor, GloryFrameBirdLayout, GloryFrameBirds, GloryFrameBox, GloryFrameFormat, GloryFrameLayer, GloryFrameTextSlot };
export { parseGloryFrameContract, readGloryFrame } from '@meeshy/shared/types/glory-frames';

/** Le recadrage de la photo dans sa fenêtre : décalage en fraction de la fenêtre, zoom ≥ 1. */
export type GloryCrop = { readonly dx: number; readonly dy: number; readonly zoom: number };

export const NO_CROP: GloryCrop = { dx: 0, dy: 0, zoom: 1 };

export type GloryRecipe = {
  /** La mise en page des oiseaux ; `null` : celle que le cadre déclare par défaut (jamais `selfie`). */
  readonly pose: GloryFrameBirdLayout | null;
  /** Le message de l'utilisateur sur la plaque ; `null` ou vide : la plaque sans message. */
  readonly message: string | null;
  readonly crop: GloryCrop;
  readonly showFlame: boolean;
  readonly showLink: boolean;
};

export const DEFAULT_RECIPE: GloryRecipe = { pose: null, message: null, crop: NO_CROP, showFlame: true, showLink: true };

/** Les emplacements que le moment REMPLIT ; tout autre emplacement du contrat peint son texte d'exemple. */
export const LIVE_TEXT_SLOTS = ['kicker', 'title', 'date', 'message'] as const;
export type LiveTextSlot = (typeof LIVE_TEXT_SLOTS)[number];

export type GloryTexts = Readonly<Record<LiveTextSlot, string | null>>;

export const rectOf = ([x, y, w, h]: GloryFrameBox): Rect => ({ x, y, w, h });

/** Les quatre arguments de `drawImage(image, x, y, w, h)`. */
export const boxArgs = (box: GloryFrameBox): readonly [number, number, number, number] => [box[0], box[1], box[2], box[3]];

/** Le premier sticker d'une mise en page dit si elle existe pour ce cadre. */
/** La table des mises en page d'un format (`birds.default`, `birds.layouts`). */
export type GloryFrameBirdTable = GloryFrameFormat['birds'];

export const birdLayoutOf = (birds: GloryFrameBirdTable, pose: GloryFrameBirdLayout | null): GloryFrameBirds | undefined => birds.layouts[pose ?? birds.default] ?? birds.layouts[birds.default];

/** Les ancres d'une mise en page, quelle que soit sa forme (deux oiseaux, une paire, Meo seul). */
export const anchorsOf = (layout: GloryFrameBirds): readonly GloryFrameBirdAnchor[] => ('pair' in layout ? [layout.pair] : 'mee' in layout ? [layout.mee, layout.meo] : [layout.meo]);

/** La variante de plaque qu'une recette demande : celle du message quand il y en a un ET que le cadre la dessine. */
export const plateVariantOf = (format: GloryFrameFormat, message: string | null): 'plain' | 'message' | null => {
  const wantsMessage = message !== null && message.trim().length > 0;
  if (wantsMessage && format.layers.plate.message !== undefined) return 'message';
  if (format.layers.plate.plain !== undefined) return 'plain';
  return format.layers.plate.message === undefined ? null : 'message';
};
