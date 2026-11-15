package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.engagement.EngagementCatalog
import me.meeshy.sdk.model.game.engagement.EngagementElanProgress

/** Une puce de « Comment gagner » : une famille, ce qu'un geste rapporte au plus, et si l'élan la dit active. */
public data class HeroEarnChip(val family: EngagementAxisFamily, val weight: Int, val active: Boolean)

/**
 * « COMMENT GAGNER » (miroir de `GameHero.earnItems`, iOS #5841, #9667) — aucune chaîne recopiée : le barème
 * `familyTopPoints` fait la liste, triée par poids décroissant ; à poids égal l'ordre du catalogue décide (la liste ne
 * danse pas d'un lancement à l'autre). `elan` dit quelles familles sont actives ; `null` devant un ancien serveur.
 */
public object GameHeroEarn {
    public fun items(
        weights: Map<EngagementAxisFamily, Int> = EngagementCatalog.familyTopPoints,
        elan: EngagementElanProgress? = null,
    ): List<HeroEarnChip> =
        EngagementCatalog.families
            .filter { it in weights }
            .sortedByDescending { weights.getValue(it) }
            .map { HeroEarnChip(it, weights.getValue(it), active = elan?.activeFamilies?.contains(it) ?: false) }
}
