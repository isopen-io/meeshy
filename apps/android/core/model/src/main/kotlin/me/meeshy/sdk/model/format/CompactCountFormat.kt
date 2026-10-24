package me.meeshy.sdk.model.format

import java.math.BigDecimal
import java.math.RoundingMode
import java.util.Locale

/**
 * L'abrégé d'un grand nombre — « 1,5 k » (fr), « 1.5K » (en), « 1,5 mil » (es), « ١٫٥ ألف » (ar) —
 * écrit depuis une table CLDR de la locale du lecteur. Source UNIQUE de l'abrégé sur Android
 * (miroir de `CompactCountLabel.text` iOS) : aucune surface ne réécrit la règle.
 *
 * Règle de précision (celle de `.notation(.compactName)`) : une décimale sous 10 unités du palier,
 * un entier au-delà, jamais de décimale nulle — 1000 donne « 1 k », pas « 1.0k ». Un nombre dont
 * l'arrondi atteint 1000 unités bascule au palier suivant (999 500 donne « 1 M »).
 * Négatifs et valeurs non finies sont bornés à 0.
 *
 * Particularités CLDR : l'allemand et l'italien n'abrègent pas les milliers (« 1.500 »), l'espagnol
 * n'a pas de palier milliard (« 1500 M »).
 *
 * [CompactPrecision.UP_TO_ONE_DECIMAL] garde une décimale à tous les paliers (« 12,3 k ») — miroir
 * de `.precision(.fractionLength(0...1))`, la précision des nombres serrés du jeu (iOS `GameCopy`).
 */
public enum class CompactPrecision { STANDARD, UP_TO_ONE_DECIMAL }

public object CompactCountFormat {

    private data class Tier(val scale: Long, val suffix: String)
    private data class Table(val thousand: Tier?, val million: Tier, val billion: Tier)

    private const val NBSP = " "

    private val english = Table(Tier(1_000L, "K"), Tier(1_000_000L, "M"), Tier(1_000_000_000L, "B"))
    private val tables: Map<String, Table> = mapOf(
        "en" to english,
        "fr" to Table(Tier(1_000L, "${NBSP}k"), Tier(1_000_000L, "${NBSP}M"), Tier(1_000_000_000L, "${NBSP}Md")),
        "es" to Table(Tier(1_000L, "${NBSP}mil"), Tier(1_000_000L, "${NBSP}M"), Tier(1_000_000L, "${NBSP}M")),
        "pt" to Table(Tier(1_000L, "${NBSP}mil"), Tier(1_000_000L, "${NBSP}mi"), Tier(1_000_000_000L, "${NBSP}bi")),
        "de" to Table(null, Tier(1_000_000L, "${NBSP}Mio."), Tier(1_000_000_000L, "${NBSP}Mrd.")),
        "it" to Table(null, Tier(1_000_000L, "${NBSP}Mln"), Tier(1_000_000_000L, "${NBSP}Mrd")),
        "ar" to Table(
            Tier(1_000L, "${NBSP}ألف"),
            Tier(1_000_000L, "${NBSP}مليون"),
            Tier(1_000_000_000L, "${NBSP}مليار"),
        ),
    )

    public fun text(count: Int, locale: Locale, precision: CompactPrecision = CompactPrecision.STANDARD): String =
        text(count.toLong(), locale, precision)

    public fun text(count: Double, locale: Locale): String =
        text(if (count.isFinite()) count.coerceIn(0.0, Long.MAX_VALUE.toDouble()).toLong() else 0L, locale)

    public fun text(count: Long, locale: Locale, precision: CompactPrecision = CompactPrecision.STANDARD): String {
        val symbols = NumberSymbols.forLocale(locale)
        val table = tables[locale.language] ?: english
        val n = count.coerceAtLeast(0L)
        if (n < 1_000L) return symbols.digits(n.toString())
        if (table.thousand == null && n < 1_000_000L) return symbols.digits(grouped(n, symbols.grouping))
        val ladder = listOfNotNull(table.thousand, table.million, table.billion).distinctBy { it.scale to it.suffix }
        val start = ladder.indexOfLast { n >= it.scale }.coerceAtLeast(0)
        val esBillions = table.billion.scale == table.million.scale
        return render(n, ladder, start, symbols, esBillions, precision)
    }

    private fun render(
        n: Long,
        ladder: List<Tier>,
        index: Int,
        symbols: NumberSymbols,
        esBillions: Boolean,
        precision: CompactPrecision,
    ): String {
        val tier = ladder[index]
        if (esBillions && n >= 1_000_000_000L) {
            val millions = BigDecimal(n).divide(BigDecimal(tier.scale)).round(java.math.MathContext(2, RoundingMode.HALF_EVEN))
            return symbols.digits(millions.setScale(0, RoundingMode.HALF_EVEN).toPlainString()) + tier.suffix
        }
        val mantissa = BigDecimal(n).divide(BigDecimal(tier.scale))
        val oneDecimal = precision == CompactPrecision.UP_TO_ONE_DECIMAL || mantissa < BigDecimal.TEN
        val rounded = mantissa.setScale(if (oneDecimal) 1 else 0, RoundingMode.HALF_EVEN)
        if (rounded >= BigDecimal(1_000) && index + 1 < ladder.size) {
            return render(ladder[index + 1].scale, ladder, index + 1, symbols, esBillions, precision)
        }
        val plain = rounded.stripTrailingZeros().toPlainString()
        return symbols.digits(plain.replace('.', symbols.decimal)) + tier.suffix
    }

    private fun grouped(n: Long, separator: Char): String =
        n.toString().reversed().chunked(3).joinToString(separator.toString()).reversed()
}
