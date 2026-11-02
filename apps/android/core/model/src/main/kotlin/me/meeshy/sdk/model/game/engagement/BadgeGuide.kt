package me.meeshy.sdk.model.game.engagement

/**
 * LE GUIDE D'UN BADGE — miroir de `packages/shared/utils/game/badge-guide.ts` et de `BadgeGuideResolver` (iOS,
 * `BadgeGuide.swift`). Ce qu'une médaille explique d'elle-même : ses sept paliers (seuil, matière, ruban, date gravée),
 * le palier tenu et POURQUOI (le seuil franchi, ou la seule trace gravée quand le compteur est redescendu), ses étoiles
 * sur sept, ce qu'il manque pour la prochaine. Gardé par les vecteurs partagés `badge-guide.vectors.json` : sur
 * divergence, c'est le TypeScript qui a raison.
 */
public data class BadgeServedTier(val threshold: Int, val reachedAt: String)

public data class BadgeRung(
    val threshold: Int,
    val material: BadgeMaterialKey,
    val ribbon: Boolean,
    val reached: Boolean,
    val reachedAt: String?,
)

public enum class BadgeReachReason(public val wire: String) {
    /** Le compteur a franchi le seuil. */
    ThresholdCrossed("threshold-crossed"),

    /** Le compteur est redescendu sous le seuil ; la trace gravée le tient. */
    Served("served"),
}

public data class BadgeReached(val threshold: Int, val material: BadgeMaterialKey, val reason: BadgeReachReason, val reachedAt: String?)

public data class BadgeNextStar(val threshold: Int, val material: BadgeMaterialKey, val missing: Int)

/** L'état d'un palier dans la SUITE d'une médaille : tenu, la prochaine étoile, ou plus loin. */
public enum class BadgeRungState { Reached, Next, Upcoming }

public data class BadgeGuide(
    val axis: EngagementAxisKey,
    val family: EngagementAxisFamily,
    val count: Int,
    /** Les sept paliers, du cuivre au prisme. */
    val rungs: List<BadgeRung>,
    val stars: Int,
    /** Le plus haut palier tenu, `null` avant le premier. */
    val reached: BadgeReached?,
    /** La prochaine étoile, `null` au Prisme. */
    val next: BadgeNextStar?,
) {
    public fun stateOf(rung: BadgeRung): BadgeRungState = when {
        rung.reached -> BadgeRungState.Reached
        next?.threshold == rung.threshold -> BadgeRungState.Next
        else -> BadgeRungState.Upcoming
    }

    /** La SUITE de la médaille : ses paliers à venir, dans l'ordre ; vide au Prisme. */
    val upcoming: List<BadgeRung> get() = rungs.filterNot { it.reached }
}

public data class BadgeGuideFamilyGroup(val family: EngagementAxisFamily, val guides: List<BadgeGuide>)

public object BadgeGuideResolver {
    /** Sept paliers, sept étoiles. */
    public val STARS_MAX: Int get() = GameBadgeTiers.materials.size

    public fun resolve(axis: EngagementAxisKey, count: Int, served: List<BadgeServedTier>): BadgeGuide {
        val held = count.coerceAtLeast(0)
        val rungs = GameBadgeTiers.materials.map { material ->
            val reachedAt = served.firstOrNull { it.threshold == material.threshold }?.reachedAt
            BadgeRung(
                threshold = material.threshold,
                material = material.key,
                ribbon = material.ribbon,
                reached = held >= material.threshold || reachedAt != null,
                reachedAt = reachedAt,
            )
        }
        val top = rungs.lastOrNull { it.reached }
        val upcoming = rungs.firstOrNull { !it.reached && (top == null || it.threshold > top.threshold) }
        return BadgeGuide(
            axis = axis,
            family = axis.family,
            count = held,
            rungs = rungs,
            stars = rungs.count { it.reached },
            reached = top?.let {
                BadgeReached(
                    threshold = it.threshold,
                    material = it.material,
                    reason = if (held >= it.threshold) BadgeReachReason.ThresholdCrossed else BadgeReachReason.Served,
                    reachedAt = it.reachedAt,
                )
            },
            next = upcoming?.let { BadgeNextStar(it.threshold, it.material, (it.threshold - held).coerceAtLeast(0)) },
        )
    }

    /** Le guide d'un axe de la progression résolue : ses paliers datés sont les traces servies. */
    public fun resolve(progress: EngagementAxisProgress): BadgeGuide = resolve(
        axis = progress.axis,
        count = progress.scale.value,
        served = progress.scale.tiers.mapNotNull { tier -> tier.reachedAt?.let { BadgeServedTier(tier.threshold, it) } },
    )

    /** Les badges par famille dans l'ordre déclaré, l'ordre du catalogue dans chacune ; une famille vide ne paraît pas. */
    public fun byFamily(guides: List<BadgeGuide>): List<BadgeGuideFamilyGroup> = EngagementAxisFamily.entries.mapNotNull { family ->
        guides.filter { it.family == family }
            .sortedBy { it.axis.ordinal }
            .takeIf { it.isNotEmpty() }
            ?.let { BadgeGuideFamilyGroup(family, it) }
    }

    /** Les vingt médailles d'un compte neuf, par famille — ce que le carnet des règles décrit. */
    public val catalog: List<BadgeGuideFamilyGroup>
        get() = byFamily(EngagementAxisKey.entries.map { resolve(it, count = 0, served = emptyList()) })
}
