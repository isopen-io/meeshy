package me.meeshy.sdk.model

/**
 * Selectable duration for a timed live-location share — port of iOS
 * `LiveLocationDuration` (`LocationModels.swift`): 15 min, 30 min, 1 h, 2 h, 8 h.
 *
 * iOS carries a hard-coded French `displayText`; the Android render defers the label
 * to a localised string resource (EN/FR/ES/PT) app-side, so the enum stays a pure,
 * i18n-agnostic value — just the minute magnitude and the derived deadline offset.
 */
enum class LiveLocationDuration(val minutes: Int) {
    FIFTEEN_MINUTES(15),
    THIRTY_MINUTES(30),
    ONE_HOUR(60),
    TWO_HOURS(120),
    EIGHT_HOURS(480);

    /** The share window expressed in milliseconds — the offset added to the start clock. */
    val durationMillis: Long get() = minutes * 60_000L

    companion object {
        /** The picker's initial selection — the shortest window, mirroring iOS's first case. */
        val DEFAULT: LiveLocationDuration = FIFTEEN_MINUTES

        /**
         * Resolves the enum case for a raw minute count (e.g. a `durationMinutes` field
         * carried on a `LiveLocationStartedEvent`), or `null` when no case matches — the
         * caller decides whether to fall back to [DEFAULT].
         */
        fun fromMinutes(minutes: Int): LiveLocationDuration? =
            entries.firstOrNull { it.minutes == minutes }
    }
}
