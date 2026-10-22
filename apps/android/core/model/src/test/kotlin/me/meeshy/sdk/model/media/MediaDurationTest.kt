package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaDurationTest {
    @Test fun `m ss sans zero de tete sur les minutes`() {
        assertThat(formatMediaDuration(12.0)).isEqualTo("0:12")
        assertThat(formatMediaDuration(65.9)).isEqualTo("1:05")
        assertThat(formatMediaDuration(600.0)).isEqualTo("10:00")
        assertThat(formatMediaDuration(0.0)).isEqualTo("0:00")
    }

    @Test fun `negatif NaN et absent ne rendent rien`() {
        assertThat(formatMediaDuration(-1.0)).isNull()
        assertThat(formatMediaDuration(Double.NaN)).isNull()
        assertThat(formatMediaDuration(Double.POSITIVE_INFINITY)).isNull()
        assertThat(formatMediaDuration(null)).isNull()
    }

    @Test fun `millisecondes`() {
        assertThat(formatMediaDurationMillis(12_400)).isEqualTo("0:12")
    }

    private fun spoken(s: Double?) = spokenMediaDuration(
        s,
        minutesLabel = { "$it minute${if (it > 1) "s" else ""}" },
        secondsLabel = { "$it seconde${if (it > 1) "s" else ""}" },
    )

    @Test fun `version parlee`() {
        assertThat(spoken(12.0)).isEqualTo("12 secondes")
        assertThat(spoken(60.0)).isEqualTo("1 minute")
        assertThat(spoken(65.0)).isEqualTo("1 minute 5 secondes")
        assertThat(spoken(0.0)).isEqualTo("0 seconde")
        assertThat(spoken(-3.0)).isNull()
    }
}
