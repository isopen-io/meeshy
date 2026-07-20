package me.meeshy.ui.format

import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.time.RelativeTime
import me.meeshy.sdk.model.time.RelativeTimeUnit

/**
 * The localized wording for each rung of the compact relative-time ladder, supplied by the
 * caller from the app's string resources so [RelativeTimeFormat] stays free of any Android
 * dependency and fully JVM-testable — the same injection pattern as `CallTimeLabel`.
 *
 * Each `*Ago` template carries a single `%d` placeholder for the numeric value (e.g. `"%d min"`).
 * The absolute-date rung needs no template: it is rendered directly from the viewer's [Locale].
 */
data class RelativeTimeStrings(
    val now: String,
    val secondsAgo: String,
    val minutesAgo: String,
    val hoursAgo: String,
    val daysAgo: String,
    val weeksAgo: String,
    val monthsAgo: String,
)

/**
 * Renders the compact relative-time label shown on conversation rows, feed posts, notification
 * rows and presence lines — the view-layer wording atop the pure [RelativeTime] classifier.
 *
 * The threshold ladder is not re-implemented here: [short] delegates to [RelativeTime.classify]
 * (the single source of truth) and only maps the returned [RelativeTimeUnit] rung to its
 * localized [RelativeTimeStrings] template, so a future/clock-skewed instant, the exact rung
 * boundaries and the `Long`-arithmetic overflow safety are all inherited rather than duplicated.
 *
 * Faithful to the iOS `RelativeTimeFormatter` short form (`maintenant / Nmin / Nh / Nj / Nsem`),
 * with the three-months-or-older rung falling back to the locale-aware absolute date (the year
 * shown only when it differs from the reference year, matching `CallTimeLabel`).
 */
object RelativeTimeFormat {

    /**
     * A compact label for [epochMillis] as of [referenceMillis], using [zone]/[locale] for the
     * absolute-date fallback and [strings] for the localized rung wording.
     */
    fun short(
        epochMillis: Long,
        referenceMillis: Long,
        zone: ZoneId,
        locale: Locale,
        strings: RelativeTimeStrings,
    ): String = when (val unit = RelativeTime.classify(epochMillis, referenceMillis)) {
        RelativeTimeUnit.Now -> strings.now
        is RelativeTimeUnit.Seconds -> format(strings.secondsAgo, unit.value, locale)
        is RelativeTimeUnit.Minutes -> format(strings.minutesAgo, unit.value, locale)
        is RelativeTimeUnit.Hours -> format(strings.hoursAgo, unit.value, locale)
        is RelativeTimeUnit.Days -> format(strings.daysAgo, unit.value, locale)
        is RelativeTimeUnit.Weeks -> format(strings.weeksAgo, unit.value, locale)
        is RelativeTimeUnit.Months -> format(strings.monthsAgo, unit.value, locale)
        is RelativeTimeUnit.AbsoluteDate ->
            formatAbsoluteDate(unit.epochMillis, referenceMillis, zone, locale)
    }

    private fun format(template: String, value: Int, locale: Locale): String =
        String.format(locale, template, value)
}
