package me.meeshy.ui.format

import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.time.RelativeTimeLongFormat
import me.meeshy.sdk.model.time.RelativeTimeLongLabel

/**
 * The localized wording for each rung of the *long* (detail-surface) relative-time ladder,
 * supplied by the caller from the app's string resources so [RelativeTimeLongText] stays free of
 * any Android dependency and fully JVM-testable — the same injection pattern as [RelativeTimeStrings].
 *
 * Each `*Ago` template carries a single `%d` placeholder for the numeric value (e.g. `"il y a %d min"`).
 * [now] and [yesterday] are bare words; the absolute-date rung needs no template (it renders from
 * the viewer's [Locale] via the shared [formatAbsoluteDate]).
 */
data class RelativeTimeLongStrings(
    val now: String,
    val yesterday: String,
    val secondsAgo: String,
    val minutesAgo: String,
    val hoursAgo: String,
    val daysAgo: String,
    val weeksAgo: String,
    val monthsAgo: String,
)

/**
 * Renders the *long* relative-time label used on detail surfaces — the contact / participant
 * "last seen" line, friend-request timestamps, message detail — the `maintenant / il y a 5 min /
 * hier / il y a 3j / date` framing (iOS `RelativeTimeFormatter.longString`).
 *
 * The threshold + calendar-day ladder is not re-implemented here: [long] delegates to
 * [RelativeTimeLongFormat.label] (the single source of truth, incl. the `Yesterday` special case
 * and the zone-aware day boundaries) and only maps the returned [RelativeTimeLongLabel] rung to its
 * localized [RelativeTimeLongStrings] template. The absolute-date rung reuses the very same
 * [formatAbsoluteDate] as the compact [RelativeTimeFormat.short], so the two formatters can never
 * disagree on how an older-than-three-months instant reads.
 */
object RelativeTimeLongText {

    /**
     * A detail-surface label for [epochMillis] as of [referenceMillis], using [zone] for the
     * calendar-day boundaries + the absolute-date fallback and [strings] for the localized wording.
     */
    fun long(
        epochMillis: Long,
        referenceMillis: Long,
        zone: ZoneId,
        locale: Locale,
        strings: RelativeTimeLongStrings,
    ): String = when (val label = RelativeTimeLongFormat.label(epochMillis, referenceMillis, zone)) {
        RelativeTimeLongLabel.Now -> strings.now
        RelativeTimeLongLabel.Yesterday -> strings.yesterday
        is RelativeTimeLongLabel.AgoSeconds -> format(strings.secondsAgo, label.value, locale)
        is RelativeTimeLongLabel.AgoMinutes -> format(strings.minutesAgo, label.value, locale)
        is RelativeTimeLongLabel.AgoHours -> format(strings.hoursAgo, label.value, locale)
        is RelativeTimeLongLabel.AgoDays -> format(strings.daysAgo, label.value, locale)
        is RelativeTimeLongLabel.AgoWeeks -> format(strings.weeksAgo, label.value, locale)
        is RelativeTimeLongLabel.AgoMonths -> format(strings.monthsAgo, label.value, locale)
        is RelativeTimeLongLabel.AbsoluteDate ->
            formatAbsoluteDate(label.epochMillis, referenceMillis, zone, locale)
    }

    private fun format(template: String, value: Int, locale: Locale): String =
        String.format(locale, template, value)
}
