package me.meeshy.sdk.model.format

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import me.meeshy.sdk.model.format.LocalizedNumber.DurationClock
import org.junit.Test

class LocalizedNumberTest {
    private val en = Locale.ENGLISH
    private val ar = Locale.forLanguageTag("ar")

    @Test fun `exact groupe et localise`() {
        assertThat(LocalizedNumber.exact(1234, en)).isEqualTo("1,234")
        assertThat(LocalizedNumber.exact(1234, Locale.FRENCH)).isEqualTo("1 234")
        assertThat(LocalizedNumber.exact(1234, ar)).isEqualTo("١٬٢٣٤")
    }

    @Test fun `pourcentage suit la locale`() {
        assertThat(LocalizedNumber.percent(50, en)).isEqualTo("50%")
        assertThat(LocalizedNumber.percent(50, Locale.FRENCH)).isEqualTo("50 %")
    }

    @Test fun `horloges de duree`() {
        assertThat(LocalizedNumber.duration(125, DurationClock.MINUTE_SECOND, en)).isEqualTo("2:05")
        assertThat(LocalizedNumber.duration(125, DurationClock.PADDED_MINUTE_SECOND, en)).isEqualTo("02:05")
        assertThat(LocalizedNumber.duration(3900, DurationClock.HOUR_MINUTE_SECOND, en)).isEqualTo("1:05:00")
        assertThat(LocalizedNumber.duration(3695, DurationClock.MINUTE_SECOND, en)).isEqualTo("61:35")
    }

    @Test fun `duree non finie ou negative donne zero`() {
        assertThat(LocalizedNumber.duration(Double.NaN, locale = en)).isEqualTo("0:00")
        assertThat(LocalizedNumber.duration(-3.0, locale = en)).isEqualTo("0:00")
        assertThat(LocalizedNumber.duration(1e30, locale = en)).isNotEmpty()
    }

    @Test fun `duree dite sans zero`() {
        assertThat(LocalizedNumber.spokenDuration(125, en)).isEqualTo("2 minutes 5 seconds")
        assertThat(LocalizedNumber.spokenDuration(3600, Locale.FRENCH)).isEqualTo("1 heure")
        assertThat(LocalizedNumber.spokenDuration(0, en)).isEqualTo("0 seconds")
    }
}
