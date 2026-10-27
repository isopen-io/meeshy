package me.meeshy.sdk.model.reading.summary

import com.google.common.truth.Truth.assertThat
import java.time.DayOfWeek
import java.time.LocalDate
import java.util.Locale
import org.junit.Test

class EpisodeTitleTextTest {
    private fun text(title: EpisodeTitle, locale: Locale = Locale.FRANCE) = EpisodeTitleText.format(
        title,
        locale,
        relative = { if (it == DayLabelKey.TODAY) "Aujourd'hui" else it.name },
        messages = { key, n -> if (key == EpisodeTitle.MESSAGES_ONE_KEY) "$n message" else "$n messages" },
    )

    @Test fun `un jour relatif et un pluriel`() {
        assertThat(text(EpisodeTitle(DayLabel.Relative(DayLabelKey.TODAY), null, 12)))
            .isEqualTo("Aujourd'hui · 12 messages")
    }

    @Test fun `un seul message est au singulier`() {
        assertThat(text(EpisodeTitle(DayLabel.Relative(DayLabelKey.TODAY), null, 1)))
            .isEqualTo("Aujourd'hui · 1 message")
    }

    @Test fun `une plage de jours de semaine suit la langue du lecteur`() {
        val title = EpisodeTitle(DayLabel.Weekday(DayOfWeek.MONDAY), DayLabel.Weekday(DayOfWeek.TUESDAY), 174)
        assertThat(text(title, Locale.ENGLISH)).isEqualTo("Mon–Tue · 174 messages")
    }

    @Test fun `une date complete porte l'annee seulement si demande`() {
        val date = LocalDate.of(2025, 9, 3)
        assertThat(text(EpisodeTitle(DayLabel.FullDate(date, includeYear = false), null, 2), Locale.ENGLISH))
            .isEqualTo("3 Sep · 2 messages")
        assertThat(text(EpisodeTitle(DayLabel.FullDate(date, includeYear = true), null, 2), Locale.ENGLISH))
            .contains("2025")
    }
}
