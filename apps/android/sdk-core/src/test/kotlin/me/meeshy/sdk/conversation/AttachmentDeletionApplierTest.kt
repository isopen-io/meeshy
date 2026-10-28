package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.AttachmentDeletedEvent
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AttachmentDeletionApplierTest {

    private fun photo(id: String) = ApiMessageAttachment(id = id, mimeType = "image/jpeg")

    private fun message(id: String, content: String, vararg pieces: ApiMessageAttachment, createdAt: String = "2026-06-01T10:00:00Z") =
        ApiMessage(id = id, conversationId = "c1", senderId = "u1", content = content, attachments = pieces.toList(), createdAt = createdAt)

    private fun applier(harness: MessageCollaboratorHarness) =
        AttachmentDeletionApplier(harness.database, harness.updater, harness.clock, null)

    private val event = AttachmentDeletedEvent(attachmentId = "a", messageId = "m1", conversationId = "c1")

    private suspend fun MessageCollaboratorHarness.seedConversation(last: ApiConversationLastMessage) {
        val conversation = ApiConversation(id = "c1", lastMessage = last)
        database.conversationDao().upsertAll(
            listOf(ConversationEntity("c1", MeeshyApi.json.encodeToString(ApiConversation.serializer(), conversation), 1L, 1L, 0)),
        )
    }

    private suspend fun MessageCollaboratorHarness.cachedConversation() = MeeshyApi.json.decodeFromString<ApiConversation>(
        database.conversationDao().find("c1")!!.payload,
    )

    @Test
    fun `the piece leaves the cached bubble and the neighbour stays`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", "", photo("a"), photo("b")))

        applier(harness).apply(event)

        assertThat(harness.cachedMessage("m1").attachments.map { it.id }).containsExactly("b")
    }

    @Test
    fun `a message left with nothing becomes a tombstone`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", "", photo("a")))

        applier(harness).apply(event)

        val cached = harness.cachedMessage("m1")
        assertThat(cached.attachments).isEmpty()
        assertThat(cached.deletedAt).isNotNull()
    }

    @Test
    fun `the same event twice, or one for a piece the author already removed, changes nothing more`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", "légende", photo("b")))
        val before = harness.database.messageDao().find("m1")!!

        applier(harness).apply(event)
        applier(harness).apply(event)

        assertThat(harness.database.messageDao().find("m1")).isEqualTo(before)
    }

    @Test
    fun `an unknown message or a blank identifier writes nothing`() = runHarnessTest { harness ->
        applier(harness).apply(event)
        applier(harness).apply(event.copy(attachmentId = " "))

        assertThat(harness.database.messageDao().find("m1")).isNull()
    }

    @Test
    fun `the list row follows the last message and falls back to the previous one when it is emptied`() = runHarnessTest { harness ->
        harness.seedSynced(message("m0", "avant", createdAt = "2026-06-01T09:00:00Z"))
        harness.seedSynced(message("m1", "", photo("a")))
        harness.seedConversation(ApiConversationLastMessage(id = "m1", content = "", messageType = "image", attachments = listOf(photo("a"))))

        applier(harness).apply(event)

        val last = harness.cachedConversation().lastMessage!!
        assertThat(last.id).isEqualTo("m0")
        assertThat(last.content).isEqualTo("avant")
    }
}
