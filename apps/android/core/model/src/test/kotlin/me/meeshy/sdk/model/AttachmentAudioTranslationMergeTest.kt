package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AttachmentAudioTranslationMergeTest {

    private fun audio(
        id: String = "a1",
        translations: Map<String, ApiAttachmentTranslation>? = null,
    ) = ApiMessageAttachment(id = id, mimeType = "audio/m4a", translations = translations)

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
    fun `upserts a cloned-voice translation onto the single audio attachment when no id is given`() {
        val merged = AttachmentAudioTranslationMerge.mergeAudioTranslation(
            message(),
            attachmentId = null,
            language = "es",
            url = "https://cdn/es.mp3",
            transcription = "hola a todos",
        )!!

        val translation = merged.attachments.single().translations!!.getValue("es")
        assertThat(translation.url).isEqualTo("https://cdn/es.mp3")
        assertThat(translation.transcription).isEqualTo("hola a todos")
        assertThat(translation.type).isEqualTo("audio")
    }

    @Test
    fun `targets the attachment matching the given id`() {
        val merged = AttachmentAudioTranslationMerge.mergeAudioTranslation(
            message(attachments = listOf(audio("a1"), audio("a2"))),
            attachmentId = "a2",
            language = "es",
            url = "https://cdn/es.mp3",
        )!!

        assertThat(merged.attachments[0].translations).isNull()
        assertThat(merged.attachments[1].translations!!.getValue("es").url).isEqualTo("https://cdn/es.mp3")
    }

    @Test
    fun `an attachment id that matches nothing is a no-op`() {
        val merged = AttachmentAudioTranslationMerge.mergeAudioTranslation(
            message(), attachmentId = "ghost", language = "es", url = "https://cdn/es.mp3",
        )

        assertThat(merged).isNull()
    }

    @Test
    fun `a blank attachment id falls back to the first audio attachment`() {
        val merged = AttachmentAudioTranslationMerge.mergeAudioTranslation(
            message(attachments = listOf(image("i1"), audio("a1"), audio("a2"))),
            attachmentId = "   ",
            language = "es",
            url = "https://cdn/es.mp3",
        )!!

        assertThat(merged.attachments[1].translations!!.getValue("es").url).isEqualTo("https://cdn/es.mp3")
        assertThat(merged.attachments[2].translations).isNull()
    }

    @Test
    fun `a message with no audio attachment and no id is a no-op`() {
        val merged = AttachmentAudioTranslationMerge.mergeAudioTranslation(
            message(attachments = listOf(image("i1"))),
            attachmentId = null,
            language = "es",
            url = "https://cdn/es.mp3",
        )

        assertThat(merged).isNull()
    }

    @Test
    fun `a blank language is a no-op`() {
        assertThat(
            AttachmentAudioTranslationMerge.mergeAudioTranslation(
                message(), attachmentId = null, language = "  ", url = "https://cdn/es.mp3",
            ),
        ).isNull()
    }

    @Test
    fun `a blank url is a no-op — the Prisme never stores an unplayable audio translation`() {
        assertThat(
            AttachmentAudioTranslationMerge.mergeAudioTranslation(
                message(), attachmentId = null, language = "es", url = "",
            ),
        ).isNull()
    }

    @Test
    fun `a whitespace-only url is a no-op`() {
        assertThat(
            AttachmentAudioTranslationMerge.mergeAudioTranslation(
                message(), attachmentId = null, language = "es", url = "   ",
            ),
        ).isNull()
    }

    @Test
    fun `a deleted tombstone never receives an audio translation`() {
        val deleted = message(deletedAt = "2026-07-10T10:00:00Z")

        assertThat(
            AttachmentAudioTranslationMerge.mergeAudioTranslation(
                deleted, attachmentId = null, language = "es", url = "https://cdn/es.mp3",
            ),
        ).isNull()
    }

    @Test
    fun `an identical audio translation already present is a no-op`() {
        val seeded = message(
            attachments = listOf(
                audio(
                    translations = mapOf(
                        "es" to ApiAttachmentTranslation(url = "https://cdn/es.mp3", transcription = "hola"),
                    ),
                ),
            ),
        )

        assertThat(
            AttachmentAudioTranslationMerge.mergeAudioTranslation(
                seeded, attachmentId = null, language = "es", url = "https://cdn/es.mp3", transcription = "hola",
            ),
        ).isNull()
    }

    @Test
    fun `an identical translation matched case-insensitively on the language key is a no-op`() {
        val seeded = message(
            attachments = listOf(
                audio(
                    translations = mapOf(
                        "ES" to ApiAttachmentTranslation(url = "https://cdn/es.mp3", transcription = "hola"),
                    ),
                ),
            ),
        )

        assertThat(
            AttachmentAudioTranslationMerge.mergeAudioTranslation(
                seeded, attachmentId = null, language = "es", url = "https://cdn/es.mp3", transcription = "hola",
            ),
        ).isNull()
    }

    @Test
    fun `a new url replaces the existing translation in place under the existing key`() {
        val seeded = message(
            attachments = listOf(
                audio(
                    translations = mapOf(
                        "ES" to ApiAttachmentTranslation(url = "https://cdn/old.mp3", transcription = "hola"),
                    ),
                ),
            ),
        )

        val merged = AttachmentAudioTranslationMerge.mergeAudioTranslation(
            seeded, attachmentId = null, language = "es", url = "https://cdn/new.mp3", transcription = "hola",
        )!!

        val translations = merged.attachments.single().translations!!
        assertThat(translations).hasSize(1)
        assertThat(translations.getValue("ES").url).isEqualTo("https://cdn/new.mp3")
    }

    @Test
    fun `a differing transcription for the same url replaces in place`() {
        val seeded = message(
            attachments = listOf(
                audio(
                    translations = mapOf(
                        "es" to ApiAttachmentTranslation(url = "https://cdn/es.mp3", transcription = "old"),
                    ),
                ),
            ),
        )

        val merged = AttachmentAudioTranslationMerge.mergeAudioTranslation(
            seeded, attachmentId = null, language = "es", url = "https://cdn/es.mp3", transcription = "new",
        )!!

        assertThat(merged.attachments.single().translations!!.getValue("es").transcription).isEqualTo("new")
    }

    @Test
    fun `a translation for a new language is appended, preserving the existing one`() {
        val seeded = message(
            attachments = listOf(
                audio(
                    translations = mapOf(
                        "es" to ApiAttachmentTranslation(url = "https://cdn/es.mp3", transcription = "hola"),
                    ),
                ),
            ),
        )

        val merged = AttachmentAudioTranslationMerge.mergeAudioTranslation(
            seeded, attachmentId = null, language = "de", url = "https://cdn/de.mp3", transcription = "hallo",
        )!!

        val translations = merged.attachments.single().translations!!
        assertThat(translations.keys).containsExactly("es", "de").inOrder()
        assertThat(translations.getValue("de").url).isEqualTo("https://cdn/de.mp3")
    }

    @Test
    fun `stamps format, cloned, quality, voiceModelId, ttsModel and duration from the event`() {
        val merged = AttachmentAudioTranslationMerge.mergeAudioTranslation(
            message(),
            attachmentId = null,
            language = "es",
            url = "https://cdn/es.mp3",
            transcription = "hola",
            durationMs = 5200L,
            format = "mp3",
            cloned = true,
            quality = 0.87,
            voiceModelId = "vm-9",
            ttsModel = "xtts",
        )!!

        val translation = merged.attachments.single().translations!!.getValue("es")
        assertThat(translation.durationMs).isEqualTo(5200)
        assertThat(translation.format).isEqualTo("mp3")
        assertThat(translation.cloned).isTrue()
        assertThat(translation.quality).isEqualTo(0.87)
        assertThat(translation.voiceModelId).isEqualTo("vm-9")
        assertThat(translation.ttsModel).isEqualTo("xtts")
    }

    @Test
    fun `the language key is stored trimmed`() {
        val merged = AttachmentAudioTranslationMerge.mergeAudioTranslation(
            message(), attachmentId = null, language = "  es  ", url = "https://cdn/es.mp3",
        )!!

        assertThat(merged.attachments.single().translations!!.keys).containsExactly("es")
    }

    @Test
    fun `other attachments are preserved untouched`() {
        val merged = AttachmentAudioTranslationMerge.mergeAudioTranslation(
            message(attachments = listOf(image("i1"), audio("a1"))),
            attachmentId = "a1",
            language = "es",
            url = "https://cdn/es.mp3",
        )!!

        assertThat(merged.attachments[0].id).isEqualTo("i1")
        assertThat(merged.attachments[0].mimeType).isEqualTo("image/png")
        assertThat(merged.attachments).hasSize(2)
    }

    @Test
    fun `unrelated message fields are preserved`() {
        val merged = AttachmentAudioTranslationMerge.mergeAudioTranslation(
            message(id = "keep"), attachmentId = null, language = "es", url = "https://cdn/es.mp3",
        )!!

        assertThat(merged.id).isEqualTo("keep")
        assertThat(merged.conversationId).isEqualTo("c1")
    }
}
