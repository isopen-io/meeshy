package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.DayOfWeek
import java.time.LocalDateTime
import org.junit.Test

/**
 * Pure Do-Not-Disturb (quiet-hours) logic — the single source of truth for the
 * DND schedule editor and any notification-gating consumer. Port of iOS
 * `UserNotificationPreferences.isInDoNotDisturbWindow`. Must be total over the
 * enable flag, robust to a corrupt persisted `HH:mm`, and correct across the
 * midnight wrap and per-day gating.
 */
class DndWindowTest {

    private fun prefs(
        enabled: Boolean = true,
        start: String = "22:00",
        end: String = "08:00",
        days: List<DndDay> = emptyList(),
    ) = UserNotificationPreferences(
        dndEnabled = enabled,
        dndStartTime = start,
        dndEndTime = end,
        dndDays = days,
    )

    // ---- parseMinuteOfDay -------------------------------------------------

    @Test
    fun parseMinuteOfDay_parsesTheBoundsAndInterior() {
        assertThat(DndWindow.parseMinuteOfDay("00:00")).isEqualTo(0)
        assertThat(DndWindow.parseMinuteOfDay("23:59")).isEqualTo(23 * 60 + 59)
        assertThat(DndWindow.parseMinuteOfDay("08:30")).isEqualTo(8 * 60 + 30)
    }

    @Test
    fun parseMinuteOfDay_trimsSurroundingWhitespace() {
        assertThat(DndWindow.parseMinuteOfDay("  07:15 ")).isEqualTo(7 * 60 + 15)
    }

    @Test
    fun parseMinuteOfDay_rejectsMalformedShapes() {
        assertThat(DndWindow.parseMinuteOfDay("")).isNull()
        assertThat(DndWindow.parseMinuteOfDay("0800")).isNull()
        assertThat(DndWindow.parseMinuteOfDay("08:00:00")).isNull()
        assertThat(DndWindow.parseMinuteOfDay("ab:cd")).isNull()
        assertThat(DndWindow.parseMinuteOfDay("08:")).isNull()
    }

    @Test
    fun parseMinuteOfDay_rejectsOutOfRangeComponents() {
        assertThat(DndWindow.parseMinuteOfDay("24:00")).isNull()
        assertThat(DndWindow.parseMinuteOfDay("12:60")).isNull()
        assertThat(DndWindow.parseMinuteOfDay("-1:00")).isNull()
        assertThat(DndWindow.parseMinuteOfDay("10:-5")).isNull()
    }

    // ---- formatTimeOfDay --------------------------------------------------

    @Test
    fun formatTimeOfDay_zeroPadsToTwoDigits() {
        assertThat(DndWindow.formatTimeOfDay(7, 5)).isEqualTo("07:05")
        assertThat(DndWindow.formatTimeOfDay(22, 30)).isEqualTo("22:30")
        assertThat(DndWindow.formatTimeOfDay(0, 0)).isEqualTo("00:00")
    }

    @Test
    fun formatTimeOfDay_clampsComponentsIntoRange() {
        assertThat(DndWindow.formatTimeOfDay(25, 70)).isEqualTo("23:59")
        assertThat(DndWindow.formatTimeOfDay(-1, -3)).isEqualTo("00:00")
    }

    @Test
    fun formatTimeOfDay_roundTripsThroughParse() {
        val minutes = DndWindow.parseMinuteOfDay(DndWindow.formatTimeOfDay(9, 45))
        assertThat(minutes).isEqualTo(9 * 60 + 45)
    }

    // ---- toggleDay --------------------------------------------------------

    @Test
    fun toggleDay_addsAnAbsentDay() {
        assertThat(DndWindow.toggleDay(emptyList(), DndDay.WED))
            .containsExactly(DndDay.WED)
    }

    @Test
    fun toggleDay_removesAPresentDay() {
        assertThat(DndWindow.toggleDay(listOf(DndDay.MON, DndDay.WED), DndDay.MON))
            .containsExactly(DndDay.WED)
    }

    @Test
    fun toggleDay_keepsCanonicalMondayFirstOrderRegardlessOfInput() {
        val result = DndWindow.toggleDay(listOf(DndDay.SUN, DndDay.WED), DndDay.MON)
        assertThat(result).containsExactly(DndDay.MON, DndDay.WED, DndDay.SUN).inOrder()
    }

    @Test
    fun toggleDay_dedupesRepeatedInput() {
        val result = DndWindow.toggleDay(listOf(DndDay.FRI, DndDay.FRI), DndDay.SAT)
        assertThat(result).containsExactly(DndDay.FRI, DndDay.SAT).inOrder()
    }

    // ---- day <-> weekday mapping -----------------------------------------

    @Test
    fun dayMapping_roundTripsEveryWeekday() {
        DndDay.entries.forEach { day ->
            assertThat(DndWindow.run { day.toDayOfWeek().toDndDay() }).isEqualTo(day)
        }
    }

