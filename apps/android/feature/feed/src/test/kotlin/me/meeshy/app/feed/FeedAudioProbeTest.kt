package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FeedAudioProbeTest {

    @Test
    fun `le son est coupe par defaut et la bascule le releve`() {
        val probe = FeedAudioProbe()
        assertThat(probe.isSoundOn.value).isFalse()
        assertThat(probe.isForceMuted).isTrue()
        probe.toggleSound()
        assertThat(probe.isSoundOn.value).isTrue()
        assertThat(probe.isForceMuted).isFalse()
    }

    @Test
    fun `une sonde non resolue puis resolue met le cache a jour`() {
        val probe = FeedAudioProbe()
        probe.record("m", null)
        assertThat(probe.isProbed("m")).isFalse()
        probe.record("m", 2)
        assertThat(probe.isProbed("m")).isTrue()
        assertThat(probe.hasAudioTrack("m")).isTrue()
        probe.record("m", 0)
        assertThat(probe.hasAudioTrack("m")).isTrue()
    }
}
