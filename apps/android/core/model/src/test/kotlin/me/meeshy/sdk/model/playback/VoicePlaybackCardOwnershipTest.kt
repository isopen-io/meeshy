package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.playback.VoicePlaybackCardOwner.Screen
import me.meeshy.sdk.model.playback.VoicePlaybackCardOwner.Shared
import org.junit.Test

class VoicePlaybackCardOwnershipTest {

    @Test
    fun `the first publisher takes the card and silences nobody`() {
        val decision = VoicePlaybackCardOwnership.publish(current = null, by = Shared, active = true)

        assertThat(decision.owner).isEqualTo(Shared)
        assertThat(decision.silence).isNull()
    }

    @Test
    fun `the owner keeps publishing without silencing itself`() {
        val decision = VoicePlaybackCardOwnership.publish(current = Screen, by = Screen, active = false)

        assertThat(decision.owner).isEqualTo(Screen)
        assertThat(decision.silence).isNull()
    }

    @Test
    fun `an active publisher takes the card from the other and silences it`() {
        val decision = VoicePlaybackCardOwnership.publish(current = Screen, by = Shared, active = true)

        assertThat(decision.owner).isEqualTo(Shared)
        assertThat(decision.silence).isEqualTo(Screen)
    }

    @Test
    fun `a paused publisher never steals the card from the owner`() {
        val decision = VoicePlaybackCardOwnership.publish(current = Shared, by = Screen, active = false)

        assertThat(decision.owner).isEqualTo(Shared)
        assertThat(decision.silence).isNull()
    }

    @Test
    fun `the owner retiring frees the card`() {
        assertThat(VoicePlaybackCardOwnership.retire(current = Shared, by = Shared)).isNull()
    }

    @Test
    fun `a retirement from a non owner is ignored`() {
        assertThat(VoicePlaybackCardOwnership.retire(current = Shared, by = Screen)).isEqualTo(Shared)
        assertThat(VoicePlaybackCardOwnership.retire(current = null, by = Screen)).isNull()
    }

    @Test
    fun `system orders go to the owner, to the screen player while nobody owns the card`() {
        assertThat(VoicePlaybackCardOwnership.routeTo(Shared)).isEqualTo(Shared)
        assertThat(VoicePlaybackCardOwnership.routeTo(Screen)).isEqualTo(Screen)
        assertThat(VoicePlaybackCardOwnership.routeTo(null)).isEqualTo(Screen)
    }
}
