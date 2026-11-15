package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
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
    fun `the viewer consuming a view-once seals its content, translations and attachments`() {
        val event = MessageConsumedEvent(messageId = "m1", conversationId = "c1", userId = "me", viewOnceCount = 1)
        val sealed = ConversationEventDeltas.consumed(message(attachments = listOf(photo())), event, viewerId = "me")

        assertThat(sealed.consumedByMe).isTrue()
        assertThat(sealed.content).isEmpty()
        assertThat(sealed.translations).isEmpty()
        assertThat(sealed.attachments.map { it.fileUrl }).containsExactly(null)
        assertThat(sealed.attachments.map { it.thumbnailUrl }).containsExactly(null)
    }

    @Test
    fun `someone else consuming a view-once empties nothing`() {
        val event = MessageConsumedEvent(messageId = "m1", conversationId = "c1", userId = "u2", viewOnceCount = 1)
        val kept = ConversationEventDeltas.consumed(message(attachments = listOf(photo())), event, viewerId = "me")

        assertThat(kept.content).isEqualTo("salut")
        assertThat(kept.translations).hasSize(1)
        assertThat(kept.attachments.single().fileUrl).isEqualTo("https://cdn/x.jpg")
    }

    @Test
    fun `sealing an already sealed view-once returns the same instance`() {
        val event = MessageConsumedEvent(messageId = "m1", conversationId = "c1", userId = "me", viewOnceCount = 1)
        val sealed = ConversationEventDeltas.consumed(message(attachments = listOf(photo())), event, viewerId = "me")

        assertThat(ConversationEventDeltas.consumed(sealed, event, viewerId = "me")).isSameInstanceAs(sealed)
        assertThat(ConversationEventDeltas.sealedAsOpened(sealed)).isSameInstanceAs(sealed)
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

    private fun richViewOnce() = message(
        attachments = listOf(
            photo().copy(alt = "ma clé", originalName = "passeport.jpg", fileName = "f_123.jpg", latitude = 48.85, longitude = 2.35),
        ),
    ).copy(
        isViewOnce = true,
        encryptedContent = "ciphertext==",
        location = SharedPlace(latitude = 48.85, longitude = 2.35, name = "Chez moi"),
        sticker = MessageSticker(emoji = "🔥"),
        trackingLinks = listOf(TrackedLink(url = "https://x.example/secret", token = "t1")),
        metadata = buildJsonObject { put("location", JsonPrimitive("Chez moi")) },
    )

    @Test
    fun `a view-once purge also drops the ciphertext, place, sticker, links, metadata and each piece's naming and coordinates`() {
        val purged = ConversationEventDeltas.viewOncePurged(richViewOnce())

        assertThat(purged.encryptedContent).isNull()
        assertThat(purged.location).isNull()
        assertThat(purged.sticker).isNull()
        assertThat(purged.trackingLinks).isNull()
        assertThat(purged.metadata).isNull()
        val piece = purged.attachments.single()
        assertThat(piece.id).isEqualTo("a1")
        assertThat(piece.alt).isNull()
        assertThat(piece.originalName).isNull()
        assertThat(piece.fileName).isNull()
        assertThat(piece.latitude).isNull()
        assertThat(piece.longitude).isNull()
        assertThat(purged.isViewOnce).isTrue()
        assertThat(ConversationEventDeltas.viewOncePurged(purged)).isSameInstanceAs(purged)
    }

    @Test
    fun `sealing as opened by the reader drops the same side channels`() {
        val sealed = ConversationEventDeltas.sealedAsOpened(richViewOnce())

        assertThat(sealed.consumedByMe).isTrue()
        assertThat(sealed.content).isEmpty()
        assertThat(sealed.encryptedContent).isNull()
        assertThat(sealed.location).isNull()
        assertThat(sealed.sticker).isNull()
        assertThat(sealed.trackingLinks).isNull()
        assertThat(sealed.metadata).isNull()
        assertThat(sealed.attachments.single().originalName).isNull()
        assertThat(ConversationEventDeltas.sealedAsOpened(sealed)).isSameInstanceAs(sealed)
    }

    @Test
    fun `only a view-once opened by the reader is sealed on write`() {
        val ordinary = message(attachments = listOf(photo())).copy(consumedByMe = true)
        val byFlag = message().copy(isViewOnce = true, consumedByMe = true)
        val byEffect = message().copy(effectFlags = MessageEffectFlags.VIEW_ONCE.toInt())
        val byPiece = message(attachments = listOf(photo().copy(effectFlags = MessageEffectFlags.VIEW_ONCE)))
        val notOpened = message().copy(isViewOnce = true, consumedByMe = false)

        assertThat(ConversationEventDeltas.sealedIfOpened(ordinary, openedHere = true)).isSameInstanceAs(ordinary)
        assertThat(ConversationEventDeltas.sealedIfOpened(byFlag, openedHere = false).content).isEmpty()
        assertThat(ConversationEventDeltas.sealedIfOpened(byEffect, openedHere = true).content).isEmpty()
        assertThat(ConversationEventDeltas.sealedIfOpened(byPiece, openedHere = true).attachments.single().fileUrl).isNull()
        assertThat(ConversationEventDeltas.sealedIfOpened(notOpened, openedHere = false)).isSameInstanceAs(notOpened)
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
    fun `my own reaction posted from another device is recognised and a replay is inert`() {
        val local = message(attachments = listOf(photo(summary = mapOf("🔥" to 3))))

        val added = ConversationEventDeltas.attachmentReactions(
            local, "a1", mapOf("🔥" to 3, "❤️" to 1), ownEmoji = "❤️", ownAdding = true,
        )
        assertThat(added.attachments.single().currentUserReactions).containsExactly("❤️")

        val replay = ConversationEventDeltas.attachmentReactions(
            added, "a1", mapOf("🔥" to 3, "❤️" to 1), ownEmoji = "❤️", ownAdding = true,
        )
        assertThat(replay).isSameInstanceAs(added)

        val removed = ConversationEventDeltas.attachmentReactions(
            added, "a1", mapOf("🔥" to 3), ownEmoji = "❤️", ownAdding = false,
        )
        assertThat(removed.attachments.single().currentUserReactions).isNull()
    }

    @Test
    fun `someone else's reaction never touches my own marks`() {
        val local = message(attachments = listOf(photo(summary = mapOf("❤️" to 1), mine = listOf("❤️"))))

        val next = ConversationEventDeltas.attachmentReactions(local, "a1", mapOf("❤️" to 2))

        assertThat(next.attachments.single().currentUserReactions).containsExactly("❤️")
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

    @Test
    fun `a withdrawn post empties the citation of the messages that quote it`() {
        val quoting = message().copy(
            postReplyTo = ApiPostReplyTarget(id = "p1", previewText = "ma story", thumbnailUrl = "https://cdn/s.jpg", reactionCount = 3),
        )
        val result = ConversationEventDeltas.citedPostWithdrawn(quoting, "p1")
        assertThat(result.postReplyTo).isEqualTo(ApiPostReplyTarget(id = "p1", unavailable = true))
    }

    @Test
    fun `a message that cites the post by id only is withdrawn too`() {
        val result = ConversationEventDeltas.citedPostWithdrawn(message().copy(storyReplyToId = "p1"), "p1")
        assertThat(result.postReplyTo?.unavailable).isTrue()
    }

    @Test
    fun `another post or no citation, and a second withdrawal, change nothing`() {
        val other = message().copy(postReplyTo = ApiPostReplyTarget(id = "p2", previewText = "autre"))
        assertThat(ConversationEventDeltas.citedPostWithdrawn(other, "p1")).isSameInstanceAs(other)
        val plain = message()
        assertThat(ConversationEventDeltas.citedPostWithdrawn(plain, "p1")).isSameInstanceAs(plain)
        val done = message().copy(postReplyTo = ApiPostReplyTarget(id = "p1", unavailable = true))
        assertThat(ConversationEventDeltas.citedPostWithdrawn(done, "p1")).isSameInstanceAs(done)
    }
}
