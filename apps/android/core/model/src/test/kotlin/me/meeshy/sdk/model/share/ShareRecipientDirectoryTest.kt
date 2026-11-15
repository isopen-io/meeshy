package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareRecipientDirectoryTest {

    private fun conversation(id: String, title: String, peer: String? = null) = ShareRecipient.conversation(
        conversationId = id,
        title = title,
        detail = if (peer != null) ShareRecipient.Detail.Direct else ShareRecipient.Detail.Group(3),
        avatarUrl = null,
        accentHex = null,
        peerUserId = peer,
    )

    private fun person(id: String, title: String) =
        ShareRecipient.person(id, title, ShareRecipient.Detail.FriendWithoutConversation, null)

    @Test
    fun `a friend with a direct conversation appears once, as the conversation`() {
        val view = ShareRecipientDirectory.view(
            conversations = listOf(conversation("c1", "Léa", peer = "u1")),
            people = listOf(person("u1", "Léa"), person("u2", "Bob")),
            communities = emptyList(),
            query = "",
            found = null,
            sourceConversationId = null,
        )
        assertThat(view.conversations.map { it.id }).containsExactly("conv:c1")
        assertThat(view.people.map { it.id }).containsExactly("user:u2")
    }

    @Test
    fun `the source conversation is never offered, not even among the recents`() {
        val view = ShareRecipientDirectory.view(
            conversations = listOf(conversation("src", "Source"), conversation("c1", "Équipe")),
            people = emptyList(), communities = emptyList(), query = "", found = null, sourceConversationId = "src",
        )
        assertThat(view.recents.map { it.id }).containsExactly("conv:c1")
        assertThat(view.conversations.map { it.id }).containsExactly("conv:c1")
    }

    @Test
    fun `typing filters locally without accents or case and empties the recents`() {
        val view = ShareRecipientDirectory.view(
            conversations = listOf(conversation("c1", "Équipe produit"), conversation("c2", "Famille")),
            people = listOf(person("u9", "Éloïse")),
            communities = listOf(ShareCommunity("k1", "Équipage", null), ShareCommunity("k2", "Chess", null)),
            query = "equi", found = null, sourceConversationId = null,
        )
        assertThat(view.recents).isEmpty()
        assertThat(view.conversations.map { it.id }).containsExactly("conv:c1")
        assertThat(view.people).isEmpty()
        assertThat(view.communities.map { it.id }).containsExactly("k1")
    }

    @Test
    fun `the server answer joins the local rows without duplicating a conversation or a person already listed`() {
        val found = ShareSearchResults(
            people = listOf(person("u1", "Léa"), person("u7", "Lena")),
            conversations = listOf(conversation("c1", "Léa", peer = "u1"), conversation("c8", "Léa club")),
            communities = listOf(ShareCommunity("k1", "Léa corp", null)),
        )
        val view = ShareRecipientDirectory.view(
            conversations = listOf(conversation("c1", "Léa", peer = "u1")),
            people = emptyList(), communities = listOf(ShareCommunity("k1", "Léa corp", null)),
            query = "lea", found = found, sourceConversationId = null,
        )
        assertThat(view.conversations.map { it.id }).containsExactly("conv:c1", "conv:c8").inOrder()
        assertThat(view.people.map { it.id }).containsExactly("user:u7")
        assertThat(view.communities.map { it.id }).containsExactly("k1")
    }

    @Test
    fun `a found conversation the user cannot write to is not reachable`() {
        assertThat(ShareRecipientDirectory.isReachableConversation("public", listOf("x"), "me", isMember = null)).isFalse()
        assertThat(ShareRecipientDirectory.isReachableConversation("public", listOf("me"), "me", isMember = null)).isTrue()
        assertThat(ShareRecipientDirectory.isReachableConversation("group", emptyList(), "me", isMember = null)).isTrue()
        assertThat(ShareRecipientDirectory.isReachableConversation("group", emptyList(), "me", isMember = false)).isFalse()
        assertThat(ShareRecipientDirectory.isReachableConversation("public", emptyList(), "", isMember = null)).isFalse()
    }

    @Test
    fun `selection stops at the ceiling and a selected row can always be unticked`() {
        val rows = (1..11).map { person("u$it", "P$it") }
        val full = rows.take(10).fold(emptyList<ShareRecipient>()) { acc, r -> ShareRecipientDirectory.toggled(acc, r) }
        assertThat(full).hasSize(10)
        assertThat(ShareRecipientDirectory.toggled(full, rows[10])).isEqualTo(full)
        assertThat(ShareRecipientDirectory.canSelectMore(full)).isFalse()
        assertThat(ShareRecipientDirectory.toggled(full, rows[0])).hasSize(9)
        assertThat(ShareRecipientDirectory.canSelectMore(full.drop(1))).isTrue()
    }

    @Test
    fun `the skeleton shows only when nothing is known and loading`() {
        assertThat(ShareRecipientDirectory.showsSkeleton(emptyList(), emptyList(), loading = true)).isTrue()
        assertThat(ShareRecipientDirectory.showsSkeleton(listOf(conversation("c", "A")), emptyList(), loading = true)).isFalse()
        assertThat(ShareRecipientDirectory.showsSkeleton(emptyList(), emptyList(), loading = false)).isFalse()
    }

    @Test
    fun `a fresh page is put ahead of the cache and ids are not repeated`() {
        val merged = ShareRecipientDirectory.revalidated(
            cached = listOf(conversation("c1", "A"), conversation("c2", "B")),
            fresh = listOf(conversation("c2", "B2"), conversation("c3", "C")),
        )
        assertThat(merged.map { it.id }).containsExactly("conv:c2", "conv:c3", "conv:c1").inOrder()
        assertThat(merged.first().title).isEqualTo("B2")
    }
}
