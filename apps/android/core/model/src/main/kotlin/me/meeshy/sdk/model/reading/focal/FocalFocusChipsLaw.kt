package me.meeshy.sdk.model.reading.focal

/**
 * Les lois pures de la bande de puces de l'élu Focal (miroir de `FocalRow.focusFlagCodes` et de
 * `FocalScrollPerspective.focusChipFillOpacity` côté iOS) : quels drapeaux tiennent dans la bande,
 * et de quelle teinte se lave le fond d'une puce.
 */
public object FocalFocusChipsLaw {

    /** Maintenir une réaction ouvre « qui a réagi » après 0,4 s (iOS `LongPressGesture(minimumDuration: 0.4)`). */
    public const val REACTION_LONG_PRESS_MS: Long = 400L

    /**
     * Les drapeaux gardés, dans l'ordre reçu, dédoublonnés sans égard à la casse et bornés à
     * [limit] ; la langue active ([activeCode]) reste toujours visible : hors fenêtre, elle prend la
     * tête et chasse le dernier.
     */
    public fun flagWindow(codes: List<String>, activeCode: String?, limit: Int): List<String> {
        val seen = HashSet<String>()
        val ordered = codes.filter { seen.add(it.lowercase()) }
        if (limit <= 0 || ordered.size <= limit) return ordered
        val kept = ordered.take(limit)
        val active = activeCode?.takeIf { it.isNotBlank() } ?: return kept
        if (kept.any { it.equals(active, ignoreCase = true) }) return kept
        val match = ordered.firstOrNull { it.equals(active, ignoreCase = true) } ?: return kept
        return listOf(match) + kept.dropLast(1)
    }

    /** Opacité du lavis d'accent d'une puce (iOS `focusChipFillOpacity`). */
    public fun fillOpacity(isDark: Boolean, isActive: Boolean): Float = when {
        isDark && !isActive -> 0.18f
        !isDark && !isActive -> 0.14f
        isDark -> 0.42f
        else -> 0.34f
    }
}
