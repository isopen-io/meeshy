/**
 * LE GUIDE D'UN BADGE (#9639) — ce qu'un badge d'accumulation explique de LUI-MÊME.
 *
 * Un badge est un AXE d'engagement (`ENGAGEMENT_AXES`) monté sur sept paliers
 * (`BADGE_MATERIALS` : cuivre 1, bronze 10, argent 50, or 100, platine 500,
 * obsidienne 1 000, prisme 5 000). Ce module rend, pour un axe et son compteur :
 *
 *  - l'ÉCHELLE des sept paliers — seuil, matière, ruban, atteint ou non, et la
 *    date de la trace gravée quand elle est servie ;
 *  - le palier ATTEINT et sa RAISON : `threshold-crossed` (le compteur a franchi
 *    le seuil) ou `served` (le compteur est redescendu sous le seuil, mais la
 *    trace gravée le tient — anti-rejeu, `engagement-progress.ts`) ;
 *  - les ÉTOILES allumées sur sept — une par palier atteint, comme les perles
 *    de la médaille ;
 *  - la PROCHAINE étoile — seuil, matière, ce qu'il manque — ou `null` au Prisme ;
 *  - le rangement des badges par FAMILLE, dans l'ordre déclaré
 *    (`ENGAGEMENT_AXIS_FAMILIES`) puis l'ordre du catalogue.
 *
 * Aucun mot ici : la phrase « ce qui compte » de chaque axe vit dans le
 * catalogue partagé (`engagementAxisWhatCounts`, `engagement-labels.ts`), les
 * noms de matière chez chaque client. Miroir Swift : `BadgeGuideResolver`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/BadgeGuide.swift`), gardé par
 * `fixtures/reading-modes/badge-guide.vectors.json`.
 */

import {
  ENGAGEMENT_AXES,
  ENGAGEMENT_AXIS_FAMILIES,
  engagementAxisFamily,
  type EngagementAxisFamily,
  type EngagementAxisKey,
} from '../../types/engagement.js';
import type { EngagementAxisProgress } from '../engagement-progress.js';
import { BADGE_MATERIALS, type BadgeMaterialKey } from './badge-tiers.js';

/** Sept paliers, sept étoiles. */
export const BADGE_STARS_MAX = BADGE_MATERIALS.length;

/** Un palier gravé servi par la passerelle : son seuil et sa date ISO 8601. */
export type BadgeServedTier = { readonly threshold: number; readonly reachedAt: string };

export type BadgeGuideInput = {
  readonly axisKey: EngagementAxisKey;
  readonly count: number;
  readonly served?: readonly BadgeServedTier[];
};

export type BadgeRung = {
  readonly threshold: number;
  readonly material: BadgeMaterialKey;
  readonly ribbon: boolean;
  readonly reached: boolean;
  readonly reachedAt: string | null;
};

/** Pourquoi un palier est tenu : le seuil franchi, ou la seule trace gravée. */
export type BadgeReachReason = 'threshold-crossed' | 'served';

export type BadgeReached = {
  readonly threshold: number;
  readonly material: BadgeMaterialKey;
  readonly reason: BadgeReachReason;
  readonly reachedAt: string | null;
};

export type BadgeNextStar = {
  readonly threshold: number;
  readonly material: BadgeMaterialKey;
  readonly missing: number;
};

export type BadgeGuide = {
  readonly axisKey: EngagementAxisKey;
  readonly family: EngagementAxisFamily;
  readonly count: number;
  readonly rungs: readonly BadgeRung[];
  readonly stars: number;
  readonly reached: BadgeReached | null;
  readonly next: BadgeNextStar | null;
};

const safeCount = (count: number): number => (Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0);

export function badgeGuide(input: BadgeGuideInput): BadgeGuide {
  const count = safeCount(input.count);
  const servedAt = (threshold: number): string | null => input.served?.find((tier) => tier.threshold === threshold)?.reachedAt ?? null;
  const rungs = BADGE_MATERIALS.map<BadgeRung>((material) => {
    const reachedAt = servedAt(material.threshold);
    return {
      threshold: material.threshold,
      material: material.key,
      ribbon: material.ribbon,
      reached: count >= material.threshold || reachedAt !== null,
      reachedAt,
    };
  });
  const top = rungs.filter((rung) => rung.reached).at(-1);
  const upcoming = rungs.find((rung) => !rung.reached && (top === undefined || rung.threshold > top.threshold));
  return {
    axisKey: input.axisKey,
    family: engagementAxisFamily(input.axisKey),
    count,
    rungs,
    stars: rungs.filter((rung) => rung.reached).length,
    reached:
      top === undefined
        ? null
        : { threshold: top.threshold, material: top.material, reason: count >= top.threshold ? 'threshold-crossed' : 'served', reachedAt: top.reachedAt },
    next: upcoming === undefined ? null : { threshold: upcoming.threshold, material: upcoming.material, missing: Math.max(0, upcoming.threshold - count) },
  };
}

/** Le guide d'un axe de la progression déjà résolue : ses paliers datés sont les traces servies. */
export const badgeGuideOfProgress = (axis: EngagementAxisProgress): BadgeGuide =>
  badgeGuide({
    axisKey: axis.axisKey,
    count: axis.value,
    served: axis.tiers.flatMap((tier) => (tier.reachedAt === null ? [] : [{ threshold: tier.threshold, reachedAt: tier.reachedAt }])),
  });

export type BadgeGuideFamilyGroup = { readonly family: EngagementAxisFamily; readonly guides: readonly BadgeGuide[] };

const catalogIndex = (axisKey: EngagementAxisKey): number => ENGAGEMENT_AXES.indexOf(axisKey);

/** Les badges par famille, dans l'ordre déclaré ; l'ordre du catalogue dans chacune ; une famille vide ne paraît pas. */
export function badgeGuidesByFamily(guides: readonly BadgeGuide[]): readonly BadgeGuideFamilyGroup[] {
  return ENGAGEMENT_AXIS_FAMILIES.map((family) => ({
    family,
    guides: guides.filter((guide) => guide.family === family).sort((a, b) => catalogIndex(a.axisKey) - catalogIndex(b.axisKey)),
  })).filter((group) => group.guides.length > 0);
}
