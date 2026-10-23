package me.meeshy.sdk.lang

/** La langue dominante qu'un identifieur a reconnue, avec sa confiance dans [0, 1]. */
data class LanguageIdentification(val code: String, val confidence: Double)

/**
 * Un identifieur de langue injectable (ML Kit sur l'appareil, rien sans Play Services). Il rend
 * `null` quand il est indisponible ou en échec : l'appelant retombe alors sur l'heuristique JVM.
 * Il ne lève jamais d'erreur visible.
 */
fun interface LanguageIdentifying {
    suspend fun identify(text: String): LanguageIdentification?

    companion object {
        /** L'identifieur des appareils qui n'en ont pas : toujours indisponible. */
        val Unavailable: LanguageIdentifying = LanguageIdentifying { null }
    }
}
