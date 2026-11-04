package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TranscriptionRetrySchedulerTest {

    private fun audio(transcription: ApiAttachmentTranscription? = null) =
        ApiMessageAttachment(id = "a1", mimeType = "audio/m4a", transcription = transcription)

    @Test
    fun `the backoff grows then plateaus`() {
        val delays = (0 until TranscriptionRetryScheduler.MAX_ATTEMPTS).map { TranscriptionRetryScheduler.nextDelayMs(it, ready = false) }

        assertThat(delays).containsExactly(2_000L, 4_000L, 8_000L, 16_000L, 30_000L, 30_000L).inOrder()
    }

    @Test
    fun `retrying stops once the transcription is ready`() {
        assertThat(TranscriptionRetryScheduler.nextDelayMs(0, ready = true)).isNull()
    }

    @Test
    fun `retrying stops after the bounded number of attempts`() {
        assertThat(TranscriptionRetryScheduler.nextDelayMs(TranscriptionRetryScheduler.MAX_ATTEMPTS, ready = false)).isNull()
        assertThat(TranscriptionRetryScheduler.nextDelayMs(-1, ready = false)).isNull()
    }

    @Test
    fun `an audio attachment without text is pending, with text it is ready`() {
        assertThat(TranscriptionRetryScheduler.isPending(audio())).isTrue()
        assertThat(TranscriptionRetryScheduler.isPending(audio(ApiAttachmentTranscription(text = "  ")))).isTrue()
        assertThat(TranscriptionRetryScheduler.isPending(audio(ApiAttachmentTranscription(text = "hi")))).isFalse()
    }

    @Test
    fun `a non audio attachment is never pending`() {
        assertThat(TranscriptionRetryScheduler.isPending(ApiMessageAttachment(id = "i", mimeType = "image/png"))).isFalse()
    }
}
