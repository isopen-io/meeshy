package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AttachmentLiveDeltasTest {

    private fun audio(id: String = "a1", mime: String = "audio/mp4", build: ApiMessageAttachment.() -> ApiMessageAttachment = { this }) =
        ApiMessageAttachment(id = id, mimeType = mime, fileUrl = "https://cdn/$id").build()

    private fun message(
        vararg pieces: ApiMessageAttachment,
        senderId: String = "author",
        recipientCount: Int? = 1,
        isEncrypted: Boolean? = null,
        encryptionMode: String? = null,
        deletedAt: String? = null,
    ) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        senderId = senderId,
        content = "",
        recipientCount = recipientCount,
        attachments = pieces.toList(),
        isEncrypted = isEncrypted,
        encryptionMode = encryptionMode,
        deletedAt = deletedAt,
    )

    private fun status(
        userId: String? = "other",
        action: String? = "listened",
        position: Long? = 4_000,
        complete: Boolean? = null,
        updatedAt: String? = "2026-10-29T10:00:00Z",
        attachmentId: String = "a1",
        conversationId: String = "c1",
    ) = AttachmentStatusUpdatedEvent(
        attachmentId = attachmentId, messageId = "m1", conversationId = conversationId, userId = userId, action = action,
        updatedAt = updatedAt, playPositionMs = position, durationMs = 10_000, complete = complete,
    )

    // ── Mon propre rapport (autre appareil) : la progression du lecteur ──

    @Test
    fun `my own listening on another device moves my resume position`() {
        val result = AttachmentLiveDeltas.status(message(audio()), status(userId = "me", position = 6_500), viewerId = "me")

        assertThat(result.attachments.single().currentUserConsumption?.lastPlayPositionMs).isEqualTo(6_500)
        assertThat(result.attachments.single().currentUserConsumption?.listenedComplete).isFalse()
    }

    @Test
    fun `my own completed listening is never taken back by a later partial echo`() {
        val done = AttachmentLiveDeltas.status(message(audio()), status(userId = "me", position = 10_000, complete = true), viewerId = "me")
        val later = AttachmentLiveDeltas.status(done, status(userId = "me", position = 2_000, complete = false), viewerId = "me")

        assertThat(later.attachments.single().currentUserConsumption?.listenedComplete).isTrue()
    }

    @Test
    fun `my own video report moves the watch position, not the listen one`() {
        val video = audio(mime = "video/mp4")
        val result = AttachmentLiveDeltas.status(message(video), status(userId = "me", action = "watched", position = 3_000, complete = true), viewerId = "me")

        val consumption = result.attachments.single().currentUserConsumption
        assertThat(consumption?.lastWatchPositionMs).isEqualTo(3_000)
        assertThat(consumption?.watchedComplete).isTrue()
        assertThat(consumption?.lastPlayPositionMs).isNull()
    }

    @Test
    fun `my own download or view carries no progress and writes nothing`() {
        val original = message(audio())

        assertThat(AttachmentLiveDeltas.status(original, status(userId = "me", action = "downloaded"), viewerId = "me")).isSameInstanceAs(original)
        assertThat(AttachmentLiveDeltas.status(original, status(userId = "me", action = "viewed"), viewerId = "me")).isSameInstanceAs(original)
    }

    @Test
    fun `a replayed echo of my own report is the same instance`() {
        val once = AttachmentLiveDeltas.status(message(audio()), status(userId = "me", position = 6_500), viewerId = "me")

        assertThat(AttachmentLiveDeltas.status(once, status(userId = "me", position = 6_500), viewerId = "me")).isSameInstanceAs(once)
    }

    // ── Le seul autre participant d'un tête-à-tête : l'accusé « par tous » ──

    @Test
    fun `the only other participant listening marks the voice note listened by all`() {
        val result = AttachmentLiveDeltas.status(message(audio()), status(userId = "other"), viewerId = "me")

        val piece = result.attachments.single()
        assertThat(piece.listenedByAllAt).isEqualTo("2026-10-29T10:00:00Z")
        assertThat(piece.consumedCount).isEqualTo(1)
        assertThat(piece.currentUserConsumption).isNull()
    }

    @Test
    fun `the primary action follows the media type`() {
        val image = audio(mime = "image/jpeg")
        val video = audio(mime = "video/mp4")
        val file = audio(mime = "application/pdf")

        assertThat(AttachmentLiveDeltas.status(message(image), status(action = "viewed"), "me").attachments.single().viewedByAllAt).isNotNull()
        assertThat(AttachmentLiveDeltas.status(message(video), status(action = "watched"), "me").attachments.single().watchedByAllAt).isNotNull()
        assertThat(AttachmentLiveDeltas.status(message(file), status(action = "downloaded"), "me").attachments.single().downloadedByAllAt).isNotNull()
    }

    @Test
    fun `an action that is not the primary one of the media proves nothing`() {
        val original = message(audio())

        assertThat(AttachmentLiveDeltas.status(original, status(action = "downloaded"), "me")).isSameInstanceAs(original)
    }

    @Test
    fun `a group cannot say which member reported, so nothing is credited as by all`() {
        val group = message(audio(), recipientCount = 3)
        val unknown = message(audio(), recipientCount = null)

        assertThat(AttachmentLiveDeltas.status(group, status(), "me")).isSameInstanceAs(group)
        assertThat(AttachmentLiveDeltas.status(unknown, status(), "me")).isSameInstanceAs(unknown)
    }

    @Test
    fun `the author playing back their own voice note is not a recipient`() {
        val original = message(audio(), senderId = "author")

        assertThat(AttachmentLiveDeltas.status(original, status(userId = "author"), "author-device-viewer")).isSameInstanceAs(original)
    }

    @Test
    fun `a report with no author or no confirmation time credits nobody`() {
        val original = message(audio())

        assertThat(AttachmentLiveDeltas.status(original, status(userId = null), "me")).isSameInstanceAs(original)
        assertThat(AttachmentLiveDeltas.status(original, status(updatedAt = null), "me")).isSameInstanceAs(original)
    }

    @Test
    fun `an acknowledgement already recorded is kept and costs no write`() {
        val first = AttachmentLiveDeltas.status(message(audio()), status(updatedAt = "2026-10-29T10:00:00Z"), "me")

        assertThat(AttachmentLiveDeltas.status(first, status(updatedAt = "2026-10-29T11:00:00Z"), "me")).isSameInstanceAs(first)
    }

    // ── Barrières : adresse cohérente, pièce connue, message vivant, jamais de scellé ──

    @Test
    fun `an event addressed to another conversation or another piece touches nothing`() {
        val original = message(audio())

        assertThat(AttachmentLiveDeltas.status(original, status(conversationId = "other"), "me")).isSameInstanceAs(original)
        assertThat(AttachmentLiveDeltas.status(original, status(attachmentId = "ghost"), "me")).isSameInstanceAs(original)
    }

    @Test
    fun `a deleted message is never resurrected by an acknowledgement`() {
        val tomb = message(audio(), deletedAt = "2026-10-29T09:00:00Z")

        assertThat(AttachmentLiveDeltas.status(tomb, status(), "me")).isSameInstanceAs(tomb)
    }

    @Test
    fun `nothing is written for a sealed message or a sealed piece`() {
        val sealedMessage = message(audio(), isEncrypted = true, encryptionMode = "e2ee")
        val sealedPiece = message(audio { copy(isEncrypted = true, encryptionMode = "e2ee") })

        assertThat(AttachmentLiveDeltas.status(sealedMessage, status(), "me")).isSameInstanceAs(sealedMessage)
        assertThat(AttachmentLiveDeltas.status(sealedPiece, status(userId = "me"), "me")).isSameInstanceAs(sealedPiece)
    }

    // ── Pièce prête / modifiée ──

    private val incoming = ApiMessageAttachment(
        id = "a1", mimeType = "audio/mp4", fileUrl = "https://cdn/a1-final", thumbnailUrl = "https://cdn/a1-t", thumbHash = "hash",
        duration = 12_000, width = 640, height = 480,
        transcription = ApiAttachmentTranscription(text = "bonjour", language = "fr"),
        translations = mapOf("en" to ApiAttachmentTranslation(type = "audio", transcription = "hello", url = "https://cdn/en.mp3")),
    )

    @Test
    fun `a ready piece gets its address, thumbnail, duration and transcript`() {
        val pending = message(ApiMessageAttachment(id = "a1", mimeType = "audio/mp4", fileUrl = "https://cdn/a1"))

        val piece = AttachmentLiveDeltas.enriched(pending, "c1", "a1", incoming).attachments.single()

        assertThat(piece.fileUrl).isEqualTo("https://cdn/a1-final")
        assertThat(piece.thumbnailUrl).isEqualTo("https://cdn/a1-t")
        assertThat(piece.thumbHash).isEqualTo("hash")
        assertThat(piece.duration).isEqualTo(12_000)
        assertThat(piece.transcription?.text).isEqualTo("bonjour")
        assertThat(piece.translations?.keys).containsExactly("en")
    }

    @Test
    fun `a field the worker did not send never erases what the bubble already has`() {
        val rich = message(
            audio {
                copy(
                    thumbnailUrl = "https://cdn/old-t", duration = 9_000,
                    translations = mapOf("de" to ApiAttachmentTranslation(type = "audio", url = "https://cdn/de.mp3")),
                )
            },
        )
        val sparse = ApiMessageAttachment(id = "a1", fileUrl = "")

        val piece = AttachmentLiveDeltas.enriched(rich, "c1", "a1", sparse).attachments.single()

        assertThat(piece.fileUrl).isEqualTo("https://cdn/a1")
        assertThat(piece.thumbnailUrl).isEqualTo("https://cdn/old-t")
        assertThat(piece.duration).isEqualTo(9_000)
        assertThat(piece.translations?.keys).containsExactly("de")
    }

    @Test
    fun `the carried translations join the ones already played, a newer carried entry winning`() {
        val current = message(
            audio {
                copy(
                    translations = mapOf(
                        "de" to ApiAttachmentTranslation(type = "audio", url = "https://cdn/de.mp3"),
                        "en" to ApiAttachmentTranslation(type = "audio", url = "https://cdn/old-en.mp3", createdAt = "2026-10-29T08:00:00Z"),
                    ),
                )
            },
        )
        val newer = incoming.copy(
            translations = mapOf("en" to ApiAttachmentTranslation(type = "audio", url = "https://cdn/en.mp3", createdAt = "2026-10-29T09:00:00Z")),
        )

        val piece = AttachmentLiveDeltas.enriched(current, "c1", "a1", newer).attachments.single()

        assertThat(piece.translations?.keys).containsExactly("de", "en")
        assertThat(piece.translations?.getValue("en")?.url).isEqualTo("https://cdn/en.mp3")
    }

    @Test
    fun `a late replayed older track never overwrites a newer one of the same language`() {
        val current = message(
            audio {
                copy(
                    translations = mapOf(
                        "en" to ApiAttachmentTranslation(type = "audio", url = "https://cdn/new-en.mp3", createdAt = "2026-10-29T08:00:00Z", updatedAt = "2026-10-29T10:00:00Z"),
                    ),
                )
            },
        )
        val replayed = incoming.copy(
            translations = mapOf("en" to ApiAttachmentTranslation(type = "audio", url = "https://cdn/old-en.mp3", createdAt = "2026-10-29T08:00:00Z", updatedAt = "2026-10-29T09:00:00Z")),
        )

        val result = AttachmentLiveDeltas.enriched(current, "c1", "a1", replayed)
        val piece = result.attachments.single()

        assertThat(piece.translations?.getValue("en")?.url).isEqualTo("https://cdn/new-en.mp3")
        assertThat(piece.translations?.getValue("en")?.updatedAt).isEqualTo("2026-10-29T10:00:00Z")
    }

    @Test
    fun `without a served timestamp a playable track already held is kept`() {
        val current = message(
            audio { copy(translations = mapOf("en" to ApiAttachmentTranslation(type = "audio", url = "https://cdn/held-en.mp3"))) },
        )

        val piece = AttachmentLiveDeltas.enriched(current, "c1", "a1", incoming).attachments.single()

        assertThat(piece.translations?.getValue("en")?.url).isEqualTo("https://cdn/held-en.mp3")
    }

    @Test
    fun `a track held without an address is completed by the carried one of the same language`() {
        val current = message(
            audio { copy(translations = mapOf("en" to ApiAttachmentTranslation(type = "audio", transcription = "hello"))) },
        )

        val piece = AttachmentLiveDeltas.enriched(current, "c1", "a1", incoming).attachments.single()

        assertThat(piece.translations?.getValue("en")?.url).isEqualTo("https://cdn/en.mp3")
    }

    // ── Une vue unique consommée ou purgée ne revient jamais ──

    private fun viewOnceVoice(build: ApiMessageAttachment.() -> ApiMessageAttachment = { this }) =
        audio { copy(isViewOnce = true).build() }

    @Test
    fun `a purged view-once voice is not given back its address or transcript by a replayed update`() {
        val purged = ConversationEventDeltas.viewOncePurged(message(viewOnceVoice { copy(transcription = ApiAttachmentTranscription(text = "secret")) }))

        val result = AttachmentLiveDeltas.enriched(purged, "c1", "a1", incoming)

        assertThat(result).isSameInstanceAs(purged)
        val piece = result.attachments.single()
        assertThat(piece.fileUrl).isNull()
        assertThat(piece.transcription).isNull()
        assertThat(piece.translations).isNull()
    }

    @Test
    fun `a purged view-once declared only on the message is not refilled either`() {
        val purged = ConversationEventDeltas.viewOncePurged(
            message(audio()).copy(isViewOnce = true, viewOnceCount = 1),
        )

        assertThat(AttachmentLiveDeltas.enriched(purged, "c1", "a1", incoming)).isSameInstanceAs(purged)
    }

    @Test
    fun `a view-once voice I already opened takes no enrichment`() {
        val opened = message(viewOnceVoice()).copy(consumedByMe = true)

        assertThat(AttachmentLiveDeltas.enriched(opened, "c1", "a1", incoming)).isSameInstanceAs(opened)
    }

    @Test
    fun `a view-once voice not yet opened is still enriched`() {
        val fresh = message(viewOnceVoice())

        val piece = AttachmentLiveDeltas.enriched(fresh, "c1", "a1", incoming).attachments.single()

        assertThat(piece.transcription?.text).isEqualTo("bonjour")
    }

    @Test
    fun `an ordinary piece without an address yet is still enriched`() {
        val pending = message(ApiMessageAttachment(id = "a1", mimeType = "audio/mp4"))

        val piece = AttachmentLiveDeltas.enriched(pending, "c1", "a1", incoming).attachments.single()

        assertThat(piece.fileUrl).isEqualTo("https://cdn/a1-final")
    }

    @Test
    fun `my own reactions, my progress and the protection of the piece are never replaced by a broadcast`() {
        val mine = message(
            audio {
                copy(
                    currentUserReactions = listOf("❤️"), reactionSummary = mapOf("❤️" to 1),
                    currentUserConsumption = MeeshyMediaConsumption(lastPlayPositionMs = 3_000),
                    isViewOnce = true, isBlurred = true, effectFlags = 5L,
                )
            },
        )
        val broadcast = incoming.copy(currentUserReactions = emptyList(), reactionSummary = emptyMap(), isViewOnce = false, isBlurred = false, effectFlags = 0L)

        val piece = AttachmentLiveDeltas.enriched(mine, "c1", "a1", broadcast).attachments.single()

        assertThat(piece.currentUserReactions).containsExactly("❤️")
        assertThat(piece.reactionSummary).containsExactly("❤️", 1)
        assertThat(piece.currentUserConsumption?.lastPlayPositionMs).isEqualTo(3_000)
        assertThat(piece.isViewOnce).isTrue()
        assertThat(piece.isBlurred).isTrue()
        assertThat(piece.effectFlags).isEqualTo(5L)
    }

    @Test
    fun `an enrichment already applied is the same instance`() {
        val once = AttachmentLiveDeltas.enriched(message(audio()), "c1", "a1", incoming)

        assertThat(AttachmentLiveDeltas.enriched(once, "c1", "a1", incoming)).isSameInstanceAs(once)
    }

    @Test
    fun `an enrichment never touches another conversation, an unknown piece, a tombstone or a sealed message`() {
        val plain = message(audio())
        val tomb = message(audio(), deletedAt = "2026-10-29T09:00:00Z")
        val sealedMessage = message(audio(), isEncrypted = true, encryptionMode = "e2ee")
        val sealedPiece = message(audio { copy(isEncrypted = true, encryptionMode = "e2ee") })

        assertThat(AttachmentLiveDeltas.enriched(plain, "other", "a1", incoming)).isSameInstanceAs(plain)
        assertThat(AttachmentLiveDeltas.enriched(plain, "c1", "ghost", incoming)).isSameInstanceAs(plain)
        assertThat(AttachmentLiveDeltas.enriched(tomb, "c1", "a1", incoming)).isSameInstanceAs(tomb)
        assertThat(AttachmentLiveDeltas.enriched(sealedMessage, "c1", "a1", incoming)).isSameInstanceAs(sealedMessage)
        assertThat(AttachmentLiveDeltas.enriched(sealedPiece, "c1", "a1", incoming)).isSameInstanceAs(sealedPiece)
    }

    @Test
    fun `a sealed piece served by the worker writes no clear transcript or address`() {
        val plain = message(audio())
        val sealedIncoming = incoming.copy(isEncrypted = true, encryptionMode = "e2ee")

        assertThat(AttachmentLiveDeltas.enriched(plain, "c1", "a1", sealedIncoming)).isSameInstanceAs(plain)
    }

    @Test
    fun `server aggregates move forward only`() {
        val current = message(audio { copy(viewedCount = 2, listenedByAllAt = "2026-10-29T08:00:00Z") })
        val stale = incoming.copy(viewedCount = 0, listenedByAllAt = null)
        val fresher = incoming.copy(viewedCount = 3, listenedByAllAt = "2026-10-29T09:00:00Z")

        val kept = AttachmentLiveDeltas.enriched(current, "c1", "a1", stale).attachments.single()
        val moved = AttachmentLiveDeltas.enriched(current, "c1", "a1", fresher).attachments.single()

        assertThat(kept.viewedCount).isEqualTo(2)
        assertThat(kept.listenedByAllAt).isEqualTo("2026-10-29T08:00:00Z")
        assertThat(moved.viewedCount).isEqualTo(3)
    }
}
