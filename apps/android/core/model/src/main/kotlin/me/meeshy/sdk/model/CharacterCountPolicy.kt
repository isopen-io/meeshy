package me.meeshy.sdk.model

import kotlin.math.ceil

/** Règle du compteur de caractères — miroir de `CharacterCountLabel` (iOS) : seuil d'alerte et phrases lues. */
public object CharacterCountPolicy {
    private const val DEFAULT_RATIO: Double = 0.8

    public fun resolvedThreshold(limit: Int, warningThreshold: Int? = null): Int =
        warningThreshold ?: ceil(limit * DEFAULT_RATIO).toInt()

    public fun isNearLimit(count: Int, limit: Int, warningThreshold: Int? = null): Boolean =
        count >= resolvedThreshold(limit, warningThreshold)

    public fun visibleText(count: Int, limit: Int, formatNumber: (Int) -> String): String =
        "${formatNumber(count)}/${formatNumber(limit)}"

    /** [template] porte `%1$d` (compte) et `%2$d` (limite) : l'ordre des mots reste celui de la langue. */
    public fun accessibilityText(count: Int, limit: Int, template: String, formatNumber: (Int) -> String): String =
        template.replace("%1\$d", formatNumber(count)).replace("%2\$d", formatNumber(limit))
}
