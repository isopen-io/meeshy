package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DurationFormatTest {
    @Test fun `deux minutes cinq`() {
        assertThat(DurationFormat.clock(125.0)).isEqualTo("2:05")
    }

    @Test fun `les minutes s accumulent`() {
        assertThat(DurationFormat.clock(3695.0)).isEqualTo("61:35")
    }

    @Test fun `non fini ou negatif donne zero`() {
        assertThat(DurationFormat.clock(Double.NaN)).isEqualTo("0:00")
        assertThat(DurationFormat.clock(Double.POSITIVE_INFINITY)).isEqualTo("0:00")
        assertThat(DurationFormat.clock(-4.0)).isEqualTo("0:00")
        assertThat(DurationFormat.clock(wholeSeconds = -4)).isEqualTo("0:00")
    }

    @Test fun `la fraction est tronquee`() {
        assertThat(DurationFormat.clock(59.99)).isEqualTo("0:59")
    }
}
