package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AttachmentTranscriptionMergeTest {

    private fun audio(
        id: String = "a1",
        transcription: ApiAttachmentTranscription? = null,
    ) = ApiMessageAttachment(id = id, mimeType = "audio/m4a", transcription = transcription)

    private fun image(id: String = "img1") =
        ApiMessageAttachment(id = id, mimeType = "image/png")

    private fun message(
        id: String = "m1",
        deletedAt: String? = null,
        attachments: List<ApiMessageAttachment> = listOf(audio()),
    ) = ApiMessage(
        id = id,
        conversationId = "c1",
        deletedAt = deletedAt,
        attachments = attachments,
    )

    @Test
    fun `sets the transcription on the single audio attachment when no attachment id is given`() {
        val merged = AttachmentTranscriptionMerge.mergeTranscription(message(), null, "Hello there")

        assertThat(merged).isNotNull()
        assertThat(merged!!.attachments.single().transcription?.text).isEqualTo("Hello there")
    }

    @Test
    fun `targets the attachment matching the given id`() {
        val merged = AttachmentTranscriptionMerge.mergeTranscription(
            message(attachments = listOf(audio("a1"), audio("a2"))),
            "a2",
            "Second track",
        )!!

        assertThat(merged.attachments[0].transcription).isNull()
        assertThat(merged.attachments[1].transcription?.text).isEqualTo("Second track")
    }

    @Test
    fun `an attachment id that matches nothing is a no-op`() {
        val merged = AttachmentTranscriptionMerge.mergeTranscription(message(), "ghost", "Hello")

        assertThat(merged).isNull()
    }

    @Test
    fun `a blank attachment id falls back to the first audio attachment`() {
        val merged = AttachmentTranscriptionMerge.mergeTranscription(
            message(attachments = listOf(image("i1"), audio("a1"), audio("a2"))),
            "   ",
            "Voice note",
        )!!

        assertThat(merged.attachments[1].transcription?.text).isEqualTo("Voice note")
        assertThat(merged.attachments[2].transcription).isNull()
    }

    @Test
    fun `a message with no audio attachment and no id is a no-op`() {
        val merged = AttachmentTranscriptionMerge.mergeTranscription(
            message(attachments = listOf(image("i1"))),
            null,
            "Hello",
        )

        assertThat(merged).isNull()
    }

    @Test
    fun `a blank text is a no-op`() {
        assertThat(AttachmentTranscriptionMerge.mergeTranscription(message(), null, "")).isNull()
    }

    @Test
    fun `a whitespace-only text is a no-op`() {
        assertThat(AttachmentTranscriptionMerge.mergeTranscription(message(), null, "   ")).isNull()
    }

    @Test
    fun `a deleted tombstone is never transcribed`() {
        val deleted = message(deletedAt = "2026-07-10T10:00:00Z")

        assertThat(AttachmentTranscriptionMerge.mergeTranscription(deleted, null, "Hello")).isNull()
    }

    @Test
    fun `an identical transcription already present is a no-op`() {
        val seeded = message(
            attachments = listOf(audio(transcription = ApiAttachmentTranscription(text = "Hello", language = "en"))),
        )

        assertThat(AttachmentTranscriptionMerge.mergeTranscription(seeded, null, "Hello", language = "en")).isNull()
    }

    @Test
    fun `an identical transcription matched case-insensitively on language is a no-op`() {
        val seeded = message(
            attachments = listOf(audio(transcription = ApiAttachmentTranscription(text = "Hello", language = "EN"))),
        )

        assertThat(AttachmentTranscriptionMerge.mergeTranscription(seeded, null, "Hello", language = "en")).isNull()
    }

    @Test
    fun `same text but a different language replaces in place`() {
        val seeded = message(
            attachments = listOf(audio(transcription = ApiAttachmentTranscription(text = "Ciao", language = "it"))),
        )

        val merged = AttachmentTranscriptionMerge.mergeTranscription(seeded, null, "Ciao", language = "es")!!

        assertThat(merged.attachments.single().transcription?.language).isEqualTo("es")
    }

    @Test
    fun `a new text replaces the existing transcription`() {
        val seeded = message(
            attachments = listOf(audio(transcription = ApiAttachmentTranscription(text = "old", language = "en"))),
        )

        val merged = AttachmentTranscriptionMerge.mergeTranscription(seeded, null, "new", language = "en")!!

        assertThat(merged.attachments.single().transcription?.text).isEqualTo("new")
    }

    @Test
    fun `the identical check reads the transcribedText fallback`() {
        val seeded = message(
            attachments = listOf(
                audio(transcription = ApiAttachmentTranscription(text = null, transcribedText = "Hola", language = "es")),
            ),
        )

        assertThat(AttachmentTranscriptionMerge.mergeTranscription(seeded, null, "Hola", language = "es")).isNull()
    }

    @Test
    fun `stamps language, confidence and duration from the event`() {
        val merged = AttachmentTranscriptionMerge.mergeTranscription(
            message(),
            null,
            "Hello",
            language = "en",
            confidence = 0.92,
            durationMs = 4200L,
        )!!

        val transcription = merged.attachments.single().transcription!!
        assertThat(transcription.language).isEqualTo("en")
        assertThat(transcription.confidence).isEqualTo(0.92)
        assertThat(transcription.durationMs).isEqualTo(4200)
    }

    @Test
    fun `a blank language is stored as null`() {
        val merged = AttachmentTranscriptionMerge.mergeTranscription(message(), null, "Hello", language = "  ")!!

        assertThat(merged.attachments.single().transcription?.language).isNull()
    }

    @Test
    fun `other attachments are preserved untouched`() {
        val merged = AttachmentTranscriptionMerge.mergeTranscription(
            message(attachments = listOf(image("i1"), audio("a1"))),
            "a1",
            "Hello",
        )!!

        assertThat(merged.attachments[0].id).isEqualTo("i1")
        assertThat(merged.attachments[0].mimeType).isEqualTo("image/png")
        assertThat(merged.attachments).hasSize(2)
    }

    @Test
    fun `unrelated message fields are preserved`() {
        val merged = AttachmentTranscriptionMerge.mergeTranscription(
            message(id = "keep"),
            null,
            "Hello",
        )!!

        assertThat(merged.id).isEqualTo("keep")
        assertThat(merged.conversationId).isEqualTo("c1")
    }
}
