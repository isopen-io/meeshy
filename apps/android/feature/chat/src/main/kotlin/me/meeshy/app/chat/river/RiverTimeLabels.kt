package me.meeshy.app.chat.river

import android.text.format.DateFormat
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import me.meeshy.sdk.model.reading.river.RiverTimeScale

/**
 * Les libellés de l'échelle du temps, LOCALISÉS comme iOS (`setLocalizedDateFormatFromTemplate`) :
 * en anglais « Oct 27 », en français « 27 oct. ». `RiverTimeScale` (`:core:model`) garde les
 * rangs, les fractions et l'unité — ses formats fixes (`HH:mm`, `d MMM`) ne servent pas l'écran.
 * Le patron localisé est demandé à la plateforme par SQUELETTE ([skeleton]) ; il est injectable pour
 * que la règle se prouve sans Android.
 */
internal class RiverTimeLabels(
    private val scale: RiverTimeScale,
    private val zone: ZoneId = ZoneId.systemDefault(),
    private val locale: Locale = Locale.getDefault(),
    patternFor: (skeleton: String, locale: Locale) -> String = { skeleton, loc ->
        DateFormat.getBestDateTimePattern(loc, skeleton)
    },
) {
    private val formatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern(patternFor(skeleton(scale.unit), locale), locale)

    fun tick(tick: RiverTimeScale.Tick): String = at(tick.fraction)

    fun at(fraction: Double): String {
        val ms = scale.startMs + fraction.coerceIn(0.0, 1.0) * (scale.endMs - scale.startMs)
        return formatter.format(ZonedDateTime.ofInstant(Instant.ofEpochMilli(ms.toLong()), zone))
    }

    companion object {
        /** Le squelette demandé à la plateforme pour chaque unité (iOS : `Hm`, `MMMd`, `yMMM`, `y`). */
        fun skeleton(unit: RiverTimeScale.Grain): String = when (unit) {
            RiverTimeScale.Grain.HOUR -> "Hm"
            RiverTimeScale.Grain.DAY, RiverTimeScale.Grain.WEEK -> "MMMd"
            RiverTimeScale.Grain.MONTH -> "yMMM"
            RiverTimeScale.Grain.YEAR -> "y"
        }
    }
}
