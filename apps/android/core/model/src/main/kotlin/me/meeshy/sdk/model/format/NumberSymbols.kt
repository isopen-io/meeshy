package me.meeshy.sdk.model.format

import java.util.Locale

/**
 * Les symboles numériques d'une des sept langues de l'application (en, fr, es, pt, de, it, ar),
 * déclarés en TABLE pure plutôt que lus d'`java.text` : la JVM des tests et l'ICU d'Android ne
 * s'accordent pas sur le système de chiffres de l'arabe, et un témoin qui dépend de la machine
 * n'est pas un témoin. Toute autre langue retombe sur l'anglais.
 */
public data class NumberSymbols(
    val decimal: Char,
    val grouping: Char,
    val nativeDigits: Boolean,
    val percentPattern: String,
) {
    public fun digits(ascii: String): String =
        if (!nativeDigits) ascii else ascii.map { if (it in '0'..'9') ARABIC_INDIC_ZERO + (it - '0') else it }.joinToString("")

    public companion object {
        private const val ARABIC_INDIC_ZERO = '٠'
        private const val NBSP = ' '
        private const val NNBSP = ' '

        private val english = NumberSymbols('.', ',', false, "%s%")
        private val bySymbols: Map<String, NumberSymbols> = mapOf(
            "en" to english,
            "fr" to NumberSymbols(',', NNBSP, false, "%s${NBSP}%"),
            "es" to NumberSymbols(',', '.', false, "%s${NBSP}%"),
            "pt" to NumberSymbols(',', '.', false, "%s%"),
            "de" to NumberSymbols(',', '.', false, "%s${NBSP}%"),
            "it" to NumberSymbols(',', '.', false, "%s%"),
            "ar" to NumberSymbols('٫', '٬', true, "%s٪؜"),
        )

        public fun forLocale(locale: Locale): NumberSymbols = bySymbols[locale.language] ?: english
    }
}
