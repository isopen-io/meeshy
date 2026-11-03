package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.playback.MediaSessionEvent
import me.meeshy.sdk.model.story.StorySessionInterruption.Outcome
import org.junit.Test

class StorySessionInterruptionTest {

    private fun frozen() = StorySessionInterruption().also { it.handle(MediaSessionEvent.InterruptionBegan, true) }

    @Test
    fun `une interruption pendant la lecture fige l'horloge`() {
        val law = StorySessionInterruption()

        assertThat(law.handle(MediaSessionEvent.InterruptionBegan, storyIsPlaying = true)).isEqualTo(Outcome.Freeze)
        assertThat(law.isFrozen).isTrue()
    }

    @Test
    fun `une interruption sur une story déjà retenue ne change rien`() {
        val law = StorySessionInterruption()

        assertThat(law.handle(MediaSessionEvent.InterruptionBegan, storyIsPlaying = false)).isEqualTo(Outcome.None)
        assertThat(law.isFrozen).isFalse()
    }

    @Test
    fun `le gain de focus reprend là où la story était`() {
        val law = frozen()

        assertThat(law.handle(MediaSessionEvent.InterruptionEndedShouldResume, false)).isEqualTo(Outcome.Resume)
        assertThat(law.isFrozen).isFalse()
    }

    @Test
    fun `une fin sans reprise laisse la story en pause utilisateur`() {
        val law = frozen()

        assertThat(law.handle(MediaSessionEvent.InterruptionEndedShouldNotResume, false)).isEqualTo(Outcome.SettleAsPause)
        assertThat(law.isFrozen).isFalse()
    }

    @Test
    fun `la pause de l'utilisateur pendant l'interruption l'emporte`() {
        val law = frozen()

        law.userPaused()

        assertThat(law.isFrozen).isFalse()
        assertThat(law.handle(MediaSessionEvent.InterruptionEndedShouldResume, false)).isEqualTo(Outcome.None)
    }

    @Test
    fun `le retour au premier plan reprend sauf si une autre application joue encore`() {
        assertThat(frozen().returnedToForeground(otherAudioPlaying = false)).isEqualTo(Outcome.Resume)
        val still = frozen()
        assertThat(still.returnedToForeground(otherAudioPlaying = true)).isEqualTo(Outcome.None)
        assertThat(still.isFrozen).isTrue()
        assertThat(StorySessionInterruption().returnedToForeground(false)).isEqualTo(Outcome.None)
    }

    @Test
    fun `une fin sans gel préalable et un changement de route ne touchent pas l'horloge`() {
        val law = StorySessionInterruption()

        assertThat(law.handle(MediaSessionEvent.InterruptionEndedShouldResume, true)).isEqualTo(Outcome.None)
        assertThat(law.handle(MediaSessionEvent.InterruptionEndedShouldNotResume, true)).isEqualTo(Outcome.None)
        assertThat(law.handle(MediaSessionEvent.CallEndedShouldResume, true)).isEqualTo(Outcome.None)
        assertThat(frozen().handle(MediaSessionEvent.RouteChangedOldDeviceUnavailable, true)).isEqualTo(Outcome.None)
    }
}
