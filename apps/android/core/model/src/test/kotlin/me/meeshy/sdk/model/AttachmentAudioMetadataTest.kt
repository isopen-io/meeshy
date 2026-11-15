package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AttachmentAudioMetadataTest {

    private fun transcription(text: String?, language: String? = "fr") =
        text?.let { ApiAttachmentTranscription(text = it, language = language) }

    private fun track(url: String?, transcription: String = "") =
        ApiAttachmentTranslation(type = "audio", url = url, transcription = transcription)

    private fun attachment(
        id: String = "a1",
        transcription: ApiAttachmentTranscription? = null,
        translations: Map<String, ApiAttachmentTranslation>? = null,
        fileUrl: String? = "https://cdn/a.m4a",
    ) = ApiMessageAttachment(
        id = id,
        mimeType = "audio/m4a",
        fileUrl = fileUrl,
        transcription = transcription,
        translations = translations,
    )

    private fun message(vararg attachments: ApiMessageAttachment) =
        ApiMessage(id = "m1", conversationId = "c1", attachments = attachments.toList())

    // ── mergedAttachment : transcription ──────────────────────────────────────────────

    @Test
    fun `forced, the served transcription replaces the cached one`() {
        val merged = AttachmentAudioMetadata.mergedAttachment(
            cached = attachment(transcription = transcription("old")),
            served = attachment(transcription = transcription("new")),
            forceOverwrite = true,
        )

        assertThat(merged.transcription?.text).isEqualTo("new")
    }

    @Test
    fun `not forced, the first to arrive wins`() {
        val merged = AttachmentAudioMetadata.mergedAttachment(
            cached = attachment(transcription = transcription("old")),
            served = attachment(transcription = transcription("new")),
            forceOverwrite = false,
        )

        assertThat(merged.transcription?.text).isEqualTo("old")
    }

    @Test
    fun `not forced, a served transcription fills an empty cache`() {
        val merged = AttachmentAudioMetadata.mergedAttachment(
            cached = attachment(),
            served = attachment(transcription = transcription("new")),
            forceOverwrite = false,
        )

        assertThat(merged.transcription?.text).isEqualTo("new")
    }

    @Test
    fun `a served page without transcription never erases the cached one`() {
        listOf(true, false).forEach { force ->
            val merged = AttachmentAudioMetadata.mergedAttachment(
                cached = attachment(transcription = transcription("held")),
                served = attachment(),
                forceOverwrite = force,
            )

            assertThat(merged.transcription?.text).isEqualTo("held")
        }
    }

    @Test
    fun `a blank served transcription never erases the cached one`() {
        val merged = AttachmentAudioMetadata.mergedAttachment(
            cached = attachment(transcription = transcription("held")),
            served = attachment(transcription = transcription("  ")),
            forceOverwrite = true,
        )

        assertThat(merged.transcription?.text).isEqualTo("held")
    }

    @Test
    fun `the served transcription keeps its segments`() {
        val segments = listOf(TranscriptionSegment(text = "hi", startTime = 0.0, endTime = 1.0))
        val merged = AttachmentAudioMetadata.mergedAttachment(
            cached = attachment(),
            served = attachment(transcription = ApiAttachmentTranscription(text = "hi", segments = segments, speakerCount = 2)),
            forceOverwrite = true,
        )

        assertThat(merged.transcription?.segments).isEqualTo(segments)
        assertThat(merged.transcription?.speakerCount).isEqualTo(2)
    }

    @Test
    fun `the other served fields are the served ones`() {
        val merged = AttachmentAudioMetadata.mergedAttachment(
            cached = attachment(fileUrl = "file:///local.m4a"),
            served = attachment(fileUrl = "https://cdn/served.m4a"),
            forceOverwrite = true,
        )

        assertThat(merged.fileUrl).isEqualTo("https://cdn/served.m4a")
    }

    // ── mergedAttachment : pistes traduites ───────────────────────────────────────────

    @Test
    fun `translated tracks are unioned by language`() {
        val merged = AttachmentAudioMetadata.mergedAttachment(
            cached = attachment(translations = mapOf("fr" to track("https://cdn/fr.mp3"))),
            served = attachment(translations = mapOf("es" to track("https://cdn/es.mp3"))),
            forceOverwrite = true,
        )

        assertThat(merged.translations?.keys).containsExactly("fr", "es")
    }

    @Test
    fun `forced, the served track of a language wins, case insensitively`() {
        val merged = AttachmentAudioMetadata.mergedAttachment(
            cached = attachment(translations = mapOf("fr" to track("https://cdn/old.mp3"))),
            served = attachment(translations = mapOf("FR" to track("https://cdn/new.mp3"))),
            forceOverwrite = true,
        )

        assertThat(merged.translations?.values?.map { it.url }).containsExactly("https://cdn/new.mp3")
        assertThat(merged.translations).hasSize(1)
    }

    @Test
    fun `not forced, the cached track of a language wins`() {
        val merged = AttachmentAudioMetadata.mergedAttachment(
            cached = attachment(translations = mapOf("fr" to track("https://cdn/old.mp3"))),
            served = attachment(translations = mapOf("fr" to track("https://cdn/new.mp3"))),
            forceOverwrite = false,
        )

        assertThat(merged.translations?.getValue("fr")?.url).isEqualTo("https://cdn/old.mp3")
    }

    @Test
    fun `a served page without tracks never removes the cached ones`() {
        val merged = AttachmentAudioMetadata.mergedAttachment(
            cached = attachment(translations = mapOf("fr" to track("https://cdn/fr.mp3"))),
            served = attachment(translations = null),
            forceOverwrite = true,
        )

        assertThat(merged.translations?.keys).containsExactly("fr")
    }

    @Test
    fun `an empty served url never replaces a playable one`() {
        val merged = AttachmentAudioMetadata.mergedAttachment(
            cached = attachment(translations = mapOf("fr" to track("https://cdn/fr.mp3"))),
            served = attachment(translations = mapOf("fr" to track(" ", transcription = "bonjour"))),
            forceOverwrite = true,
        )

        assertThat(merged.translations?.getValue("fr")?.url).isEqualTo("https://cdn/fr.mp3")
    }

    // ── superseded* ───────────────────────────────────────────────────────────────────

    @Test
    fun `a transcription the server now serves differently is superseded`() {
        val before = message(attachment(transcription = transcription("old")))
        val after = message(attachment(transcription = transcription("new")))

        assertThat(AttachmentAudioMetadata.supersededTranscriptions(before, after)).containsExactly("a1")
    }

    @Test
    fun `an unchanged or absent served transcription is not superseded`() {
        val held = message(attachment(transcription = transcription("same")))

        assertThat(AttachmentAudioMetadata.supersededTranscriptions(held, held)).isEmpty()
        assertThat(AttachmentAudioMetadata.supersededTranscriptions(held, message(attachment()))).isEmpty()
    }

    @Test
    fun `a track the server now serves differently is superseded for its language`() {
        val before = message(attachment(translations = mapOf("fr" to track("https://cdn/old.mp3"))))
        val after = message(attachment(translations = mapOf("fr" to track("https://cdn/new.mp3"), "es" to track("https://cdn/es.mp3"))))

        assertThat(AttachmentAudioMetadata.supersededAudio(before, after))
            .containsExactly("a1" to "fr", "a1" to "es")
    }

    @Test
    fun `an unchanged track is not superseded`() {
        val held = message(attachment(translations = mapOf("fr" to track("https://cdn/fr.mp3"))))

        assertThat(AttachmentAudioMetadata.supersededAudio(held, held)).isEmpty()
    }

    // ── rekeyed ───────────────────────────────────────────────────────────────────────

    private fun stored(messageId: String, attachmentId: String, text: String) =
        StoredTranscription(messageId = messageId, attachmentId = attachmentId, text = text, language = "fr")

    @Test
    fun `a local transcription is copied under the server id`() {
        val rows = AttachmentAudioMetadata.rekeyedTranscriptions(
            local = listOf(stored("cid_1", "p1", "salut")),
            server = emptyList(),
            serverId = "srv1",
            attachmentIds = mapOf("p1" to "att1"),
        )

        assertThat(rows).containsExactly(stored("srv1", "att1", "salut"))
    }

    @Test
    fun `a transcription already arrived from the server is never overwritten`() {
        val rows = AttachmentAudioMetadata.rekeyedTranscriptions(
            local = listOf(stored("cid_1", "p1", "local")),
            server = listOf(stored("srv1", "att1", "serveur")),
            serverId = "srv1",
            attachmentIds = mapOf("p1" to "att1"),
        )

        assertThat(rows).isEmpty()
    }

    @Test
    fun `rekeying twice writes nothing the second time`() {
        val local = listOf(stored("cid_1", "p1", "salut"))
        val first = AttachmentAudioMetadata.rekeyedTranscriptions(local, emptyList(), "srv1", mapOf("p1" to "att1"))
        val second = AttachmentAudioMetadata.rekeyedTranscriptions(local, first, "srv1", mapOf("p1" to "att1"))

        assertThat(second).isEmpty()
    }

    @Test
    fun `without an attachment map the id is kept`() {
        val rows = AttachmentAudioMetadata.rekeyedTranscriptions(
            local = listOf(stored("cid_1", "p1", "salut")),
            server = emptyList(),
            serverId = "srv1",
            attachmentIds = emptyMap(),
        )

        assertThat(rows).containsExactly(stored("srv1", "p1", "salut"))
    }

    @Test
    fun `a row whose id is already the server id is ignored`() {
        val rows = AttachmentAudioMetadata.rekeyedTranscriptions(
            local = listOf(stored("srv1", "att1", "salut")),
            server = emptyList(),
            serverId = "srv1",
            attachmentIds = emptyMap(),
        )

        assertThat(rows).isEmpty()
    }

    private fun audioRow(messageId: String, attachmentId: String, language: String, url: String) =
        StoredAudioTranslation(messageId = messageId, attachmentId = attachmentId, language = language, url = url)

    @Test
    fun `a local audio track is copied under the server id and never overwrites a served one`() {
        val rows = AttachmentAudioMetadata.rekeyedAudio(
            local = listOf(audioRow("cid_1", "p1", "fr", "u-fr"), audioRow("cid_1", "p1", "es", "u-es")),
            server = listOf(audioRow("srv1", "att1", "es", "served-es")),
            serverId = "srv1",
            attachmentIds = mapOf("p1" to "att1"),
        )

        assertThat(rows).containsExactly(audioRow("srv1", "att1", "fr", "u-fr"))
    }

    @Test
    fun `rekeying audio twice writes nothing the second time`() {
        val local = listOf(audioRow("cid_1", "p1", "fr", "u-fr"))
        val first = AttachmentAudioMetadata.rekeyedAudio(local, emptyList(), "srv1", mapOf("p1" to "att1"))
        val second = AttachmentAudioMetadata.rekeyedAudio(local, first, "srv1", mapOf("p1" to "att1"))

        assertThat(second).isEmpty()
    }

    // ── attachmentIdMap ───────────────────────────────────────────────────────────────

    private fun voice(id: String) = ApiMessageAttachment(id = id, mimeType = "audio/m4a")

    private fun image(id: String) = ApiMessageAttachment(id = id, mimeType = "image/png")

    @Test
    fun `placeholders follow the served audio attachments by rank`() {
        val map = AttachmentAudioMetadata.attachmentIdMap(
            local = listOf(image("up_img"), voice("up_1"), voice("up_2")),
            served = listOf(voice("att1"), image("att_img"), voice("att2")),
        )

        assertThat(map).containsExactly("up_1", "att1", "up_2", "att2")
    }

    @Test
    fun `an id the server kept needs no entry`() {
        val map = AttachmentAudioMetadata.attachmentIdMap(local = listOf(voice("a1")), served = listOf(voice("a1")))

        assertThat(map).isEmpty()
    }

    @Test
    fun `without as many served audios nothing is guessed`() {
        val map = AttachmentAudioMetadata.attachmentIdMap(local = listOf(voice("up_1"), voice("up_2")), served = listOf(voice("att1")))

        assertThat(map).isEmpty()
    }
}
