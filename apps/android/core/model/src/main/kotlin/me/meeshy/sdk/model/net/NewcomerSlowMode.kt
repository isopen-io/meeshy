package me.meeshy.sdk.model.net

import kotlin.math.ceil

/**
 * **Le mode lent des nouveaux comptes** (#7740, #7759) : un compte de moins de 24 h écrit un message toutes les 30 s.
 * Miroir de `NewcomerSlowMode` (iOS). Le refus est TEMPORAIRE — `429` + `code: "NEWCOMER_SLOW_MODE"` + l'en-tête
 * `Retry-After` (REST) ou `retryAfter` dans l'enveloppe : il ne se rejoue pas en silence, l'auteur doit savoir pourquoi
 * son message ne part pas et dans combien de temps il peut le renvoyer.
 */
public data class NewcomerSlowMode(val retryAfterSeconds: Int) {

    public companion object {
        public const val CODE: String = "NEWCOMER_SLOW_MODE"
        public const val MAX_SECONDS: Double = 86_400.0

        /**
         * Le refus d'une réponse REST, `null` pour toute autre. L'en-tête `Retry-After` (secondes) fait foi ; à défaut,
         * le `retryAfter` de l'enveloppe ; à défaut, une seconde. Jamais moins d'une seconde.
         */
        public fun from(
            statusCode: Int,
            code: String?,
            retryAfterHeader: String?,
            envelopeRetryAfter: Double?,
        ): NewcomerSlowMode? {
            if (statusCode != 429 || code != CODE) return null
            return NewcomerSlowMode(seconds(retryAfterHeader?.trim()?.toDoubleOrNull() ?: envelopeRetryAfter))
        }

        /** Secondes entières, arrondies au-dessus, bornées à [1 ; 86 400] ; illisible ou infini = une seconde. */
        public fun seconds(raw: Double?): Int {
            val value = raw?.takeIf { it.isFinite() } ?: return 1
            return ceil(value.coerceIn(1.0, MAX_SECONDS)).toInt()
        }
    }
}
