package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import java.time.ZoneOffset
import java.util.Locale
import me.meeshy.sdk.model.reading.focal.ScrollActivityEvent
import org.junit.Test

class ScrollTimePillStateTest {

    @Test
    fun `invisible a l'ouverture`() {
        assertThat(ScrollTimePillState().isVisible).isFalse()
    }

    @Test
    fun `visible au premier defilement avec le libelle du message survole`() {
        val state = ScrollTimePillState()
        state.note(ScrollActivityEvent.Scrolled(1_000.0), "Hier · 09:12")

        assertThat(state.isVisible).isTrue()
        assertThat(state.label).isEqualTo("Hier · 09:12")
    }

    @Test
    fun `la borne de 900 ms est deja invisible et la derniere milliseconde encore visible`() {
        val state = ScrollTimePillState()
        state.note(ScrollActivityEvent.Scrolled(1_000.0), "x")

        state.note(ScrollActivityEvent.Tick(1_899.0))
        assertThat(state.isVisible).isTrue()
        state.note(ScrollActivityEvent.Tick(1_900.0))
        assertThat(state.isVisible).isFalse()
    }

    @Test
    fun `un defilement reamorce le minuteur`() {
        val state = ScrollTimePillState()
        state.note(ScrollActivityEvent.Scrolled(1_000.0), "a")
        state.note(ScrollActivityEvent.Scrolled(1_800.0), "b")

        state.note(ScrollActivityEvent.Tick(2_600.0))

        assertThat(state.isVisible).isTrue()
        assertThat(state.label).isEqualTo("b")
    }

    @Test
    fun `un tick ne change jamais le libelle`() {
        val state = ScrollTimePillState()
        state.note(ScrollActivityEvent.Scrolled(0.0), "a")
        state.note(ScrollActivityEvent.Tick(10.0), "autre")

        assertThat(state.label).isEqualTo("a")
    }

    @Test
    fun `l'en-tete deploye masque la pilule et son repli la rend a la loi`() {
        val state = ScrollTimePillState()
        state.note(ScrollActivityEvent.Scrolled(0.0), "a")

        state.isHeaderExpanded = true
        assertThat(state.isVisible).isFalse()

        state.isHeaderExpanded = false
        assertThat(state.isVisible).isTrue()
    }

    @Test
    fun `le revele des rangees plates suit la meme fenetre`() {
        val reveal = FocalTimestampRevealState()
        reveal.note(ScrollActivityEvent.Scrolled(0.0))
        assertThat(reveal.isRevealed).isTrue()
        reveal.note(ScrollActivityEvent.Tick(899.0))
        assertThat(reveal.isRevealed).isTrue()
        reveal.note(ScrollActivityEvent.Tick(900.0))
        assertThat(reveal.isRevealed).isFalse()
    }

    @Test
    fun `le libelle joint le jour et l'heure`() {
        val now = 1_760_000_000_000L
        val label = ScrollTimePillLabel.of(
            messageMillis = now, timeString = "14:32", nowMillis = now, zone = ZoneOffset.UTC, locale = Locale.FRANCE,
            today = "Aujourd'hui", yesterday = "Hier", dayBeforeYesterday = "Avant-hier",
        )
        assertThat(label).isEqualTo("Aujourd'hui · 14:32")
    }

    @Test
    fun `le message survole est le plus haut sous la ligne de lecture, jamais un separateur`() {
        val rows = listOf(
            ScrollTimePillLabel.Row(isMessage = false, minY = 0f, maxY = 40f),
            ScrollTimePillLabel.Row(isMessage = true, minY = 40f, maxY = 120f),
            ScrollTimePillLabel.Row(isMessage = true, minY = 120f, maxY = 200f),
        )
        assertThat(ScrollTimePillLabel.hoveredRow(rows, readingLine = 10f, viewportBottom = 600f)).isEqualTo(1)
        assertThat(ScrollTimePillLabel.hoveredRow(rows, readingLine = 120f, viewportBottom = 600f)).isEqualTo(2)
        assertThat(ScrollTimePillLabel.hoveredRow(emptyList(), 0f, 600f)).isNull()
    }
}
