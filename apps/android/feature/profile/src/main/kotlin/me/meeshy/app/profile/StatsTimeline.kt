package me.meeshy.app.profile

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.TimelinePoint
import kotlin.math.roundToInt

/**
 * One day on the activity sparkline — the raw (clamped) message count, its peak-
 * normalized height in `0f..1f` (for a fixed-height chart) and a compact `DD/MM`
 * axis label. Port of a point in the iOS `StatsTimelineChart` line/area mark.
 */
@Immutable
data class TimelineBar(
    val date: String,
    val label: String,
    val messages: Int,
    val normalized: Float,
)

/**
 * The activity timeline projected for rendering — the ordered per-day bars plus
 * the summary figures (peak day, total, per-day average, active-day count). Pure
 * data so the Compose sparkline stays dumb and every derivation is unit-testable.
 * The Android analogue of the iOS `UserStatsViewModel.timeline` feeding
 * `StatsTimelineChart`.
 */
@Immutable
data class StatsTimelinePresentation(
    val bars: List<TimelineBar>,
    val peak: Int,
    val total: Int,
    val averagePerDay: Int,
    val activeDays: Int,
    val hasActivity: Boolean,
)

/**
 * Projects a raw daily-activity [TimelinePoint] series into a
 * [StatsTimelinePresentation]. The SSOT the profile activity sparkline renders.
 * Pure and deterministic (no clock, no I/O).
 *
 * Contract:
 * - An **empty** series returns `null` — there is nothing to chart (mirrors the
 *   iOS `if !timeline.isEmpty` guard). A non-empty all-zero series still returns
 *   a presentation (a flat line with `hasActivity == false`).
 * - Every count is floored at `0` so a malformed negative payload can never
 *   invert a bar or the peak.
 * - Each bar's [TimelineBar.normalized] is its count divided by the peak, so the
 *   tallest day is `1f` and a zero-peak series is uniformly `0f` (no divide-by-
 *   zero).
 * - The order of the input is preserved (the gateway emits oldest → newest).
 */
object StatsTimelineBuilder {

    fun build(points: List<TimelinePoint>): StatsTimelinePresentation? {
        if (points.isEmpty()) return null

        val counts = points.map { it.messages.coerceAtLeast(0) }
        val peak = counts.max()
        val total = counts.sum()

        val bars = points.mapIndexed { index, point ->
            val count = counts[index]
            TimelineBar(
                date = point.date,
                label = shortDate(point.date),
                messages = count,
                normalized = if (peak > 0) count.toFloat() / peak else 0f,
            )
        }

        return StatsTimelinePresentation(
            bars = bars,
            peak = peak,
            total = total,
            averagePerDay = (total.toDouble() / points.size).roundToInt(),
            activeDays = counts.count { it > 0 },
            hasActivity = total > 0,
        )
    }
}

/**
 * A compact `DD/MM` axis label from an ISO `YYYY-MM-DD` date. Port of the iOS
 * `StatsTimelineChart.shortDate`: a malformed string (not exactly three `-`
 * separated parts) degrades to the raw input rather than throwing.
 */
internal fun shortDate(date: String): String {
    val parts = date.split("-")
    if (parts.size != 3) return date
    return "${parts[2]}/${parts[1]}"
}
