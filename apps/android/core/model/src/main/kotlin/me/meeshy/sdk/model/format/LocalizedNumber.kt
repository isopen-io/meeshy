package me.meeshy.sdk.model.format

import java.util.Locale

/**
 * Les nombres que l'application dit et montre, écrits dans la locale du lecteur — miroir de
 * `LocalizedNumber` iOS. `"$n"` grave des chiffres latins ; l'arabe s'écrit en chiffres
 * arabo-indiens, et une valeur d'accessibilité ne doit jamais être l'abrégé affiché.
 */
public object LocalizedNumber {

    public enum class DurationClock { MINUTE_SECOND, PADDED_MINUTE_SECOND, HOUR_MINUTE_SECOND }

    /** Le compte exact, groupé et dans le système de chiffres du lecteur : « 1 234 » / « 1,234 » / « ١٬٢٣٤ ». */
    public fun exact(value: Long, locale: Locale): String {
        val symbols = NumberSymbols.forLocale(locale)
        val magnitude = if (value < 0) -(value + 1) + 1 else value
        val grouped = magnitude.toString().reversed().chunked(3).joinToString(symbols.grouping.toString()).reversed()
        return symbols.digits(if (value < 0) "-$grouped" else grouped)
    }

    public fun exact(value: Int, locale: Locale): String = exact(value.toLong(), locale)

    /** Un pourcentage entier (50 pour 50 %) : glyphe et espacement de la locale. */
    public fun percent(value: Int, locale: Locale): String {
        val symbols = NumberSymbols.forLocale(locale)
        return symbols.percentPattern.replace("%s", symbols.digits(value.toString()))
    }

    /** Secondes entières, positives, bornées : non fini et négatif donnent 0. */
    public fun wholeSeconds(seconds: Double): Int =
        if (!seconds.isFinite() || seconds <= 0.0) 0 else seconds.coerceAtMost(Int.MAX_VALUE.toDouble()).toInt()

    public fun duration(seconds: Double, clock: DurationClock = DurationClock.MINUTE_SECOND, locale: Locale): String =
        duration(wholeSeconds(seconds), clock, locale)

    /** La durée montrée : « 2:05 », « 02:05 » ou « 1:05:00 ». Les minutes s'accumulent (« 61:35 »). */
    public fun duration(seconds: Int, clock: DurationClock = DurationClock.MINUTE_SECOND, locale: Locale): String {
        val total = seconds.coerceAtLeast(0)
        val text = when (clock) {
            DurationClock.MINUTE_SECOND -> "${total / 60}:${two(total % 60)}"
            DurationClock.PADDED_MINUTE_SECOND -> "${two(total / 60)}:${two(total % 60)}"
            DurationClock.HOUR_MINUTE_SECOND -> "${total / 3600}:${two(total % 3600 / 60)}:${two(total % 60)}"
        }
        return NumberSymbols.forLocale(locale).digits(text)
    }

    /** La durée dite : « 2 minutes 5 secondes », jamais « 2:05 » ; les unités nulles sont omises. */
    public fun spokenDuration(seconds: Int, locale: Locale): String {
        val total = seconds.coerceAtLeast(0)
        val units = SpokenUnits.forLanguage(locale.language)
        val parts = listOf(total / 3600 to units.hour, total % 3600 / 60 to units.minute, total % 60 to units.second)
            .filter { (value, _) -> value > 0 }
            .ifEmpty { listOf(0 to units.second) }
        return parts.joinToString(" ") { (value, unit) -> unit.render(value, locale) }
    }

    public fun spokenDuration(seconds: Double, locale: Locale): String = spokenDuration(wholeSeconds(seconds), locale)

    private fun two(value: Int): String = value.toString().padStart(2, '0')

    private class SpokenUnit(val one: String, val other: String, val dual: String? = null, val few: String? = null) {
        fun render(value: Int, locale: Locale): String = when {
            dual != null && value == 2 -> dual
            few != null && value in 3..10 -> "${exact(value, locale)} $few"
            value == 1 -> "${exact(value, locale)} $one"
            else -> "${exact(value, locale)} $other"
        }
    }

    private class SpokenUnits(val hour: SpokenUnit, val minute: SpokenUnit, val second: SpokenUnit) {
        companion object {
            private val en = SpokenUnits(SpokenUnit("hour", "hours"), SpokenUnit("minute", "minutes"), SpokenUnit("second", "seconds"))
            private val table = mapOf(
                "en" to en,
                "fr" to SpokenUnits(SpokenUnit("heure", "heures"), SpokenUnit("minute", "minutes"), SpokenUnit("seconde", "secondes")),
                "es" to SpokenUnits(SpokenUnit("hora", "horas"), SpokenUnit("minuto", "minutos"), SpokenUnit("segundo", "segundos")),
                "pt" to SpokenUnits(SpokenUnit("hora", "horas"), SpokenUnit("minuto", "minutos"), SpokenUnit("segundo", "segundos")),
                "de" to SpokenUnits(SpokenUnit("Stunde", "Stunden"), SpokenUnit("Minute", "Minuten"), SpokenUnit("Sekunde", "Sekunden")),
                "it" to SpokenUnits(SpokenUnit("ora", "ore"), SpokenUnit("minuto", "minuti"), SpokenUnit("secondo", "secondi")),
                "ar" to SpokenUnits(
                    SpokenUnit("ساعة", "ساعة", "ساعتان", "ساعات"),
                    SpokenUnit("دقيقة", "دقيقة", "دقيقتان", "دقائق"),
                    SpokenUnit("ثانية", "ثانية", "ثانيتان", "ثوانٍ"),
                ),
            )
            fun forLanguage(language: String): SpokenUnits = table[language] ?: en
        }
    }
}
