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

    private fun message(
        id: String,
        attachments: List<ApiMessageAttachment>,
        deletedAt: String? = null,
        isEncrypted: Boolean? = null,
        encryptionMode: String? = null,
    ) = ApiMessage(
        id = id,
        conversationId = "c1",
        deletedAt = deletedAt,
        isEncrypted = isEncrypted,
        encryptionMode = encryptionMode,
        attachments = attachments,
    )

    @Test
    fun `the single refetch waits five seconds over a window of five`() {
        assertThat(TranscriptionRetryScheduler.SINGLE_RETRY_DELAY_MS).isEqualTo(5_000L)
        assertThat(TranscriptionRetryScheduler.REFETCH_WINDOW).isEqualTo(5)
    }

    @Test
    fun `an audio message without transcription is retained`() {
        assertThat(TranscriptionRetryScheduler.idsMissingTranscription(listOf(message("m1", listOf(audio())))))
            .containsExactly("m1")
    }

    @Test
    fun `an already transcribed audio message is not retained`() {
        val transcribed = audio(ApiAttachmentTranscription(text = "salut"))
        assertThat(TranscriptionRetryScheduler.idsMissingTranscription(listOf(message("m1", listOf(transcribed))))).isEmpty()
    }

    @Test
    fun `an image message is not retained`() {
        val image = ApiMessageAttachment(id = "i1", mimeType = "image/png")
        assertThat(TranscriptionRetryScheduler.idsMissingTranscription(listOf(message("m1", listOf(image))))).isEmpty()
    }

    @Test
    fun `a message mixing a transcribed audio and an untranscribed one is retained`() {
        val transcribed = audio(ApiAttachmentTranscription(text = "salut")).copy(id = "a1")
        val pending = audio().copy(id = "a2")
        assertThat(TranscriptionRetryScheduler.idsMissingTranscription(listOf(message("m1", listOf(transcribed, pending)))))
            .containsExactly("m1")
    }

    @Test
    fun `an empty list gives an empty list`() {
        assertThat(TranscriptionRetryScheduler.idsMissingTranscription(emptyList())).isEmpty()
    }

    @Test
    fun `a blank transcription text is retained`() {
        val blank = audio(ApiAttachmentTranscription(text = "   "))
        assertThat(TranscriptionRetryScheduler.idsMissingTranscription(listOf(message("m1", listOf(blank))))).containsExactly("m1")
    }

    @Test
    fun `an end to end encrypted message is never retained, the server cannot read it`() {
        val sealed = message("m1", listOf(audio()), isEncrypted = true, encryptionMode = "e2ee")
        assertThat(TranscriptionRetryScheduler.idsMissingTranscription(listOf(sealed))).isEmpty()
    }

    @Test
    fun `a deleted message is never retained`() {
        val gone = message("m1", listOf(audio()), deletedAt = "2026-11-04T10:00:00Z")
        assertThat(TranscriptionRetryScheduler.idsMissingTranscription(listOf(gone))).isEmpty()
    }

    @Test
    fun `ids keep their order and appear once`() {
        val messages = listOf(
            message("m2", listOf(audio())),
            message("m1", listOf(audio())),
            message("m2", listOf(audio())),
        )
        assertThat(TranscriptionRetryScheduler.idsMissingTranscription(messages)).containsExactly("m2", "m1").inOrder()
    }
}
