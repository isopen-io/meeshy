package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationEventDeltasTest {

    private fun message(
        content: String = "salut",
        expiresAt: String? = null,
        attachments: List<ApiMessageAttachment> = emptyList(),
    ) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        senderId = "author",
        content = content,
        translations = listOf(ApiTextTranslation(targetLanguage = "en", translatedContent = "hi")),
        expiresAt = expiresAt,
        attachments = attachments,
    )

    private fun photo(summary: Map<String, Int>? = null, mine: List<String>? = null) = ApiMessageAttachment(
        id = "a1",
        fileUrl = "https://cdn/x.jpg",
        thumbnailUrl = "https://cdn/x_t.jpg",
        reactionSummary = summary,
        currentUserReactions = mine,
    )

    @Test
    fun `a deletion turns the bubble into a tombstone without its content`() {
        val tombstone = ConversationEventDeltas.deleted(message(attachments = listOf(photo())), "2026-10-24T10:00:00Z")

        assertThat(tombstone.content).isEmpty()
        assertThat(tombstone.translations).isEmpty()
        assertThat(tombstone.attachments).isEmpty()
        assertThat(tombstone.deletedAt).isEqualTo("2026-10-24T10:00:00Z")
    }

    @Test
    fun `a second deletion of a tombstone changes nothing`() {
        val tombstone = ConversationEventDeltas.deleted(message(), "2026-10-24T10:00:00Z")

        assertThat(ConversationEventDeltas.deleted(tombstone, "2026-10-24T11:00:00Z")).isSameInstanceAs(tombstone)
    }

    @Test
    fun `a pin sets its date and author and an unpin clears both`() {
        val pinned = ConversationEventDeltas.pinned(message(), "2026-10-24T10:00:00Z", "u2")
        assertThat(pinned.pinnedAt).isEqualTo("2026-10-24T10:00:00Z")
        assertThat(pinned.pinnedBy).isEqualTo("u2")

        val unpinned = ConversationEventDeltas.pinned(pinned, null, null)
        assertThat(unpinned.pinnedAt).isNull()
        assertThat(unpinned.pinnedBy).isNull()
    }

    @Test
    fun `a repeated pin is inert`() {
        val pinned = ConversationEventDeltas.pinned(message(), "2026-10-24T10:00:00Z", "u2")

        assertThat(ConversationEventDeltas.pinned(pinned, "2026-10-24T10:00:00Z", "u2")).isSameInstanceAs(pinned)
    }

    @Test
    fun `a recipient keeps the nearer of its local and served deadlines`() {
        val local = message(expiresAt = "2026-10-24T10:00:00Z")

        val later = ConversationEventDeltas.servedDeadline(local, "2026-10-24T12:00:00Z", viewerIsSender = false)
        val sooner = ConversationEventDeltas.servedDeadline(local, "2026-10-24T09:00:00Z", viewerIsSender = false)

        assertThat(later).isSameInstanceAs(local)
        assertThat(sooner.expiresAt).isEqualTo("2026-10-24T09:00:00Z")
    }

    @Test
    fun `a recipient without a local deadline takes the served one`() {
        val served = ConversationEventDeltas.servedDeadline(message(), "2026-10-24T12:00:00Z", viewerIsSender = false)

        assertThat(served.expiresAt).isEqualTo("2026-10-24T12:00:00Z")
    }

    @Test
    fun `the sender always replaces its deadline with the served one`() {
        val local = message(expiresAt = "2026-10-24T10:00:00Z")

        val served = ConversationEventDeltas.servedDeadline(local, "2026-10-24T12:00:00Z", viewerIsSender = true)

        assertThat(served.expiresAt).isEqualTo("2026-10-24T12:00:00Z")
    }

    @Test
    fun `an unreadable served deadline touches nothing`() {
        val local = message(expiresAt = "2026-10-24T10:00:00Z")

        assertThat(ConversationEventDeltas.servedDeadline(local, "demain", viewerIsSender = true)).isSameInstanceAs(local)
    }

    @Test
    fun `someone else opening a view-once only moves the counter`() {
        val event = MessageConsumedEvent(messageId = "m1", conversationId = "c1", userId = "u2", viewOnceCount = 1)

        val next = ConversationEventDeltas.consumed(message(), event, viewerId = "me")

        assertThat(next.viewOnceCount).isEqualTo(1)
        assertThat(next.consumedByMe).isNull()
        assertThat(next.content).isEqualTo("salut")
    }

    @Test
    fun `the viewer opening a view-once on another device marks it opened`() {
        val event = MessageConsumedEvent(messageId = "m1", conversationId = "c1", userId = "me", viewOnceCount = 2)

        val next = ConversationEventDeltas.consumed(message(), event, viewerId = "me")

        assertThat(next.consumedByMe).isTrue()
        assertThat(next.viewOnceCount).isEqualTo(2)
    }

    @Test
    fun `a view-once purge drops every carried content but keeps the bubble`() {
        val withMedia = message(attachments = listOf(photo()))

        val purged = ConversationEventDeltas.viewOncePurged(withMedia)

        assertThat(purged.id).isEqualTo("m1")
        assertThat(purged.content).isEmpty()
        assertThat(purged.translations).isEmpty()
        assertThat(purged.attachments.single().fileUrl).isNull()
        assertThat(purged.attachments.single().thumbnailUrl).isNull()
        assertThat(ConversationEventDeltas.viewOncePurged(purged)).isSameInstanceAs(purged)
    }

    @Test
    fun `the served attachment summary replaces the local one`() {
        val local = message(attachments = listOf(photo(summary = mapOf("❤️" to 1))))

        val next = ConversationEventDeltas.attachmentReactions(local, "a1", mapOf("❤️" to 2, "🔥" to 1))

        assertThat(next.attachments.single().reactionSummary).containsExactly("❤️", 2, "🔥", 1)
    }

    @Test
    fun `an attachment summary for an unknown attachment is inert`() {
        val local = message(attachments = listOf(photo()))

        assertThat(ConversationEventDeltas.attachmentReactions(local, "zz", mapOf("❤️" to 2))).isSameInstanceAs(local)
    }

    @Test
    fun `an optimistic attachment reaction and its inverse cancel out`() {
        val local = message(attachments = listOf(photo(summary = mapOf("🔥" to 3))))

        val added = ConversationEventDeltas.attachmentReactionToggled(local, "a1", "❤️", adding = true)
        assertThat(added.attachments.single().reactionSummary).containsExactly("🔥", 3, "❤️", 1)
        assertThat(added.attachments.single().currentUserReactions).containsExactly("❤️")

        val rolledBack = ConversationEventDeltas.attachmentReactionToggled(added, "a1", "❤️", adding = false)
        assertThat(rolledBack.attachments.single().reactionSummary).containsExactly("🔥", 3)
        assertThat(rolledBack.attachments.single().currentUserReactions).isNull()
    }

    @Test
    fun `adding a reaction the viewer already holds is inert`() {
        val local = message(attachments = listOf(photo(summary = mapOf("❤️" to 1), mine = listOf("❤️"))))

        assertThat(ConversationEventDeltas.attachmentReactionToggled(local, "a1", "❤️", adding = true))
            .isSameInstanceAs(local)
    }

    @Test
    fun `only the three membership reasons establish a lost membership`() {
        listOf("not_a_member", "banned", "no_longer_member").forEach {
            assertThat(ConversationJoinErrorRule.isMembershipDenied(it)).isTrue()
        }
        listOf("rate_limited", "server_error", "invalid_payload", "not_authenticated", null).forEach {
            assertThat(ConversationJoinErrorRule.isMembershipDenied(it)).isFalse()
        }
    }

    @Test
    fun `a personal hide names only the messages of the asked conversation`() {
        val event = MessageHiddenForMeEvent(
            userId = "me",
            messages = listOf(PersonalMessageVisibilityRef("m1", "c1"), PersonalMessageVisibilityRef("m2", "c2")),
        )

        assertThat(event.concerns("c1")).isTrue()
        assertThat(event.concerns("c3")).isFalse()
        assertThat(event.messageIdsIn("c1")).containsExactly("m1")
    }
}
