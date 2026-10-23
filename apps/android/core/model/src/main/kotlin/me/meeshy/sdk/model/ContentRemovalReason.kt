package me.meeshy.sdk.model

/**
 * Le motif d'un retrait par la modération (#11151) — miroir de `ContentRemovalPolicy.normalizedReason`
 * (iOS) : rogné, puis entre 3 et 500 caractères. Au-delà ou en deçà, aucun appel ne part.
 */
object ContentRemovalReason {
    const val MIN_LENGTH = 3
    const val MAX_LENGTH = 500

    /** Le motif tel qu'il part, ou `null` quand il est hors bornes. */
    fun normalized(raw: String): String? {
        val trimmed = raw.trim()
        return trimmed.takeIf { it.length in MIN_LENGTH..MAX_LENGTH }
    }
}
