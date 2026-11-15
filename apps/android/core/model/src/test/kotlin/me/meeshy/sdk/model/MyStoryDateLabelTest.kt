package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MyStoryDateLabel.Relative
import me.meeshy.sdk.model.MyStoryDateLabel.Unit
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

class MyStoryDateLabelTest {

    private val utc = ZoneId.of("UTC")
    private fun at(y: Int, m: Int, d: Int, h: Int = 12) =
        ZonedDateTime.of(y, m, d, h, 0, 0, 0, utc).toInstant().toEpochMilli()

    private fun label(date: Long, now: Long) = MyStoryDateLabel.resolve(date, now, utc)

    @Test
    fun `moins d'un mois la date est relative`() {
        val now = at(2026, 10, 22)
        assertThat(label(at(2026, 10, 20), now)).isEqualTo(Relative(2, Unit.DAYS))
        assertThat(label(at(2026, 10, 22, 9), now)).isEqualTo(Relative(3, Unit.HOURS))
        assertThat(label(now - 30_000, now)).isEqualTo(Relative(30, Unit.SECONDS))
        assertThat(label(now - 5 * 60_000, now)).isEqualTo(Relative(5, Unit.MINUTES))
        assertThat(label(at(2026, 10, 8), now)).isEqualTo(Relative(2, Unit.WEEKS))
    }

    @Test
    fun `le seuil est un mois calendaire et non trente jours`() {
        val now = at(2026, 3, 1)
        // 1er fevrier = 28 jours avant : encore relatif.
        assertThat(label(at(2026, 2, 2), now)).isInstanceOf(Relative::class.java)
        // pile un mois calendaire avant : date moyenne.
        assertThat(label(at(2026, 2, 1), now)).isEqualTo(MyStoryDateLabel.Medium(at(2026, 2, 1)))
    }

    @Test
    fun `au dela d'un mois la date moyenne porte la date d'origine`() {
        val now = at(2026, 10, 22)
        val old = at(2026, 6, 1)
        assertThat(label(old, now)).isEqualTo(MyStoryDateLabel.Medium(old))
    }

    @Test
    fun `l'horloge injectee decide, une date future ne devient pas negative`() {
        val now = at(2026, 10, 22)
        assertThat(label(now + 10_000, now)).isEqualTo(Relative(0, Unit.SECONDS))
        assertThat(label(at(2026, 10, 20), at(2026, 10, 25))).isEqualTo(Relative(5, Unit.DAYS))
    }
}
