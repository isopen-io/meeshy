package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.BubbleAudio
import org.junit.Test

private fun voice(id: String, seconds: Int = 12) =
    BubbleAudio(attachmentId = id, url = "https://cdn.example/$id.m4a", durationSeconds = seconds)

class ChatAudioPlaybackTest {

    @Test
    fun `touching a voice note loads it in the app`() {
        val state = ChatAudioPlayback.Idle.toggle(voice("a"))

        assertThat(state.attachmentId).isEqualTo("a")
        assertThat(state.transport.isLoading).isTrue()
        assertThat(state.bubbleFor("a")?.isLoading).isTrue()
    }

    @Test
    fun `a second touch pauses the playing voice note`() {
        val playing = ChatAudioPlayback.Idle.toggle(voice("a")).ready()

        val paused = playing.toggle(voice("a"))

        assertThat(playing.bubbleFor("a")?.isPlaying).isTrue()
        assertThat(paused.bubbleFor("a")?.isPlaying).isFalse()
        assertThat(paused.attachmentId).isEqualTo("a")
    }

    @Test
    fun `touching another voice note switches to it from the start`() {
        val playingA = ChatAudioPlayback.Idle.toggle(voice("a")).ready().tick(4.0, 12.0)

        val switched = playingA.toggle(voice("b"))

        assertThat(switched.attachmentId).isEqualTo("b")
        assertThat(switched.transport.isLoading).isTrue()
        assertThat(switched.bubbleFor("a")).isNull()
    }

    @Test
    fun `only the voice note being played carries a playback state`() {
        val playing = ChatAudioPlayback.Idle.toggle(voice("a")).ready()

        assertThat(playing.bubbleFor("other")).isNull()
    }

    @Test
    fun `the bubble shows progress and elapsed over total`() {
        val playing = ChatAudioPlayback.Idle.toggle(voice("a")).ready().tick(3.0, 12.0)

        val bubble = playing.bubbleFor("a", declaredDurationSeconds = 12)

        assertThat(bubble?.progress).isWithin(0.001f).of(0.25f)
        assertThat(bubble?.timeLabel).isEqualTo("0:03 / 0:12")
    }

    @Test
    fun `playing to the end rewinds and stops`() {
        val ended = ChatAudioPlayback.Idle.toggle(voice("a")).ready().tick(11.0, 12.0).ended()

        assertThat(ended.bubbleFor("a")?.isPlaying).isFalse()
        assertThat(ended.bubbleFor("a")?.progress).isEqualTo(0f)
    }

    @Test
    fun `a voice note without url is ignored`() {
        val state = ChatAudioPlayback.Idle.toggle(BubbleAudio(attachmentId = "x", url = null))

        assertThat(state).isEqualTo(ChatAudioPlayback.Idle)
    }
}
