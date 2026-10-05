import type { EngagementAxisFamily, EngagementAxisKey } from '@meeshy/shared/types/engagement';
import type { EngagementAxisProgress } from '@meeshy/shared/utils/engagement-progress';

import { GAME_BADGE_MATERIALS, type GameMaterial } from './materials';

/**
 * LES MÉDAILLES (#9466) — la forme d'un badge d'accumulation. Une lunette de
 * MÉTAL biseautée (sept matières : le métal dit la hauteur atteinte), un champ
 * ÉMAILLÉ à la couleur de la FAMILLE de l'axe, un PICTOGRAMME d'axe au trait
 * (jamais une bulle de conversation), sept PERLES de palier, le poinçon
 * Signature, un RUBAN à partir de l'Or portant le palier en cartouche, et un
 * ARC extérieur de progression vers le palier suivant. Éteint, un badge n'est
 * plus qu'une EMPREINTE : la même médaille en creux, avec ce qu'il manque.
 *
 * Tout ce qui se DÉCIDE est ici, en données ; `components/game/medal.tsx` ne
 * fait que dessiner. Aucune couleur n'est écrite : l'émail est un jeton
 * `--game-enamel-<famille>` (`styles/game.css`), le métal une matière.
 */

/** Sept matières, sept perles : le prisme (5 000) est le septième palier. */
export const MEDAL_TIER_MAX = GAME_BADGE_MATERIALS.length;

/** Le palier d'Or, premier à porter un ruban. */
const RIBBON_FROM_TIER = 4;

export const MEDAL_PICTOGRAMS = ['text', 'voice', 'story', 'post', 'reel', 'comment', 'conversation', 'tool', 'social'] as const;
export type MedalPictogram = (typeof MEDAL_PICTOGRAMS)[number];

const PICTOGRAM_BY_AXIS: Readonly<Record<EngagementAxisKey, MedalPictogram>> = {
  'content.audio_message': 'voice',
  'content.text_message': 'text',
  'content.post': 'post',
  'content.story': 'story',
  'content.reel': 'reel',
  'comment.audio': 'comment',
  'comment.text': 'comment',
  'conversation.private': 'conversation',
  'conversation.public': 'conversation',
  'conversation.community': 'conversation',
  'conversation.group_created': 'conversation',
  'tool.sticker': 'tool',
  'tool.in_app_edit': 'tool',
  'tool.direct_publish': 'tool',
  'tool.reaction': 'tool',
  'tool.attachment': 'tool',
  'social.tracked_link': 'social',
  'social.share': 'social',
  'social.invite_joined': 'social',
  'social.friendship': 'social',
};

export const pictogramOf = (axis: EngagementAxisKey): MedalPictogram => PICTOGRAM_BY_AXIS[axis];

/** L'émail de la famille : contenu indigo, lien rose, conversation violet, commentaire sarcelle, outil ambre. */
export const enamelToken = (family: EngagementAxisFamily): string => `var(--game-enamel-${family})`;

const tierIndex = (tier: number): number | null => (Number.isFinite(tier) && tier >= 1 ? Math.min(MEDAL_TIER_MAX, Math.floor(tier)) : null);

/** La matière du palier atteint ; `null` à zéro (une empreinte) ou devant un nombre illisible. */
export const medalMaterial = (tier: number): GameMaterial | null => {
  const index = tierIndex(tier);
  return index === null ? null : (GAME_BADGE_MATERIALS[index - 1] ?? null);
};

export const hasRibbon = (tier: number): boolean => Number.isFinite(tier) && tier >= RIBBON_FROM_TIER;

const round = (value: number): number => Math.round(value * 10) / 10;

/** Le dessin tient dans un 100 × 112 : le centre de la lunette est en (50, 52). */
export const MEDAL_CENTER = { x: 50, y: 52 } as const;
export const MEDAL_BEZEL_RADIUS = 36;
export const MEDAL_ENAMEL_RADIUS = 27;
export const MEDAL_ARC_RADIUS = 41;

export type MedalPearl = { readonly x: number; readonly y: number; readonly lit: boolean };

/** Les sept perles, posées sur l'arc du haut de la lunette, allumées jusqu'au palier atteint. */
export const pearls = (tier: number): readonly MedalPearl[] => {
  const lit = tierIndex(tier) ?? 0;
  return Array.from({ length: MEDAL_TIER_MAX }, (_, k) => {
    const angle = ((-90 + (k - 3) * 13) * Math.PI) / 180;
    return {
      x: round(MEDAL_CENTER.x + 35.5 * Math.cos(angle)),
      y: round(MEDAL_CENTER.y + 35.5 * Math.sin(angle)),
      lit: k < lit,
    };
  });
};

const CIRCUMFERENCE = 2 * Math.PI * MEDAL_ARC_RADIUS;

/** La longueur d'arc d'une fraction du tour — jamais plus d'un tour, jamais NaN. */
export const arcLength = (progress: number): number => (Number.isFinite(progress) ? CIRCUMFERENCE * Math.min(1, Math.max(0, progress)) : 0);
export const MEDAL_ARC_CIRCUMFERENCE = CIRCUMFERENCE;

export type Medal = {
  readonly axisKey: EngagementAxisKey;
  readonly family: EngagementAxisFamily;
  readonly pictogram: MedalPictogram;
  /** Le nombre de paliers atteints, 0 à 7 ; 0 : l'empreinte. */
  readonly tier: number;
  readonly material: GameMaterial | null;
  /** Le métal qu'on gagnera au palier suivant ; `null` quand l'échelle est complète. */
  readonly nextMaterial: GameMaterial | null;
  /** La part du chemin vers le palier suivant (0 à 1) ; 1 quand l'échelle est complète. */
  readonly progress: number;
  /** Le palier atteint, pour le cartouche du ruban ; `null` à zéro. */
  readonly threshold: number | null;
  readonly value: number;
  readonly nextThreshold: number | null;
  /** Ce qu'il manque pour allumer un badge éteint (l'empreinte) ; `null` sinon. */
  readonly missing: number | null;
};

/** Ce que la progression d'un axe donne à la médaille. */
export function medalOfAxis(axis: EngagementAxisProgress): Medal {
  const tier = axis.reachedCount;
  const nextThreshold = axis.nextThreshold;
  return {
    axisKey: axis.axisKey,
    family: axis.family,
    pictogram: pictogramOf(axis.axisKey),
    tier,
    material: medalMaterial(tier),
    nextMaterial: nextThreshold === null ? null : medalMaterial(tier + 1),
    progress: axis.progress,
    threshold: tier > 0 ? (axis.tiers[tier - 1]?.threshold ?? null) : null,
    value: axis.value,
    nextThreshold,
    missing: tier === 0 && nextThreshold !== null ? Math.max(0, nextThreshold - axis.value) : null,
  };
}
