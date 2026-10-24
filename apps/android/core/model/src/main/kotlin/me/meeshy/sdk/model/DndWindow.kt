package me.meeshy.sdk.model

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset

/**
 * Pure Do-Not-Disturb (quiet-hours) logic for [UserNotificationPreferences] (feature-parity §L).
 *
 * Port of iOS `UserNotificationPreferences.isInDoNotDisturbWindow`. This is the single source
 * of truth read by both the DND schedule editor (time/day rows + the live "quiet hours active"
 * status) and any notification-gating consumer, so it must be:
 *  - total over [UserNotificationPreferences.dndEnabled] (off ⇒ never active),
 *  - correct across the midnight wrap (`22:00 → 08:00` is two disjoint intervals),
 *  - per-day gated (empty [UserNotificationPreferences.dndDays] means "every day"),
 *  - robust to a corrupt persisted `HH:mm` (an unparseable time ⇒ never active, never a crash).
 *
 * Time is modelled as a minute-of-day (`0..1439`) plus an ISO [DayOfWeek] so the core stays
 * pure and timezone-agnostic; the caller supplies the device-local clock reading.
 */
public object DndWindow {

    /** The ISO [DayOfWeek] this DND day denotes. */
    public fun DndDay.toDayOfWeek(): DayOfWeek = when (this) {
        DndDay.MON -> DayOfWeek.MONDAY
        DndDay.TUE -> DayOfWeek.TUESDAY
        DndDay.WED -> DayOfWeek.WEDNESDAY
        DndDay.THU -> DayOfWeek.THURSDAY
        DndDay.FRI -> DayOfWeek.FRIDAY
        DndDay.SAT -> DayOfWeek.SATURDAY
        DndDay.SUN -> DayOfWeek.SUNDAY
    }

    /** The [DndDay] for this ISO [DayOfWeek]. */
    public fun DayOfWeek.toDndDay(): DndDay = when (this) {
        DayOfWeek.MONDAY -> DndDay.MON
        DayOfWeek.TUESDAY -> DndDay.TUE
        DayOfWeek.WEDNESDAY -> DndDay.WED
        DayOfWeek.THURSDAY -> DndDay.THU
        DayOfWeek.FRIDAY -> DndDay.FRI
        DayOfWeek.SATURDAY -> DndDay.SAT
        DayOfWeek.SUNDAY -> DndDay.SUN
    }

    /**
     * Parses a persisted `"HH:mm"` into a minute-of-day (`0..1439`), or `null` when the token
     * is malformed or out of range — so a corrupt stored value degrades to "no window".
     */
    public fun parseMinuteOfDay(hhmm: String): Int? {
        val parts = hhmm.trim().split(":")
        if (parts.size != 2) return null
        val hour = parts[0].toIntOrNull() ?: return null
        val minute = parts[1].toIntOrNull() ?: return null
        if (hour !in 0..23 || minute !in 0..59) return null
        return hour * MINUTES_PER_HOUR + minute
    }

    /**
     * Formats an (hour, minute) picked in the editor as a zero-padded `"HH:mm"`, clamping each
     * component into its valid range so the stored token is always parseable.
     */
    public fun formatTimeOfDay(hour: Int, minute: Int): String {
        val h = hour.coerceIn(0, 23)
        val m = minute.coerceIn(0, 59)
        return "%02d:%02d".format(h, m)
    }

    /**
     * Toggles [day]'s membership in [days], returning a list in canonical Monday-first order
     * (and de-duplicated) so the persisted set is stable regardless of tap order.
     */
    public fun toggleDay(days: List<DndDay>, day: DndDay): List<DndDay> {
        val selected = days.toMutableSet()
        if (!selected.add(day)) selected.remove(day)
        return DndDay.entries.filter { it in selected }
    }

    /**
     * True when the given device-local [dayOfWeek]/[minuteOfDay] falls inside the configured
     * quiet-hours window. Off, gated-out day, or corrupt time ⇒ `false`.
     */
    public fun isActive(
        prefs: UserNotificationPreferences,
        dayOfWeek: DayOfWeek,
        minuteOfDay: Int,
    ): Boolean {
        if (!prefs.dndEnabled) return false
        if (prefs.dndDays.isNotEmpty() && !prefs.dndDays.contains(dayOfWeek.toDndDay())) return false

        val start = parseMinuteOfDay(prefs.dndStartTime) ?: return false
        val end = parseMinuteOfDay(prefs.dndEndTime) ?: return false

        return if (start <= end) {
            minuteOfDay in start until end
        } else {
            minuteOfDay >= start || minuteOfDay < end
        }
    }

    /** Convenience over a device-local [LocalDateTime]. */
    public fun isActive(prefs: UserNotificationPreferences, at: LocalDateTime): Boolean =
        isActive(prefs, at.dayOfWeek, at.hour * MINUTES_PER_HOUR + at.minute)

    /**
     * The quiet-hours verdict for the instant [epochMillis] read in the user's LOCAL time,
     * [utcOffsetMinutes] minutes ahead of UTC (Tokyo = 540, New York summer = -240) — never
     * in UTC. The day filter applies to the LOCAL day, so a window that crosses midnight is
     * judged against the local calendar too.
     */
    public fun isActiveAt(prefs: UserNotificationPreferences, epochMillis: Long, utcOffsetMinutes: Int): Boolean {
        val local = LocalDateTime.ofInstant(
            Instant.ofEpochMilli(epochMillis),
            ZoneOffset.ofTotalSeconds(utcOffsetMinutes.coerceIn(MIN_OFFSET_MINUTES, MAX_OFFSET_MINUTES) * SECONDS_PER_MINUTE),
        )
        return isActive(prefs, local)
    }

    /**
     * Records the device's current UTC offset alongside the quiet-hours schedule, so the
     * gateway evaluates the window in the user's local time (GW7). Out-of-range offsets are
     * clamped into the gateway's accepted UTC-12 h..UTC+14 h.
     */
    public fun withRecordedOffset(prefs: UserNotificationPreferences, utcOffsetMinutes: Int): UserNotificationPreferences =
        prefs.copy(dndUtcOffsetMinutes = utcOffsetMinutes.coerceIn(MIN_OFFSET_MINUTES, MAX_OFFSET_MINUTES))

    private const val MINUTES_PER_HOUR = 60
    private const val SECONDS_PER_MINUTE = 60
    private const val MIN_OFFSET_MINUTES = -12 * 60
    private const val MAX_OFFSET_MINUTES = 14 * 60
}
