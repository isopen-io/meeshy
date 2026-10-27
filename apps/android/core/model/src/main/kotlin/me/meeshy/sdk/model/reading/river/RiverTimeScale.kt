package me.meeshy.sdk.model.reading.river

import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.time.temporal.WeekFields
import java.util.Locale
import kotlin.math.abs
import kotlin.math.ceil

/**
 * R-3 — **l'axe des ordonnées est le temps.** Traduit les rangs servis par la loi
 * (`RiverBubble.rank` + `createdAtMs`) en une échelle lisible : une UNITÉ choisie d'après
 * l'amplitude RÉELLE du fil, des GRADUATIONS aux frontières de cette unité, et la correspondance
 * dans les deux sens entre une position sur la piste (fraction 0…1 du TEMPS) et un rang.
 * Miroir de `RiverTimeScale.swift`. Zéro horloge : fuseau et locale entrent en paramètre.
 */
class RiverTimeScale private constructor(
    val unit: Grain,
    val ticks: List<Tick>,
    val startMs: Double,
    val endMs: Double,
    private val ranks: List<RankTime>,
    private val zone: ZoneId,
    private val locale: Locale,
) {

    enum class Grain { HOUR, DAY, WEEK, MONTH, YEAR }

    /** Une graduation. [rank] : premier rang qui tombe dans la période ; [fraction] : fraction du TEMPS. */
    data class Tick(val rank: Int, val fraction: Double, val label: String)

    /** Un rang et son instant — ce que la loi sert, rien de plus. */
    data class RankTime(val rank: Int, val timeMs: Double)

    private val spanMs: Double get() = endMs - startMs

    /** Fraction (0…1) de la piste où vit un rang — linéaire dans le TEMPS. */
    fun fraction(ofRank: Int): Double {
        if (spanMs <= 0) return 0.0
        val entry = ranks.firstOrNull { it.rank == ofRank } ?: ranks.minByOrNull { abs(it.rank - ofRank) } ?: return 0.0
        return ((entry.timeMs - startMs) / spanMs).coerceIn(0.0, 1.0)
    }

    /** Le premier rang dont l'instant atteint celui de la piste — le dernier si la poignée dépasse tout. */
    fun rank(atFraction: Double): Int {
        val target = startMs + atFraction.coerceIn(0.0, 1.0) * spanMs
        return ranks.firstOrNull { it.timeMs >= target }?.rank ?: ranks.lastOrNull()?.rank ?: 0
    }

    /** Le libellé de l'instant sous la poignée, dans l'unité de l'échelle. */
    fun label(atFraction: Double): String = labelAtMs(startMs + atFraction.coerceIn(0.0, 1.0) * spanMs)

    private fun labelAtMs(ms: Double): String =
        DateTimeFormatter.ofPattern(pattern(unit), locale)
            .format(ZonedDateTime.ofInstant(Instant.ofEpochMilli(ms.toLong()), zone))

    /** Première frontière d'unité STRICTEMENT après [ms] (fin de la période qui le contient). */
    private fun boundaryAfter(ms: Double): Double {
        val at = ZonedDateTime.ofInstant(Instant.ofEpochMilli(ms.toLong()), zone)
        val end = when (unit) {
            Grain.HOUR -> at.truncatedTo(java.time.temporal.ChronoUnit.HOURS).plusHours(1)
            Grain.DAY -> at.toLocalDate().plusDays(1).atStartOfDay(zone)
            Grain.WEEK -> at.toLocalDate().with(TemporalAdjusters.previousOrSame(firstDayOfWeek(locale))).plusWeeks(1).atStartOfDay(zone)
            Grain.MONTH -> at.toLocalDate().withDayOfMonth(1).plusMonths(1).atStartOfDay(zone)
            Grain.YEAR -> at.toLocalDate().withDayOfYear(1).plusYears(1).atStartOfDay(zone)
        }
        return end.toInstant().toEpochMilli().toDouble()
    }

    private fun boundaryTicks(): List<Tick> {
        val all = generateSequence(boundaryAfter(startMs)) { boundaryAfter(it) }
            .take(STEP_LIMIT)
            .takeWhile { it <= endMs }
            .map { boundaryMs ->
                val fraction = (boundaryMs - startMs) / spanMs
                Tick(rank(fraction), fraction, labelAtMs(boundaryMs))
            }
            .toList()
        if (all.size <= MAX_TICKS) return all
        val every = ceil(all.size.toDouble() / MAX_TICKS).toInt()
        return all.filterIndexed { index, _ -> index % every == 0 }
    }

    companion object {
        const val HOUR_MS: Double = 60.0 * 60.0 * 1000.0
        const val DAY_MS: Double = 24.0 * HOUR_MS

        /** Jamais plus de 8 graduations : au-delà, une sur N. */
        const val MAX_TICKS: Int = 8
        private const val STEP_LIMIT: Int = 10_000

        /**
         * L'unité qui GRADUE l'amplitude sans la noyer : jusqu'à un jour et demi des heures ; trois
         * semaines des jours ; quatre mois des semaines ; deux ans des mois ; au-delà des années.
         */
        fun unit(forSpanMs: Double): Grain = when {
            forSpanMs < 36 * HOUR_MS -> Grain.HOUR
            forSpanMs < 21 * DAY_MS -> Grain.DAY
            forSpanMs < 120 * DAY_MS -> Grain.WEEK
            forSpanMs < 730 * DAY_MS -> Grain.MONTH
            else -> Grain.YEAR
        }

        /** `null` quand il n'y a rien à graduer : moins de deux rangs, ou un fil écrit au même instant. */
        fun resolve(ranks: List<RankTime>, zone: ZoneId, locale: Locale): RiverTimeScale? {
            val sorted = ranks.sortedBy { it.rank }
            val first = sorted.firstOrNull() ?: return null
            val last = sorted.last()
            if (last.timeMs <= first.timeMs) return null
            val unit = unit(last.timeMs - first.timeMs)
            val bare = RiverTimeScale(unit, emptyList(), first.timeMs, last.timeMs, sorted, zone, locale)
            return RiverTimeScale(unit, bare.boundaryTicks(), first.timeMs, last.timeMs, sorted, zone, locale)
        }

        private fun pattern(unit: Grain): String = when (unit) {
            Grain.HOUR -> "HH:mm"
            Grain.DAY, Grain.WEEK -> "d MMM"
            Grain.MONTH -> "MMM yyyy"
            Grain.YEAR -> "yyyy"
        }

        private fun firstDayOfWeek(locale: Locale): DayOfWeek = WeekFields.of(locale).firstDayOfWeek
    }
}
