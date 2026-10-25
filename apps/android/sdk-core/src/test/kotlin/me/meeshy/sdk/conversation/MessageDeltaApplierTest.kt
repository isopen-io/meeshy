package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.AttachmentReactionUpdateEvent
import me.meeshy.sdk.model.ConversationRoomAck
import me.meeshy.sdk.model.MessageConsumedEvent
import me.meeshy.sdk.model.MessageCountdownStartedEvent
import me.meeshy.sdk.model.MessageHiddenForMeEvent
import me.meeshy.sdk.model.MessagePinChanged
import me.meeshy.sdk.model.MessageRemoved
import me.meeshy.sdk.model.MessageViewOncePurgedEvent
import me.meeshy.sdk.model.PersonalMessageVisibilityRef
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Chaque événement du fil modifie la ligne Room en place, sans réseau (aucune API n'est câblée ici). */
@RunWith(RobolectricTestRunner::class)
class MessageDeltaApplierTest {

    private fun applier(harness: MessageCollaboratorHarness) =
        MessageDeltaApplier(harness.database, harness.updater, harness.clock)

    private fun message(id: String = "m1", senderId: String = "author", expiresAt: String? = null) = ApiMessage(
        id = id,
        conversationId = "c1",
        senderId = senderId,
        content = "salut",
        createdAt = "2026-10-24T09:00:00Z",
        translations = listOf(ApiTextTranslation(targetLanguage = "en", translatedContent = "hi")),
        expiresAt = expiresAt,
        attachments = listOf(ApiMessageAttachment(id = "a1", fileUrl = "https://cdn/a.jpg")),
    )

    @Test
    fun `a deletion leaves a tombstone in place`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val before = harness.database.messageDao().find("m1")!!

        val handled = applier(harness).apply(MessageRemoved("m1", "c1", "2026-10-24T10:00:00Z"), viewerId = "me")

        val row = harness.database.messageDao().find("m1")!!
        assertThat(handled).isTrue()
        assertThat(row.createdAt).isEqualTo(before.createdAt)
        assertThat(row.deletedAt).isNotNull()
        assertThat(harness.cachedMessage("m1").content).isEmpty()
        assertThat(harness.cachedMessage("m1").translations).isEmpty()
    }

    @Test
    fun `an expiry removes the row`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        applier(harness).apply(MessageRemoved("m1", "c1", expired = true), viewerId = "me")

        assertThat(harness.database.messageDao().find("m1")).isNull()
    }

    @Test
    fun `a pin and an unpin flip the pin columns`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val applier = applier(harness)

        applier.apply(MessagePinChanged("m1", "c1", pinned = true, pinnedAt = "2026-10-24T10:00:00Z", pinnedBy = "u2"), "me")
        assertThat(harness.cachedMessage("m1").pinnedBy).isEqualTo("u2")
        assertThat(harness.database.messageDao().find("m1")!!.pinnedAt).isNotNull()

        applier.apply(MessagePinChanged("m1", "c1", pinned = false), "me")
        assertThat(harness.cachedMessage("m1").pinnedAt).isNull()
        assertThat(harness.database.messageDao().find("m1")!!.pinnedAt).isNull()
    }

    @Test
    fun `a pin without a served date stamps the local clock`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        applier(harness).apply(MessagePinChanged("m1", "c1", pinned = true), "me")

        assertThat(harness.cachedMessage("m1").pinnedAt).isNotNull()
    }

    @Test
    fun `a recipient keeps the nearer deadline and the sender takes the served one`() = runHarnessTest { harness ->
        harness.seedSynced(message(id = "in", senderId = "author", expiresAt = "2026-10-24T10:00:00Z"))
        harness.seedSynced(message(id = "out", senderId = "me", expiresAt = "2026-10-24T10:00:00Z"))
        val applier = applier(harness)

        applier.apply(MessageCountdownStartedEvent("in", "c1", "2026-10-24T12:00:00Z"), viewerId = "me")
        applier.apply(MessageCountdownStartedEvent("out", "c1", "2026-10-24T12:00:00Z"), viewerId = "me")

        assertThat(harness.cachedMessage("in").expiresAt).isEqualTo("2026-10-24T10:00:00Z")
        assertThat(harness.cachedMessage("out").expiresAt).isEqualTo("2026-10-24T12:00:00Z")
    }

    @Test
    fun `an inert delta does not rewrite the row`() = runHarnessTest { harness ->
        harness.seedSynced(message(expiresAt = "2026-10-24T10:00:00Z"))
        val before = harness.database.messageDao().find("m1")!!.changeVersion

        applier(harness).apply(MessageCountdownStartedEvent("m1", "c1", "2026-10-24T12:00:00Z"), viewerId = "me")

        assertThat(harness.database.messageDao().find("m1")!!.changeVersion).isEqualTo(before)
    }

    @Test
    fun `a personal hide purges the named rows only`() = runHarnessTest { harness ->
        harness.seedSynced(message(id = "m1"))
        harness.seedSynced(message(id = "m2"))

        applier(harness).apply(
            MessageHiddenForMeEvent(userId = "me", messages = listOf(PersonalMessageVisibilityRef("m1", "c1"))),
            viewerId = "me",
        )

        assertThat(harness.database.messageDao().find("m1")).isNull()
        assertThat(harness.database.messageDao().find("m2")).isNotNull()
    }

    @Test
    fun `a consumption by the viewer marks the view-once opened`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        applier(harness).apply(
            MessageConsumedEvent(messageId = "m1", conversationId = "c1", userId = "me", viewOnceCount = 1),
            viewerId = "me",
        )

        assertThat(harness.cachedMessage("m1").viewOnceCount).isEqualTo(1)
        assertThat(harness.cachedMessage("m1").consumedByMe).isTrue()
    }

    @Test
    fun `a view-once purge keeps the bubble but drops its content`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        applier(harness).apply(MessageViewOncePurgedEvent("m1", "c1"), viewerId = "me")

        val purged = harness.cachedMessage("m1")
        assertThat(purged.content).isEmpty()
        assertThat(purged.attachments.single().fileUrl).isNull()
    }

    @Test
    fun `a served attachment summary lands on its attachment`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        applier(harness).apply(
            AttachmentReactionUpdateEvent(
                attachmentId = "a1", messageId = "m1", conversationId = "c1", emoji = "❤️",
                action = "add", reactionSummary = mapOf("❤️" to 2),
            ),
            viewerId = "me",
        )

        assertThat(harness.cachedMessage("m1").attachments.single().reactionSummary).containsExactly("❤️", 2)
    }

    @Test
    fun `an optimistic attachment reaction rolls back with its inverse`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val applier = applier(harness)

        assertThat(applier.toggleAttachmentReaction("m1", "a1", "🔥", adding = true)).isTrue()
        assertThat(harness.cachedMessage("m1").attachments.single().reactionSummary).containsExactly("🔥", 1)

        applier.toggleAttachmentReaction("m1", "a1", "🔥", adding = false)
        assertThat(harness.cachedMessage("m1").attachments.single().reactionSummary).isNull()
    }

    @Test
    fun `a delta for an unknown message writes nothing and does not throw`() = runHarnessTest { harness ->
        val handled = applier(harness).apply(MessageViewOncePurgedEvent("ghost", "c1"), viewerId = "me")

        assertThat(handled).isTrue()
        assertThat(harness.database.messageDao().find("ghost")).isNull()
    }

    @Test
    fun `an event that is not a message delta is left to its consumer`() = runHarnessTest { harness ->
        val handled = applier(harness).apply(ConversationRoomAck("c1", "me", joined = true), viewerId = "me")

        assertThat(handled).isFalse()
    }
}
