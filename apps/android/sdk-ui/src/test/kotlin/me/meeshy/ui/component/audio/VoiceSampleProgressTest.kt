package me.meeshy.ui.component.audio

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VoiceSampleProgressTest {

    @Test
    fun `progress is bounded and zero when the duration is unknown`() {
        assertThat(VoiceSampleProgress.fraction(1_000, 4_000)).isEqualTo(0.25f)
        assertThat(VoiceSampleProgress.fraction(9_000, 4_000)).isEqualTo(1f)
        assertThat(VoiceSampleProgress.fraction(-5, 4_000)).isEqualTo(0f)
        assertThat(VoiceSampleProgress.fraction(1_000, null)).isEqualTo(0f)
        assertThat(VoiceSampleProgress.fraction(1_000, 0)).isEqualTo(0f)
    }

    @Test
    fun `the clock shows the duration at rest and the elapsed time while playing`() {
        assertThat(VoiceSampleProgress.clock(0, 4_200, isPlaying = false)).isEqualTo("0:04")
        assertThat(VoiceSampleProgress.clock(1_500, 4_200, isPlaying = true)).isEqualTo("0:01")
        assertThat(VoiceSampleProgress.clock(2_500, 4_200, isPlaying = false)).isEqualTo("0:02")
        assertThat(VoiceSampleProgress.clock(0, null, isPlaying = false)).isEqualTo("0:00")
    }

    @Test
    fun `an absolute address plays as served and a path joins the API origin`() {
        assertThat(VoiceSampleProgress.resolve("https://cdn.meeshy.me/v.m4a", null)).isEqualTo("https://cdn.meeshy.me/v.m4a")
        assertThat(VoiceSampleProgress.resolve("/uploads/v.m4a", "https://gate.meeshy.me/api/v1"))
            .isEqualTo("https://gate.meeshy.me/uploads/v.m4a")
        assertThat(VoiceSampleProgress.resolve("/uploads/v.m4a", null)).isNull()
        assertThat(VoiceSampleProgress.resolve("   ", "https://gate.meeshy.me/api/v1")).isNull()
        assertThat(VoiceSampleProgress.resolve("voice-key", "https://gate.meeshy.me/api/v1")).isNull()
    }
}
