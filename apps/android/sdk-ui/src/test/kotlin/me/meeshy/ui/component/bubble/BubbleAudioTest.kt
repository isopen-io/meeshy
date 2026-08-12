package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BubbleAudioTest {

    @Test
    fun `a zero-second clip formats as 0 colon 00`() {
        assertThat(BubbleAudio(attachmentId = "a1", durationSeconds = 0).formattedDuration)
            .isEqualTo("0:00")
    }

    @Test
    fun `single-digit seconds are zero-padded`() {
        assertThat(BubbleAudio(attachmentId = "a1", durationSeconds = 5).formattedDuration)
            .isEqualTo("0:05")
    }

    @Test
    fun `a clip over a minute splits into minutes and seconds`() {
        assertThat(BubbleAudio(attachmentId = "a1", durationSeconds = 65).formattedDuration)
            .isEqualTo("1:05")
    }

    @Test
    fun `minutes are not zero-padded and can exceed 59`() {
        assertThat(BubbleAudio(attachmentId = "a1", durationSeconds = 3661).formattedDuration)
            .isEqualTo("61:01")
    }

    @Test
    fun `an unknown duration has no formatted label`() {
        assertThat(BubbleAudio(attachmentId = "a1", durationSeconds = null).formattedDuration)
            .isNull()
    }

    @Test
    fun `a negative duration is treated as unknown`() {
        assertThat(BubbleAudio(attachmentId = "a1", durationSeconds = -3).formattedDuration)
            .isNull()
    }

    @Test
    fun `an audio with a non-blank url is playable`() {
        assertThat(BubbleAudio(attachmentId = "a1", url = "https://cdn/a.m4a").isPlayable).isTrue()
    }

    @Test
    fun `an audio with a null url is not playable`() {
        assertThat(BubbleAudio(attachmentId = "a1", url = null).isPlayable).isFalse()
    }

    @Test
    fun `an audio with a blank url is not playable`() {
        assertThat(BubbleAudio(attachmentId = "a1", url = "   ").isPlayable).isFalse()
    }

    @Test
    fun `a non-blank transcription is surfaced`() {
        assertThat(BubbleAudio(attachmentId = "a1", transcriptionText = "bonjour").hasTranscription)
            .isTrue()
    }

    @Test
    fun `a blank transcription is not surfaced`() {
        assertThat(BubbleAudio(attachmentId = "a1", transcriptionText = "  ").hasTranscription)
            .isFalse()
    }

    @Test
    fun `a null transcription is not surfaced`() {
        assertThat(BubbleAudio(attachmentId = "a1", transcriptionText = null).hasTranscription)
            .isFalse()
    }
}
