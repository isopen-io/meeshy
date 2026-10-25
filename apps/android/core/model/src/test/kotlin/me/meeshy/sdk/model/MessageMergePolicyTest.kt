package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.push.PushPayload
import org.junit.Test

class MessageMergePolicyTest {

    private fun message(
        content: String = "salut",
        editedAt: String? = null,
        isEdited: Boolean = editedAt != null,
        deletedAt: String? = null,
        deliveredCount: Int = 0,
        readCount: Int = 0,
        translations: List<ApiTextTranslation> = emptyList(),
        reactionSummary: Map<String, Int>? = null,
        attachments: List<ApiMessageAttachment> = emptyList(),
        sender: ApiMessageSender? = null,
        messageType: String = "text",
        consumedByMe: Boolean? = null,
        pinnedAt: String? = null,
    ) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        senderId = "u1",
        content = content,
        messageType = messageType,
        isEdited = isEdited,
        editedAt = editedAt,
        deletedAt = deletedAt,
        createdAt = "2026-06-01T10:00:00Z",
        deliveredCount = deliveredCount,
        readCount = readCount,
        translations = translations,
        reactionSummary = reactionSummary,
        attachments = attachments,
        sender = sender,
        consumedByMe = consumedByMe,
        pinnedAt = pinnedAt,
    )

    private fun translation(language: String, text: String) =
        ApiTextTranslation(targetLanguage = language, translatedContent = text)

    @Test
    fun `the same message merged into itself is unchanged`() {
        val rich = message(
            translations = listOf(translation("en", "hi")),
            reactionSummary = mapOf("👍" to 2),
            attachments = listOf(ApiMessageAttachment(id = "a1", fileUrl = "https://cdn/a1.jpg")),
            sender = ApiMessageSender(userId = "u1", displayName = "Ana"),
            deliveredCount = 2,
            editedAt = "2026-06-01T10:05:00Z",
        )

        val outcome = MessageMergePolicy.merge(rich, rich)

        assertThat(outcome.changed).isFalse()
        assertThat(outcome.message).isEqualTo(rich)
    }

    @Test
    fun `a real server change is reported as changed`() {
        val outcome = MessageMergePolicy.merge(message(), message(reactionSummary = mapOf("❤️" to 1)))

        assertThat(outcome.changed).isTrue()
        assertThat(outcome.message.reactionSummary).containsExactly("❤️", 1)
    }

    @Test
    fun `an older edit snapshot never replaces a newer cached edit`() {
        val cached = message(content = "v2", editedAt = "2026-06-01T10:10:00Z", translations = listOf(translation("en", "v2 en")))
        val stale = message(content = "v1", editedAt = "2026-06-01T10:05:00Z")

        val outcome = MessageMergePolicy.merge(cached, stale)

        assertThat(outcome.message.content).isEqualTo("v2")
        assertThat(outcome.message.editedAt).isEqualTo("2026-06-01T10:10:00Z")
        assertThat(outcome.message.translations).containsExactly(translation("en", "v2 en"))
        assertThat(outcome.changed).isFalse()
    }

    @Test
    fun `a snapshot predating any edit does not revert the edited text`() {
        val cached = message(content = "v2", editedAt = "2026-06-01T10:10:00Z")

        val outcome = MessageMergePolicy.merge(cached, message(content = "v1"))

        assertThat(outcome.message.content).isEqualTo("v2")
        assertThat(outcome.message.isEdited).isTrue()
    }

    @Test
    fun `a newer server edit replaces the text and drops the stale translations`() {
        val cached = message(content = "v1", translations = listOf(translation("en", "v1 en")))
        val edited = message(content = "v2", editedAt = "2026-06-01T10:10:00Z")

        val outcome = MessageMergePolicy.merge(cached, edited)

        assertThat(outcome.message.content).isEqualTo("v2")
        assertThat(outcome.message.translations).isEmpty()
        assertThat(outcome.changed).isTrue()
    }

    @Test
    fun `delivery and read counters never go backwards`() {
        val cached = message(deliveredCount = 3, readCount = 2)

        val outcome = MessageMergePolicy.merge(cached, message(deliveredCount = 1, readCount = 0))

        assertThat(outcome.message.deliveredCount).isEqualTo(3)
        assertThat(outcome.message.readCount).isEqualTo(2)
        assertThat(outcome.changed).isFalse()
    }

    @Test
    fun `a deleted message is never resurrected by a snapshot that ignores the deletion`() {
        val tombstone = message(content = "", deletedAt = "2026-06-01T11:00:00Z")

        val outcome = MessageMergePolicy.merge(tombstone, message(content = "salut", translations = listOf(translation("en", "hi"))))

        assertThat(outcome.message.deletedAt).isEqualTo("2026-06-01T11:00:00Z")
        assertThat(outcome.message.content).isEmpty()
        assertThat(outcome.message.translations).isEmpty()
    }

    @Test
    fun `a pending edit keeps the local text against the server snapshot`() {
        val local = message(content = "corrigé", isEdited = true)

        val outcome = MessageMergePolicy.merge(
            local,
            message(content = "salut"),
            MessageMergeGuards(pendingEdit = true),
        )

        assertThat(outcome.message.content).isEqualTo("corrigé")
        assertThat(outcome.message.isEdited).isTrue()
        assertThat(outcome.changed).isFalse()
    }

    @Test
    fun `a pending delete keeps the local tombstone`() {
        val local = message(content = "", deletedAt = "2026-06-01T11:00:00Z")

        val outcome = MessageMergePolicy.merge(local, message(content = "salut"), MessageMergeGuards(pendingDelete = true))

        assertThat(outcome.message.deletedAt).isEqualTo("2026-06-01T11:00:00Z")
        assertThat(outcome.message.content).isEmpty()
    }

    @Test
    fun `a pending reaction keeps the optimistic summary`() {
        val local = message(reactionSummary = mapOf("🔥" to 1))

        val outcome = MessageMergePolicy.merge(local, message(reactionSummary = null), MessageMergeGuards(pendingReaction = true))

        assertThat(outcome.message.reactionSummary).containsExactly("🔥", 1)
    }

    @Test
    fun `without a pending reaction the served summary is authoritative even when emptied`() {
        val local = message(reactionSummary = mapOf("🔥" to 1))

        val outcome = MessageMergePolicy.merge(local, message(reactionSummary = null))

        assertThat(outcome.message.reactionSummary).isNull()
    }

    @Test
    fun `a pending pin keeps the local pin state`() {
        val local = message(pinnedAt = "2026-06-01T12:00:00Z")

        val outcome = MessageMergePolicy.merge(local, message(pinnedAt = null), MessageMergeGuards(pendingPin = true))

        assertThat(outcome.message.pinnedAt).isEqualTo("2026-06-01T12:00:00Z")
    }

    @Test
    fun `an opened view-once stays opened`() {
        val outcome = MessageMergePolicy.merge(message(consumedByMe = true), message(consumedByMe = null))

        assertThat(outcome.message.consumedByMe).isTrue()
    }

    @Test
    fun `a light socket echo does not erase the rich blocks of the cache`() {
        val rich = message(
            sender = ApiMessageSender(userId = "u1", displayName = "Ana"),
            attachments = listOf(ApiMessageAttachment(id = "a1", fileUrl = "https://cdn/a1.jpg")),
            messageType = "image",
        )

        val outcome = MessageMergePolicy.merge(rich, message())

        assertThat(outcome.message.sender?.displayName).isEqualTo("Ana")
        assertThat(outcome.message.attachments.map { it.id }).containsExactly("a1")
        assertThat(outcome.message.messageType).isEqualTo("image")
        assertThat(outcome.changed).isFalse()
    }

    @Test
    fun `a served attachment without address keeps the local file of the optimistic twin`() {
        val optimistic = message(attachments = listOf(ApiMessageAttachment(id = "up_1", fileUrl = "file:///data/photo.jpg")))
        val served = message(attachments = listOf(ApiMessageAttachment(id = "srv_1", fileUrl = null, mimeType = "image/jpeg")))

        val outcome = MessageMergePolicy.merge(optimistic, served)

        assertThat(outcome.message.attachments.single().id).isEqualTo("srv_1")
        assertThat(outcome.message.attachments.single().fileUrl).isEqualTo("file:///data/photo.jpg")
    }

    @Test
    fun `socket translations survive a snapshot of the same revision and the served one wins per language`() {
        val cached = message(translations = listOf(translation("en", "hi"), translation("es", "hola")))
        val served = message(translations = listOf(translation("en", "hello")))

        val outcome = MessageMergePolicy.merge(cached, served)

        assertThat(outcome.message.translations).containsExactly(translation("en", "hello"), translation("es", "hola")).inOrder()
    }

    @Test
    fun `a rich snapshot completes a minimal row`() {
        val minimal = MinimalMessageSeed("m1", "c1", "u1", "salut", "2026-06-01T10:00:00Z").toApiMessage()
        val rich = message(
            messageType = "image",
            sender = ApiMessageSender(userId = "u1", displayName = "Ana"),
            attachments = listOf(ApiMessageAttachment(id = "a1", fileUrl = "https://cdn/a1.jpg")),
        )

        val outcome = MessageMergePolicy.merge(minimal, rich)

        assertThat(outcome.message.messageType).isEqualTo("image")
        assertThat(outcome.message.sender?.displayName).isEqualTo("Ana")
        assertThat(outcome.message.attachments).hasSize(1)
        assertThat(outcome.changed).isTrue()
    }

    @Test
    fun `a push seed keeps the body only when it is the real text`() {
        val plain = PushPayload(type = "new_message", messageId = "m1", conversationId = "c1", senderId = "u1", body = "salut")
        val guarded = plain.copy(notificationLocKey = "MESSAGE_VIEW_ONCE")
        val media = plain.copy(firstAttachmentUrl = "https://cdn/a.jpg", body = "Photo")

        assertThat(MinimalMessageSeed.fromPush(plain)?.content).isEqualTo("salut")
        assertThat(MinimalMessageSeed.fromPush(guarded)?.content).isEmpty()
        assertThat(MinimalMessageSeed.fromPush(media)?.content).isEmpty()
    }

    @Test
    fun `a push that is not a new message has no seed`() {
        assertThat(MinimalMessageSeed.fromPush(PushPayload(type = "reaction", messageId = "m1", conversationId = "c1"))).isNull()
        assertThat(MinimalMessageSeed.fromPush(PushPayload(type = "new_message", conversationId = "c1"))).isNull()
    }
}
