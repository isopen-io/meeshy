package me.meeshy.sdk.sync

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.chat.InMemoryLocallyHiddenMessagesStore
import me.meeshy.sdk.chat.InMemoryStarredMessagesStore
import me.meeshy.sdk.conversation.MessageCollaboratorHarness
import me.meeshy.sdk.conversation.MessageDeltaApplier
import me.meeshy.sdk.conversation.OpenConversationLookup
import me.meeshy.sdk.conversation.runHarnessTest
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.AttachmentReactionUpdateEvent
import me.meeshy.sdk.model.MessageHiddenForMeEvent
import me.meeshy.sdk.model.MessageRestoredForMeEvent
import me.meeshy.sdk.model.PersonalMessageVisibilityRef
import me.meeshy.sdk.model.StarredMessage
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ReactionMarksApplierTest {

    private class Fixture(val harness: MessageCollaboratorHarness, openConversations: OpenConversationLookup) {
        val hidden = InMemoryLocallyHiddenMessagesStore()
        val starred = InMemoryStarredMessagesStore()
        val applier = ReactionMarksApplier(
            MessageDeltaApplier(harness.database, harness.updater, harness.clock),
            hidden, starred, openConversations,
        ) { "me" }
    }

    private fun message(id: String = "m1") = ApiMessage(
        id = id, conversationId = "c1", senderId = "author", content = "salut", createdAt = "2026-10-24T09:00:00Z",
        attachments = listOf(ApiMessageAttachment(id = "a1", fileUrl = "https://cdn/a.jpg")),
    )

    private fun reaction(userId: String?, action: String = "add", summary: Map<String, Int> = mapOf("❤️" to 1)) =
        AttachmentReactionUpdateEvent(
            attachmentId = "a1", messageId = "m1", conversationId = "c1", userId = userId,
            emoji = "❤️", action = action, reactionSummary = summary,
        )

    @Test
    fun `a reaction on a closed conversation updates the aggregate and recognises my own by user id`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val fixture = Fixture(harness, OpenConversationLookup.None)

        fixture.applier.apply(reaction(userId = "me"))
        fixture.applier.apply(reaction(userId = "me"))

        val piece = harness.cachedMessage("m1").attachments.single()
        assertThat(piece.reactionSummary).containsExactly("❤️", 1)
        assertThat(piece.currentUserReactions).containsExactly("❤️")
    }

    @Test
    fun `someone else's reaction moves the count but is not mine`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        Fixture(harness, OpenConversationLookup.None).applier.apply(reaction(userId = "other"))

        val piece = harness.cachedMessage("m1").attachments.single()
        assertThat(piece.reactionSummary).containsExactly("❤️", 1)
        assertThat(piece.currentUserReactions).isNull()
    }

    @Test
    fun `my removal from another device clears my mark`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val fixture = Fixture(harness, OpenConversationLookup.None)
        fixture.applier.apply(reaction(userId = "me"))

        fixture.applier.apply(reaction(userId = "me", action = "remove", summary = emptyMap()))

        val piece = harness.cachedMessage("m1").attachments.single()
        assertThat(piece.reactionSummary).isNull()
        assertThat(piece.currentUserReactions).isNull()
    }

    @Test
    fun `an open conversation is left to its own controller`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        Fixture(harness, OpenConversationLookup { true }).applier.apply(reaction(userId = "me"))

        assertThat(harness.cachedMessage("m1").attachments.single().reactionSummary).isNull()
    }

    @Test
    fun `hidden for me purges the row, drops the star and keeps the id hidden`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val fixture = Fixture(harness, OpenConversationLookup.None)
        fixture.starred.toggle(StarredMessage(messageId = "m1", conversationId = "c1", starredAtMillis = 1L))

        fixture.applier.apply(MessageHiddenForMeEvent("me", listOf(PersonalMessageVisibilityRef("m1", "c1"))))

        assertThat(harness.database.messageDao().find("m1")).isNull()
        assertThat(fixture.starred.starred.value.isStarred("m1")).isFalse()
        assertThat(fixture.hidden.hidden.value.isHidden("m1")).isTrue()
    }

    @Test
    fun `restored for me brings the id back and a replay is inert`() = runHarnessTest { harness ->
        val fixture = Fixture(harness, OpenConversationLookup.None)
        fixture.hidden.hide("m1")
        val restored = MessageRestoredForMeEvent("me", listOf(PersonalMessageVisibilityRef("m1", "c1")))

        fixture.applier.apply(restored)
        fixture.applier.apply(restored)

        assertThat(fixture.hidden.hidden.value.isHidden("m1")).isFalse()
    }
}
