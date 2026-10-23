package me.meeshy.sdk.model.game

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.NumberFormat
import java.util.Locale

/**
 * Les nombres du jeu, écrits par la locale AVANT d'entrer dans la phrase :
 * séparateurs de la langue, chiffres arabes en arabe, un seul trou par nombre.
 * MIROIR de `GameCopy.formatCount` / `compactCount` (iOS).
 *
 * La [Locale] est injectée : aucune lecture de la locale ambiante ici.
 */
public object GameNumberFormat {

    /** Le seuil à partir duquel un texte serré passe au nombre compact. */
    public const val COMPACT_THRESHOLD: Int = 10_000

    private const val NBSP: String = " "

    private class Unit(val divisor: BigDecimal)

    private val units: List<Unit> = listOf(1_000L, 1_000_000L, 1_000_000_000L).map { Unit(BigDecimal.valueOf(it)) }

    /** Les suffixes (millier, million, milliard) par langue ; l'anglais est le repli. */
    private val suffixes: Map<String, List<String>> = mapOf(
        "en" to listOf("K", "M", "B"),
        "fr" to listOf("${NBSP}k", "${NBSP}M", "${NBSP}Md"),
        "es" to listOf("${NBSP}mil", "${NBSP}M", "${NBSP}mil M"),
        "pt" to listOf("${NBSP}mil", "${NBSP}mi", "${NBSP}bi"),
        "de" to listOf("${NBSP}Tsd.", "${NBSP}Mio.", "${NBSP}Mrd."),
        "it" to listOf("${NBSP}k", "${NBSP}Mln", "${NBSP}Mld"),
        "ar" to listOf("${NBSP}ألف", "${NBSP}مليون", "${NBSP}مليار"),
    )

    public fun formatCount(count: Int, locale: Locale): String =
        NumberFormat.getIntegerInstance(locale).format(count.toLong())

    /** « 8,7 k » dès 10 000, le chiffre plein en dessous — pour les textes serrés (bandeau). */
    public fun compactCount(count: Int, locale: Locale): String {
        if (count < COMPACT_THRESHOLD) return formatCount(count, locale)
        val words = suffixes[locale.language.lowercase()] ?: suffixes.getValue("en")
        val number = NumberFormat.getNumberInstance(locale).apply {
            minimumFractionDigits = 0
            maximumFractionDigits = 1
        }
        var index = units.indexOfLast { BigDecimal.valueOf(count.toLong()) >= it.divisor }
        var scaled = scale(count, index)
        while (scaled >= THOUSAND && index < units.lastIndex) {
            index += 1
            scaled = scale(count, index)
        }
        return number.format(scaled) + words[index]
    }

    private val THOUSAND: BigDecimal = BigDecimal(1_000)

    private fun scale(count: Int, index: Int): BigDecimal =
        BigDecimal.valueOf(count.toLong()).divide(units[index].divisor, 1, RoundingMode.HALF_EVEN)
}
