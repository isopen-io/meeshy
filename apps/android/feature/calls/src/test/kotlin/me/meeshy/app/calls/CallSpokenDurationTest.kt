package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import me.meeshy.app.calls.CallSpokenDuration.Part
import me.meeshy.app.calls.CallSpokenDuration.Unit
import org.junit.Test

class CallSpokenDurationTest {

    @Test
    fun `125 secondes se disent 2 minutes 5 secondes`() {
        assertThat(CallSpokenDuration.parts(125))
            .containsExactly(Part(Unit.MINUTES, 2), Part(Unit.SECONDS, 5)).inOrder()
    }

    @Test
    fun `les unites nulles sont omises et les heures apparaissent`() {
        assertThat(CallSpokenDuration.parts(3600)).containsExactly(Part(Unit.HOURS, 1))
        assertThat(CallSpokenDuration.parts(3725))
            .containsExactly(Part(Unit.HOURS, 1), Part(Unit.MINUTES, 2), Part(Unit.SECONDS, 5)).inOrder()
    }

    @Test
    fun `zero ou negatif se dit 0 seconde`() {
        assertThat(CallSpokenDuration.parts(0)).containsExactly(Part(Unit.SECONDS, 0))
        assertThat(CallSpokenDuration.parts(-9)).containsExactly(Part(Unit.SECONDS, 0))
    }

    @Test
    fun `les chiffres suivent la locale`() {
        assertThat(CallSpokenDuration.localizeDigits("02:05", Locale.FRANCE)).isEqualTo("02:05")
        assertThat(CallSpokenDuration.localizeDigits("1:02:05", Locale.forLanguageTag("ar-EG")))
            .isEqualTo("١:٠٢:٠٥")
    }
}
