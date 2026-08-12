package me.meeshy.sdk.model.time

import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * One rung of the *long* (detail-surface) relative-time ladder — the framing used by iOS
 * `RelativeTimeFormatter.longString` for contacts, participants, friend requests and message
 * detail: `maintenant` / `il y a 45s` / `il y a 5 min` / `hier` / `il y a 3j` / `il y a 2sem` /
 * `il y a 2mois`, then the localized absolute date past three months.
 *
 * Like [RelativeTimeUnit] this carries only the numeric value and the *framing intent* (bare
 * `Now`, an `Ago…` wrapper, the `Yesterday` special case, or an absolute date) — never any
 * localized text. The view layer maps each variant to its `time.long.*` template in the five app
 * languages, exactly as iOS keeps the wording (`il y a %@`, `hier`, …) in the formatter's string
 * catalog rather than in the classification primitive.
 */
public sealed interface RelativeTimeLongLabel {
    /** Under [RelativeTime.NOW_THRESHOLD_SECONDS] seconds ago (or in the future) — `maintenant`. */
    public data object Now : RelativeTimeLongLabel

    /** `il y a %ds` — a sub-minute age. */
    public data class AgoSeconds(val value: Int) : RelativeTimeLongLabel

    /** `il y a %d min` — a sub-hour age. */
    public data class AgoMinutes(val value: Int) : RelativeTimeLongLabel

    /** `il y a %dh` — same calendar day, an hour or more ago. */
    public data class AgoHours(val value: Int) : RelativeTimeLongLabel

    /** `hier` — the previous calendar day (a special case, not `il y a 1j`). */
    public data object Yesterday : RelativeTimeLongLabel

    /** `il y a %dj` — two to six calendar days ago. */
    public data class AgoDays(val value: Int) : RelativeTimeLongLabel

    /** `il y a %dsem` — one to four calendar weeks ago. */
    public data class AgoWeeks(val value: Int) : RelativeTimeLongLabel

    /** `il y a %dmois` — one or two calendar months ago (under three months). */
    public data class AgoMonths(val value: Int) : RelativeTimeLongLabel

    /** Three months or older — the view renders the localized absolute date of [epochMillis]. */
    public data class AbsoluteDate(val epochMillis: Long) : RelativeTimeLongLabel
}

/**
 * Pure, locale-agnostic framing of the *long* relative-time label — a faithful port of iOS
 * `RelativeTimeFormatter.longString`, with the localized wording deliberately left UI-side.
 *
 * The sub-hour rungs reuse the same second thresholds as [RelativeTime] (the single source of
 * truth), but from an hour up the ladder switches to **calendar-day** boundaries rather than
 * 24-hour windows: an event at 23:00 seen at 01:00 the next day is `Yesterday`, not `il y a 2h`.
 * That is why this needs a [ZoneId] — the day boundary is the *user's* midnight, so the very same
 * instant can read `hier` in one time zone and `il y a 5h` in another. The day-delta is computed
 * from local-date differences, matching iOS's `calendar.startOfDay` day component.
 *
 * A future / clock-skewed timestamp (a negative interval) collapses to [RelativeTimeLongLabel.Now]
 * rather than emitting a nonsensical negative count, exactly as [RelativeTime.classify] does.
 */
public object RelativeTimeLongFormat {
    /**
     * Frames the instant [epochMillis] relative to [referenceMillis] (the caller's "now"), using
     * [zoneId] for the calendar-day boundaries that decide the `Yesterday`/day/week/month rungs.
     */
    public fun label(
        epochMillis: Long,
        referenceMillis: Long,
        zoneId: ZoneId,
    ): RelativeTimeLongLabel {
        val seconds = (referenceMillis - epochMillis) / 1_000L
        if (seconds < RelativeTime.NOW_THRESHOLD_SECONDS) return RelativeTimeLongLabel.Now
        if (seconds < RelativeTime.MINUTE_SECONDS) {
            return RelativeTimeLongLabel.AgoSeconds(seconds.toInt())
        }
        if (seconds < RelativeTime.HOUR_SECONDS) {
            return RelativeTimeLongLabel.AgoMinutes((seconds / RelativeTime.MINUTE_SECONDS).toInt())
        }

        val epochDate = Instant.ofEpochMilli(epochMillis).atZone(zoneId).toLocalDate()
        val referenceDate = Instant.ofEpochMilli(referenceMillis).atZone(zoneId).toLocalDate()
        val dayDelta = ChronoUnit.DAYS.between(epochDate, referenceDate)

        if (dayDelta <= 0L) {
            return RelativeTimeLongLabel.AgoHours((seconds / RelativeTime.HOUR_SECONDS).toInt())
        }
        if (dayDelta == 1L) return RelativeTimeLongLabel.Yesterday
        if (dayDelta < RelativeTime.WEEK_DAYS) return RelativeTimeLongLabel.AgoDays(dayDelta.toInt())
        if (dayDelta < RelativeTime.MONTH_DAYS) {
            return RelativeTimeLongLabel.AgoWeeks((dayDelta / RelativeTime.WEEK_DAYS).toInt())
        }
        if (dayDelta < RelativeTime.ABSOLUTE_DAYS) {
            return RelativeTimeLongLabel.AgoMonths((dayDelta / RelativeTime.MONTH_DAYS).toInt())
        }
        return RelativeTimeLongLabel.AbsoluteDate(epochMillis)
    }
}
