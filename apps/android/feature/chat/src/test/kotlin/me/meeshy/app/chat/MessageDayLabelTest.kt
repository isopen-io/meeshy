package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.Locale
import org.junit.Test

class MessageDayLabelTest {

    private val zone = ZoneOffset.UTC
    private val locale = Locale.FRENCH

    // Thursday 2026-06-11
    private val now = LocalDate.of(2026, 6, 11).atTime(15, 0).toInstant(ZoneOffset.UTC).toEpochMilli()

    private fun millis(date: LocalDate) =
        date.atTime(9, 30).toInstant(ZoneOffset.UTC).toEpochMilli()

    private fun label(date: LocalDate): String =
        MessageDayLabel.label(
            dayMillis = millis(date),
            nowMillis = now,
            zone = zone,
            locale = locale,
            today = "Aujourd'hui",
            yesterday = "Hier",
            dayBeforeYesterday = "Avant-hier",
        )

    @Test
    fun `the same calendar day is today`() {
        assertThat(label(LocalDate.of(2026, 6, 11))).isEqualTo("Aujourd'hui")
    }

    @Test
    fun `one day back is yesterday and two is the day before`() {
        assertThat(label(LocalDate.of(2026, 6, 10))).isEqualTo("Hier")
        assertThat(label(LocalDate.of(2026, 6, 9))).isEqualTo("Avant-hier")
    }

    @Test
    fun `three to six days back use the capitalized weekday name`() {
        assertThat(label(LocalDate.of(2026, 6, 8))).isEqualTo("Lundi")
        assertThat(label(LocalDate.of(2026, 6, 5))).isEqualTo("Vendredi")
    }

    @Test
    fun `older dates in the same year use the full date without year`() {
        assertThat(label(LocalDate.of(2026, 5, 4))).isEqualTo("Lundi 4 mai")
    }

    @Test
    fun `dates from another year include the year`() {
        assertThat(label(LocalDate.of(2025, 12, 25))).isEqualTo("Jeudi 25 décembre 2025")
    }

    @Test
    fun `a future timestamp on the same day stays today`() {
        val future = LocalDate.of(2026, 6, 11).atTime(23, 0).toInstant(ZoneOffset.UTC).toEpochMilli()
        val result = MessageDayLabel.label(
            dayMillis = future,
            nowMillis = now,
            zone = zone,
            locale = locale,
            today = "Aujourd'hui",
            yesterday = "Hier",
            dayBeforeYesterday = "Avant-hier",
        )
        assertThat(result).isEqualTo("Aujourd'hui")
    }
}
