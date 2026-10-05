import {
  ENGAGEMENT_AXES,
  ENGAGEMENT_AXIS_FAMILIES,
  ENGAGEMENT_AXIS_WEIGHTS,
  engagementAxisFamily,
  type EngagementAxisFamily,
  type EngagementAxisKey,
} from '@meeshy/shared/types/engagement';

/**
 * « COMMENT GAGNER » (#5841) — ce que le héros de Progression énumère : une
 * ligne par FAMILLE d'axe, triée par poids décroissant. La liste se DÉRIVE du
 * barème (`ENGAGEMENT_AXIS_WEIGHTS`) — jamais d'une chaîne recopiée : le porteur
 * a réglé ce barème trois fois en un jour, et une phrase en dur se périme au
 * premier réglage sans qu'aucun témoin ne rougisse (#5762).
 *
 * Le poids d'une famille est le plus haut de ses axes : créer un groupe (1)
 * ne rétrograde pas la conversation (5). Une famille à zéro ne rapporte rien,
 * elle n'est pas énumérée ; à poids égal, l'ordre du catalogue départage.
 */

export type EarnRule = { readonly family: EngagementAxisFamily; readonly points: number };

export function earnRules(weights: Readonly<Record<EngagementAxisKey, number>> = ENGAGEMENT_AXIS_WEIGHTS): readonly EarnRule[] {
  return ENGAGEMENT_AXIS_FAMILIES.map((family): EarnRule => ({
    family,
    points: Math.max(0, ...ENGAGEMENT_AXES.filter((axis) => engagementAxisFamily(axis) === family).map((axis) => weights[axis])),
  }))
    .filter((rule) => rule.points > 0)
    .map((rule, order) => ({ rule, order }))
    .sort((a, b) => b.rule.points - a.rule.points || a.order - b.order)
    .map(({ rule }) => rule);
}
