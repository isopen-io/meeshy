package me.meeshy.sdk.model.paste

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerMediaProbeTest {
    private val asked = mutableListOf<String>()
    private fun probe(ms: Long?) = ComposerMediaProbe { asked += it; ms }

    @Test
    fun `une vidéo et un son rendent leur durée réelle`() {
        assertThat(probe(10_000).durationMs("/v.mp4", "video/mp4")).isEqualTo(10_000L)
        assertThat(probe(2_500).durationMs("/a.m4a", "audio/mp4")).isEqualTo(2_500L)
    }

    @Test
    fun `une image ou un fichier ne touchent jamais le lecteur`() {
        assertThat(probe(9_000).durationMs("/i.png", "image/png")).isNull()
        assertThat(probe(9_000).durationMs("/f.bin", "application/octet-stream")).isNull()
        assertThat(asked).isEmpty()
    }

    @Test
    fun `une durée nulle ou illisible est inconnue`() {
        assertThat(probe(0).durationMs("/v.mp4", "video/mp4")).isNull()
        assertThat(probe(null).durationMs("/v.mp4", "video/mp4")).isNull()
    }

    @Test
    fun `le seuil du réel est de trois secondes pile`() {
        assertThat(ComposerMediaProbe.meetsReelMinimum(2_999)).isFalse()
        assertThat(ComposerMediaProbe.meetsReelMinimum(3_000)).isTrue()
        assertThat(ComposerMediaProbe.meetsReelMinimum(null)).isFalse()
    }
}
