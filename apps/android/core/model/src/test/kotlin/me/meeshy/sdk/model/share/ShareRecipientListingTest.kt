package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareRecipientListingTest {
    private fun conv(id: String, title: String = "Conv $id", peer: String? = null) = ShareRecipient.conversation(
        conversationId = id, title = title,
        detail = if (peer != null) ShareRecipient.Detail.Direct else ShareRecipient.Detail.Group(3),
        avatarUrl = null, accentHex = "#6366F1", peerUserId = peer,
    )

    private fun friend(id: String, title: String = "Ami $id") =
        ShareRecipient.person(id, title, ShareRecipient.Detail.FriendWithoutConversation, null)

    @Test
    fun `before any keystroke the most recent conversations lead and nothing is filtered`() {
        val conversations = (1..12).map { conv("$it") }
        val sections = ShareRecipientListing.of(conversations, emptyList(), query = "")
        assertThat(sections.recents.map { it.id }).containsExactlyElementsIn(conversations.take(ShareSheetState.RECENTS_COUNT).map { it.id }).inOrder()
        assertThat(sections.conversations).hasSize(12)
    }

    @Test
    fun `typing hides the recents row and filters both lists without accents`() {
        val sections = ShareRecipientListing.of(
            conversations = listOf(conv("1", "Léa Dupont", peer = "u1"), conv("2", "Équipe")),
            people = listOf(friend("u9", "Léana Roy"), friend("u8", "Zoé")),
            query = "lea",
        )
        assertThat(sections.recents).isEmpty()
        assertThat(sections.conversations.map { it.id }).containsExactly("conv:1")
        assertThat(sections.people.map { it.id }).containsExactly("user:u9")
    }

    @Test
    fun `a friend who already has a direct conversation is not listed twice`() {
        val sections = ShareRecipientListing.of(
            conversations = listOf(conv("1", "Léa", peer = "u1")),
            people = listOf(friend("u1", "Léa"), friend("u2", "Marc")),
            query = "",
        )
        assertThat(sections.people.map { it.id }).containsExactly("user:u2")
    }

    @Test
    fun `nothing at all is an empty listing`() {
        assertThat(ShareRecipientListing.of(emptyList(), emptyList(), "").isEmpty).isTrue()
        assertThat(ShareRecipientListing.of(listOf(conv("1")), emptyList(), "").isEmpty).isFalse()
    }
}
