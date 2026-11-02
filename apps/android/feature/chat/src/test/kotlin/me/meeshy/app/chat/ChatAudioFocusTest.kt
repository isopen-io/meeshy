package me.meeshy.app.chat

import android.media.AudioManager
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.playback.InterruptionResumeLedger
import me.meeshy.sdk.model.playback.MediaSessionEvent
import org.junit.Test

class ChatAudioFocusTest {

    @Test
    fun `a transient loss is an interruption and the gain back is a resume`() {
        assertThat(ChatAudioFocus.events(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT))
            .containsExactly(MediaSessionEvent.InterruptionBegan)
        assertThat(ChatAudioFocus.events(AudioManager.AUDIOFOCUS_GAIN))
            .containsExactly(MediaSessionEvent.InterruptionEndedShouldResume)
    }

    @Test
    fun `a permanent loss pauses and is never resumed on its own`() {
        val ledger = InterruptionResumeLedger()

        val actions = ChatAudioFocus.events(AudioManager.AUDIOFOCUS_LOSS)
            .map { event -> ledger.handle(InterruptionResumeLedger.signalFor(event, isPlaying = true)!!) }

        assertThat(actions).containsExactly(
            InterruptionResumeLedger.Action.Pause,
            InterruptionResumeLedger.Action.None,
        ).inOrder()
    }

    @Test
    fun `an unknown change says nothing`() {
        assertThat(ChatAudioFocus.events(0)).isEmpty()
    }
}
