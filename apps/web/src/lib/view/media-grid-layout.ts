import { MEDIA_GRID_MAX_WIDTH } from '@/lib/reading-mode/metrics';
import { kindOf } from '@/lib/view/message';
import type { Attachment } from '@/lib/api/types';

/**
 * LA GRILLE 2/3/4+ D'UN MESSAGE (#6221) — miroir ARITHMÉTIQUE de
 * `FocalMediaGridLayout.slots(for:)` (`Focal/Row/FocalAttachmentBlock.swift:66-96`)
 * et de la disposition ÉQUIVALENTE de `BubbleStandardLayout+Media.swift:54-101`
 * (parité déclarée entre les deux sources Swift, gardée par
 * `scripts/check-curve.mjs` PARTIE 11).
 *
 * `MEDIA_GRID_MAX_WIDTH` reste dans `reading-mode/metrics.ts` — IMPORTÉ,
 * jamais recopié (§ 5 étape 2 de la spécification « grille de médias »).
 */

/** `FocalMediaGridLayout.gridSpacing` — l'écart de 2 px entre chaque case. */
export const MEDIA_GRID_SPACING = 2;
/** Hauteur de la boîte pour 1 image / 3 pièces / 4+ pièces. */
export const MEDIA_GRID_SOLO_IMAGE_HEIGHT = 240;
/** Hauteur de la boîte pour 2 pièces. */
export const MEDIA_GRID_PAIR_HEIGHT = 180;
/** `FocalMediaGridLayout` — part de largeur de la colonne GAUCHE au cas 3 pièces. */
export const MEDIA_GRID_TRIPLE_LEFT_RATIO = 0.6;
/** `FocalMediaGridLayout.soloVideoMaxHeightRatio` — plafond de hauteur d'une vidéo SEULE, en multiple de la largeur. */
export const MEDIA_GRID_SOLO_VIDEO_MAX_HEIGHT_RATIO = 1.6;
/** Au-delà de quatre pièces visuelles, les suivantes se résument au badge `+N`. */
export const MEDIA_GRID_VISIBLE_MAX = 4;
/** `+Media.swift:533` — le voile de l'overflow. */
export const OVERFLOW_VEIL_OPACITY = 0.5;
/** `+Media.swift:535` — la taille du libellé `+N`. */
export const OVERFLOW_LABEL_SIZE = 24;
/** `+Media.swift:492` — le diamètre du bouton de lecture inline, SEUL puis en grille. */
export const PLAY_DIAMETER_SOLO = 64;
export const PLAY_DIAMETER_MULTI = 44;
/** `BubbleFooter.swift:136` — la capsule du pied en surimpression sur un message visuel seul. */
export const MEDIA_FOOTER_OVERLAY_OPACITY = 0.55;
/** `+Media.swift:742` — la capsule du badge de durée d'une vignette vidéo. */
export const DURATION_BADGE_OPACITY = 0.6;

/**
 * LA FORME DE LA GRILLE — une DONNÉE que l'hôte déclare, jamais une branche
 * sur la peau recopiée dans le composant (revue #6169). Les deux sources
 * Swift partagent l'arithmétique mais PAS la forme :
 * - `box` : UNE boîte noire arrondie, les écarts peints en noir — la bulle
 *   (`BubbleStandardLayout.swift:814-817`, `.background(Color.black)` puis
 *   `.clipShape` sur la grille entière) ;
 * - `tiles` : CHAQUE case arrondie, rien peint entre elles, l'écart laisse
 *   voir le fond du fil — la rangée plate (`FocalAttachmentBlock.swift:203-213`,
 *   `clipShape` sur la cellule, aucun fond de conteneur).
 */
export type MediaGridFrame = 'box' | 'tiles';

/** Une case de la grille : SA largeur, la hauteur de la BOÎTE qui la contient, et son débordement (0 sauf la dernière visible). */
export type MediaSlot = {
  readonly width: number;
  readonly height: number;
  readonly overflowCount: number;
};

/**
 * `mediaGridSlots` — le nombre de cases RENDUES (`min(count, 4)`) et leurs
 * cotes. Chaque case porte la hauteur de la BOÎTE entière (pas sa hauteur
 * rendue individuelle) : au cas 3 pièces, les deux cellules de droite sont
 * empilées PAR LE COMPOSANT (`media-grid.tsx`, `grid-template-rows: 1fr 1fr`)
 * à l'intérieur de cette même hauteur de 240 — exactement ce que
 * `FocalMediaGridLayoutTests` observe côté Swift (chaque `slot` y porte la
 * hauteur de la SCÈNE, pas de la sous-cellule).
 */
export function mediaGridSlots(count: number): readonly MediaSlot[] {
  if (count <= 0) return [];
  if (count === 1) {
    return [{ width: MEDIA_GRID_MAX_WIDTH, height: MEDIA_GRID_SOLO_IMAGE_HEIGHT, overflowCount: 0 }];
  }
  if (count === 2) {
    const width = (MEDIA_GRID_MAX_WIDTH - MEDIA_GRID_SPACING) / 2;
    return [
      { width, height: MEDIA_GRID_PAIR_HEIGHT, overflowCount: 0 },
      { width, height: MEDIA_GRID_PAIR_HEIGHT, overflowCount: 0 },
    ];
  }
  if (count === 3) {
    const totalWidth = MEDIA_GRID_MAX_WIDTH - MEDIA_GRID_SPACING;
    const leftWidth = totalWidth * MEDIA_GRID_TRIPLE_LEFT_RATIO;
    const rightWidth = totalWidth * (1 - MEDIA_GRID_TRIPLE_LEFT_RATIO);
    return [
      { width: leftWidth, height: MEDIA_GRID_SOLO_IMAGE_HEIGHT, overflowCount: 0 },
      { width: rightWidth, height: MEDIA_GRID_SOLO_IMAGE_HEIGHT, overflowCount: 0 },
      { width: rightWidth, height: MEDIA_GRID_SOLO_IMAGE_HEIGHT, overflowCount: 0 },
    ];
  }
  const width = (MEDIA_GRID_MAX_WIDTH - MEDIA_GRID_SPACING) / 2;
  const visible = visibleCount(count);
  return Array.from({ length: visible }, (_, index) => ({
    width,
    height: MEDIA_GRID_SOLO_IMAGE_HEIGHT,
    overflowCount: index === visible - 1 ? Math.max(0, count - MEDIA_GRID_VISIBLE_MAX) : 0,
  }));
}

