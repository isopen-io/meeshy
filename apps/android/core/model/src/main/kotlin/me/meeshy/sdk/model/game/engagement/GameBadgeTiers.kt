package me.meeshy.sdk.model.game.engagement

/**
 * Les badges d'accumulation à sept paliers — MIROIR de `packages/shared/utils/game/badge-tiers.ts` et de
 * `GameBadgeTiers` (`GameRarity.swift`). Cuivre 1, Bronze 10, Argent 50, Or 100, Platine 500, Obsidienne 1 000,
 * Prisme 5 000.
 */
public enum class BadgeMaterialKey { CUIVRE, BRONZE, ARGENT, OR, PLATINE, OBSIDIENNE, PRISME }

public data class BadgeMaterial(val threshold: Int, val key: BadgeMaterialKey) {
    /** Un ruban à partir de l'Or. */
    val ribbon: Boolean get() = key.ordinal >= BadgeMaterialKey.OR.ordinal

    /** L'émail irisé du Prisme suit l'inclinaison du téléphone. */
    val iridescent: Boolean get() = key == BadgeMaterialKey.PRISME
}

/** La médaille en creux d'un badge éteint : ce qu'il manque pour la rallumer. */
public data class BadgeImprint(val extinguished: Boolean, val missing: Int)

public object GameBadgeTiers {
    public val materials: List<BadgeMaterial> = listOf(
        BadgeMaterial(1, BadgeMaterialKey.CUIVRE),
        BadgeMaterial(10, BadgeMaterialKey.BRONZE),
        BadgeMaterial(50, BadgeMaterialKey.ARGENT),
        BadgeMaterial(100, BadgeMaterialKey.OR),
        BadgeMaterial(500, BadgeMaterialKey.PLATINE),
        BadgeMaterial(1000, BadgeMaterialKey.OBSIDIENNE),
        BadgeMaterial(5000, BadgeMaterialKey.PRISME),
    )

    /** La matière du palier, `null` pour un seuil qui n'en est pas un. */
    public fun materialOfThreshold(threshold: Int): BadgeMaterialKey? =
        materials.firstOrNull { it.threshold == threshold }?.key

    /** La matière du plus haut palier que le compteur couvre, `null` en dessous du premier. */
    public fun materialReached(count: Int): BadgeMaterialKey? =
        materials.lastOrNull { count.coerceAtLeast(0) >= it.threshold }?.key

    /** `true` pour 1 000 et 5 000 : les paliers qu'un ancien client ne connaît pas. */
    public fun isExtended(threshold: Int): Boolean =
        threshold !in EngagementCatalog.legacyBadgeThresholds && threshold in EngagementCatalog.badgeThresholds

    /** Les paliers à servir : les cinq d'origine à un client qui ignore les nouveaux. */
    public fun servedThresholds(knowsExtendedTiers: Boolean): List<Int> =
        if (knowsExtendedTiers) EngagementCatalog.badgeThresholds else EngagementCatalog.legacyBadgeThresholds

    /** Ce qu'il manque pour rallumer un badge tenu à ce palier — « −37 » sur l'empreinte. */
    public fun imprint(count: Int, threshold: Int): BadgeImprint {
        val missing = (threshold - count.coerceAtLeast(0)).coerceAtLeast(0)
        return BadgeImprint(extinguished = missing > 0, missing = missing)
    }
}