    @Test
    fun dayMapping_alignsMondayAndSundayWithIso() {
        assertThat(DndWindow.run { DndDay.MON.toDayOfWeek() }).isEqualTo(DayOfWeek.MONDAY)
        assertThat(DndWindow.run { DndDay.SUN.toDayOfWeek() }).isEqualTo(DayOfWeek.SUNDAY)
    }

    // ---- isActive: enable gate -------------------------------------------

    @Test
    fun isActive_isFalseWhenDisabledEvenInsideTheWindow() {
        assertThat(DndWindow.isActive(prefs(enabled = false), DayOfWeek.MONDAY, 23 * 60)).isFalse()
    }

    // ---- isActive: same-day window (start < end) -------------------------

    @Test
    fun isActive_sameDayWindow_isInclusiveOfStartAndExclusiveOfEnd() {
        val p = prefs(start = "09:00", end = "17:00")
        assertThat(DndWindow.isActive(p, DayOfWeek.MONDAY, 9 * 60)).isTrue() // at start
        assertThat(DndWindow.isActive(p, DayOfWeek.MONDAY, 12 * 60)).isTrue() // interior
        assertThat(DndWindow.isActive(p, DayOfWeek.MONDAY, 17 * 60)).isFalse() // at end (exclusive)
        assertThat(DndWindow.isActive(p, DayOfWeek.MONDAY, 8 * 60 + 59)).isFalse() // before start
        assertThat(DndWindow.isActive(p, DayOfWeek.MONDAY, 17 * 60 + 1)).isFalse() // after end
    }

    @Test
    fun isActive_degenerateWindow_whereStartEqualsEnd_isNeverActive() {
        val p = prefs(start = "10:00", end = "10:00")
        assertThat(DndWindow.isActive(p, DayOfWeek.MONDAY, 10 * 60)).isFalse()
        assertThat(DndWindow.isActive(p, DayOfWeek.MONDAY, 0)).isFalse()
    }

    // ---- isActive: midnight-crossing window (start > end) ----------------

    @Test
    fun isActive_wrapAroundWindow_coversBothSidesOfMidnight() {
        val p = prefs(start = "22:00", end = "08:00")
        assertThat(DndWindow.isActive(p, DayOfWeek.MONDAY, 23 * 60)).isTrue() // late evening
        assertThat(DndWindow.isActive(p, DayOfWeek.MONDAY, 22 * 60)).isTrue() // at start
        assertThat(DndWindow.isActive(p, DayOfWeek.MONDAY, 2 * 60)).isTrue() // small hours
        assertThat(DndWindow.isActive(p, DayOfWeek.MONDAY, 7 * 60 + 59)).isTrue() // before end
        assertThat(DndWindow.isActive(p, DayOfWeek.MONDAY, 8 * 60)).isFalse() // at end (exclusive)
        assertThat(DndWindow.isActive(p, DayOfWeek.MONDAY, 12 * 60)).isFalse() // midday gap
    }

    // ---- isActive: per-day gating ----------------------------------------

    @Test
    fun isActive_emptyDays_meansEveryDay() {
        val p = prefs(start = "09:00", end = "17:00", days = emptyList())
        DayOfWeek.entries.forEach { weekday ->
            assertThat(DndWindow.isActive(p, weekday, 12 * 60)).isTrue()
        }
    }

    @Test
    fun isActive_gatesOutDaysNotInTheList() {
        val p = prefs(start = "09:00", end = "17:00", days = listOf(DndDay.MON, DndDay.TUE))
        assertThat(DndWindow.isActive(p, DayOfWeek.MONDAY, 12 * 60)).isTrue()
        assertThat(DndWindow.isActive(p, DayOfWeek.WEDNESDAY, 12 * 60)).isFalse()
    }

    // ---- isActive: corrupt times -----------------------------------------

    @Test
    fun isActive_isFalseWhenAStoredTimeIsCorrupt() {
        assertThat(DndWindow.isActive(prefs(start = "oops"), DayOfWeek.MONDAY, 23 * 60)).isFalse()
        assertThat(DndWindow.isActive(prefs(end = "99:99"), DayOfWeek.MONDAY, 23 * 60)).isFalse()
    }

    // ---- isActive: LocalDateTime convenience -----------------------------

    @Test
    fun isActive_localDateTimeOverload_derivesWeekdayAndMinute() {
        val p = prefs(start = "22:00", end = "08:00")
        val lateEvening = LocalDateTime.of(2026, 7, 6, 23, 30) // Monday
        val midday = LocalDateTime.of(2026, 7, 6, 12, 0)
        assertThat(DndWindow.isActive(p, lateEvening)).isTrue()
        assertThat(DndWindow.isActive(p, midday)).isFalse()
    }

    @Test
    fun isActive_localDateTimeOverload_honoursDayGating() {
        val p = prefs(start = "09:00", end = "17:00", days = listOf(DndDay.TUE))
        val monday = LocalDateTime.of(2026, 7, 6, 12, 0)
        val tuesday = LocalDateTime.of(2026, 7, 7, 12, 0)
        assertThat(DndWindow.isActive(p, monday)).isFalse()
        assertThat(DndWindow.isActive(p, tuesday)).isTrue()
    }
}
