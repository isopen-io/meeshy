package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FeedAudioProbeTest {

    @Test
    fun `un media non sonde n est ni sonore ni muet`() {
        val table = FeedAudioProbeTable()
        assertThat(table.isProbed("m")).isFalse()
        assertThat(table.hasAudioTrack("m")).isFalse()
    }

    @Test
    fun `une sonde non resolue ne change rien puis une resolue l enregistre`() {
        val unresolved = FeedAudioProbeTable().recording("m", null)
        assertThat(unresolved.isProbed("m")).isFalse()
        val resolved = unresolved.recording("m", 1)
        assertThat(resolved.isProbed("m")).isTrue()
        assertThat(resolved.hasAudioTrack("m")).isTrue()
    }

    @Test
    fun `zero piste est un clip muet sonde`() {
        val table = FeedAudioProbeTable().recording("m", 0)
        assertThat(table.isProbed("m")).isTrue()
        assertThat(table.hasAudioTrack("m")).isFalse()
    }

    @Test
    fun `la premiere reponse est gardee`() {
        val table = FeedAudioProbeTable().recording("m", 0).recording("m", 2)
        assertThat(table.hasAudioTrack("m")).isFalse()
    }

    @Test
    fun `le plus ancien sondage sort au dela de la capacite`() {
        val table = (1..4).fold(FeedAudioProbeTable()) { acc, i -> acc.recording("m$i", 1, capacity = 3) }
        assertThat(table.isProbed("m1")).isFalse()
        assertThat(table.presence.keys).containsExactly("m2", "m3", "m4")
    }
}
