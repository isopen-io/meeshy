package me.meeshy.app.chat.river

import com.google.common.truth.Truth.assertThat
import java.time.ZoneOffset
import java.util.Locale
import me.meeshy.sdk.model.reading.river.RiverTimeScale
import org.junit.Test

class RiverTimeLabelsTest {

    private val day = 24 * 3_600_000.0
    private val t0 = 1_793_000_000_000.0
    private val scale = RiverTimeScale.resolve(
        listOf(RiverTimeScale.RankTime(0, t0), RiverTimeScale.RankTime(1, t0 + 5 * day)),
        ZoneOffset.UTC, Locale.ENGLISH,
    )!!

    private fun labels(locale: Locale, pattern: String) =
        RiverTimeLabels(scale, ZoneOffset.UTC, locale) { skeleton, _ ->
            assertThat(skeleton).isEqualTo("MMMd")
            pattern
        }

    @Test
    fun `le format suit la langue - le patron vient de la plateforme, jamais d'une constante`() {
        assertThat(labels(Locale.ENGLISH, "MMM d").at(0.0)).isEqualTo("Oct 26")
        assertThat(labels(Locale.FRENCH, "d MMM").at(0.0)).isEqualTo("26 oct.")
    }

    @Test
    fun `le squelette suit l'unite de l'echelle`() {
        assertThat(RiverTimeLabels.skeleton(RiverTimeScale.Grain.HOUR)).isEqualTo("Hm")
        assertThat(RiverTimeLabels.skeleton(RiverTimeScale.Grain.YEAR)).isEqualTo("y")
    }
}