/** Le nombre de cases RENDUES pour `count` pièces — le reste devient le badge `+N` sur la dernière. */
export const visibleCount = (count: number): number => Math.min(count, MEDIA_GRID_VISIBLE_MAX);

/** La forme qu'une case OCCUPE à l'écran — distincte de `MediaSlot`, dont la hauteur est celle de la BOÎTE. */
export type MediaCellSize = { readonly width: number; readonly height: number };

/**
 * `mediaGridCellSizes` — LA FORME RENDUE de chaque case, dérivée de
 * `mediaGridSlots` et de `MEDIA_GRID_SPACING` (#7030).
 *
 * `MediaSlot.height` porte la hauteur de la BOÎTE sur CHAQUE case (miroir
 * exact de `FocalMediaGridLayout.slots(for:)`, dont les tests Swift
 * l'observent ainsi) : ce n'est donc pas la hauteur qu'une case EMPILÉE
 * occupe. Le composant empile — deux cases dans la colonne droite du
 * triplet, deux rangées `1fr 1fr` au quadruple — et cette dérivation dit ce
 * que cet empilement produit, UNE fois, pour que ni le composant ni le gate
 * ne la réécrivent.
 *
 * C'est ce que la boîte plafonnée doit préserver : sa LARGEUR rendue rétrécit
 * avec son porteur (`maxWidth: 100 %`, #7018) et sa hauteur suit par
 * `aspectRatio` (#7030) — chaque case garde alors ce RATIO, quelle que soit
 * la largeur servie.
 */
export function mediaGridCellSizes(count: number): readonly MediaCellSize[] {
  const slots = mediaGridSlots(count);
  if (slots.length === 0) return [];
  const stackedHeight = (boxHeight: number): number => (boxHeight - MEDIA_GRID_SPACING) / 2;
  if (slots.length <= 2) return slots.map(({ width, height }) => ({ width, height }));
  if (slots.length === 3) {
    const [left, right] = slots;
    return [
      { width: left!.width, height: left!.height },
      { width: right!.width, height: stackedHeight(right!.height) },
      { width: right!.width, height: stackedHeight(right!.height) },
    ];
  }
  return slots.map(({ width, height }) => ({ width, height: stackedHeight(height) }));
}

export type VideoSlotSize = { readonly width: number; readonly height: number };

/**
 * `FocalMediaGridLayout.soloVideoSlot(aspectRatio:)` — la vidéo SEULE, sans
 * plafond de largeur (300) mais PLAFONNÉE en hauteur à
 * `MEDIA_GRID_SOLO_VIDEO_MAX_HEIGHT_RATIO` fois la largeur. Repli `16/9`
 * quand la source ne porte aucun ratio connu (`ratio` absent ou nul).
 */
export function soloVideoSlot(ratio: number | undefined): VideoSlotSize {
  const usableRatio = ratio !== undefined && Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9;
  const maxHeight = MEDIA_GRID_MAX_WIDTH * MEDIA_GRID_SOLO_VIDEO_MAX_HEIGHT_RATIO;
  const height = Math.min(MEDIA_GRID_MAX_WIDTH / usableRatio, maxHeight);
  const width = Math.min(MEDIA_GRID_MAX_WIDTH, height * usableRatio);
  return { width, height };
}

export type AttachmentPartition = {
  readonly visual: readonly Attachment[];
  readonly audio: readonly Attachment[];
  readonly nonMedia: readonly Attachment[];
};

/**
 * `partitionAttachments` — miroir de `BubbleContentBuilder.swift:221-247` :
 * `visual` (image | vidéo), `audio`, `nonMedia` (fichier | lieu), ORDRE
 * conservé au sein de chaque groupe. Une pièce MASQUÉE (D-41) reste dans
 * `visual`/`audio` à SA position — elle occupe toujours sa case, le rendu du
 * substitut se décide au MONTAGE, pas ici (`maskedAttachment`, `media-
 * grid.tsx`). Le PNG d'un sticker n'entre jamais dans cette fonction : l'hôte
 * (`bubble.tsx`/`focal-row.tsx`) ne l'appelle pas quand `body.kind ===
 * 'sticker'` — cette loi n'a pas à le savoir.
 */
export function partitionAttachments(attachments: readonly Attachment[]): AttachmentPartition {
  const visual: Attachment[] = [];
  const audio: Attachment[] = [];
  const nonMedia: Attachment[] = [];
  for (const attachment of attachments) {
    const kind = kindOf(attachment);
    if (kind === 'image' || kind === 'video') {
      visual.push(attachment);
    } else if (kind === 'audio') {
      audio.push(attachment);
    } else {
      nonMedia.push(attachment);
    }
  }
  return { visual, audio, nonMedia };
}
