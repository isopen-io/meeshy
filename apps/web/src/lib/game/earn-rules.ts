import { ENGAGEMENT_AXIS_FAMILIES, type EngagementAxisFamily } from '@meeshy/shared/types/engagement';
import { ENGAGEMENT_FAMILY_TOP_POINTS } from '@meeshy/shared/types/engagement-operations';

/**
 * « COMMENT GAGNER » (#5841, #9667) — ce que le héros de Progression énumère :
 * une ligne par FAMILLE, triée par points décroissants. La valeur est ce qu'un
 * geste de la famille rapporte AU PLUS avant multiplicateurs
 * (`ENGAGEMENT_FAMILY_TOP_POINTS`, dérivé du catalogue des opérations) — jamais
 * une chaîne recopiée : une phrase en dur se périme au premier réglage (#5762).
 *
 * Une famille à zéro ne rapporte rien, elle n'est pas énumérée ; à points
 * égaux, l'ordre du catalogue départage.
 */

export type EarnRule = { readonly family: EngagementAxisFamily; readonly points: number };

export function earnRules(top: Readonly<Record<EngagementAxisFamily, number>> = ENGAGEMENT_FAMILY_TOP_POINTS): readonly EarnRule[] {
  return ENGAGEMENT_AXIS_FAMILIES.map((family): EarnRule => ({ family, points: top[family] }))
    .filter((rule) => rule.points > 0)
    .map((rule, order) => ({ rule, order }))
    .sort((a, b) => b.rule.points - a.rule.points || a.order - b.order)
    .map(({ rule }) => rule);
}
