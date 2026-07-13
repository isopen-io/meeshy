package me.meeshy.sdk.model.time

/**
 * One rung of the compact relative-time ladder used by conversation-row, feed, notification
 * and presence timestamps. Carries the numeric value but no localized text, so the view layer
 * owns the wording and the absolute-date formatting (port of iOS `RelativeTimeUnit`).
 */
public sealed interface RelativeTimeUnit {
    /** Under [RelativeTime.NOW_THRESHOLD_SECONDS] seconds ago (or in the future). */
    public data object Now : RelativeTimeUnit
    public data class Seconds(val value: Int) : RelativeTimeUnit
    public data class Minutes(val value: Int) : RelativeTimeUnit
    public data class Hours(val value: Int) : RelativeTimeUnit
    public data class Days(val value: Int) : RelativeTimeUnit
    public data class Weeks(val value: Int) : RelativeTimeUnit
    public data class Months(val value: Int) : RelativeTimeUnit

    /** Three months or older — the view renders the localized absolute date of [epochMillis]. */
    public data class AbsoluteDate(val epochMillis: Long) : RelativeTimeUnit
}

/**
 * Pure, locale-agnostic classification of how long ago a timestamp occurred.
 *
 * The thresholds live here as the single source of truth; rendering (localized strings,
 * absolute-date formatting) stays in the UI layer so the model holds no presentation strings.
 * Ladder, matching the product spec: `Now` (under 30 s) → seconds (under a minute) → minutes →
 * hours → days (under a week) → weeks (under a month) → months (under three months) →
 * absolute date (three months or older). Approximations: a month is 30 days, three months 90.
 *
 * Faithful to iOS `RelativeTime.classify`, and surpasses it on two edges the reference leaves
 * implicit: a future / clock-skewed timestamp (a negative interval) collapses to [RelativeTimeUnit.Now]
 * rather than emitting a nonsensical negative count, and the whole ladder runs on [Long] arithmetic
 * so a decades-old timestamp (whose elapsed seconds overflow a 32-bit `Int`) still reaches the
 * absolute-date rung instead of wrapping to a spurious near rung.
 */
public object RelativeTime {
    public const val NOW_THRESHOLD_SECONDS: Long = 30L
    public const val MINUTE_SECONDS: Long = 60L
    public const val HOUR_SECONDS: Long = 3_600L
    public const val DAY_SECONDS: Long = 86_400L
    public const val WEEK_DAYS: Long = 7L
    public const val MONTH_DAYS: Long = 30L
    public const val ABSOLUTE_DAYS: Long = 90L

    /**
     * Classifies the instant [epochMillis] relative to [referenceMillis] (the caller's "now").
     * A negative interval (future or clock skew) collapses to [RelativeTimeUnit.Now].
     */
    public fun classify(epochMillis: Long, referenceMillis: Long): RelativeTimeUnit {
        val seconds = (referenceMillis - epochMillis) / 1_000L
        if (seconds < NOW_THRESHOLD_SECONDS) return RelativeTimeUnit.Now
        if (seconds < MINUTE_SECONDS) return RelativeTimeUnit.Seconds(seconds.toInt())
        if (seconds < HOUR_SECONDS) return RelativeTimeUnit.Minutes((seconds / MINUTE_SECONDS).toInt())
        if (seconds < DAY_SECONDS) return RelativeTimeUnit.Hours((seconds / HOUR_SECONDS).toInt())

        val days = seconds / DAY_SECONDS
        if (days < WEEK_DAYS) return RelativeTimeUnit.Days(days.toInt())
        if (days < MONTH_DAYS) return RelativeTimeUnit.Weeks((days / WEEK_DAYS).toInt())
        if (days < ABSOLUTE_DAYS) return RelativeTimeUnit.Months((days / MONTH_DAYS).toInt())
        return RelativeTimeUnit.AbsoluteDate(epochMillis)
    }
}
