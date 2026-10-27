package me.meeshy.sdk.share

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.share.ShareRecipient
import org.junit.Test

class ShareRecipientDirectoryTest {
    private val me = "me"

    private fun direct(id: String, peer: String, name: String) = ApiConversation(
        id = id, type = "direct", title = name,
        participants = listOf(ApiParticipant(id = "p-me", userId = me), ApiParticipant(id = "p-$peer", userId = peer, displayName = name)),
    )

    private fun group(id: String, title: String, members: Int = 3, encryptionMode: String? = null) =
        ApiConversation(
        id = id, type = "group", title = title, encryptionMode = encryptionMode,
        participants = (1..members).map { ApiParticipant(id = "p$it", userId = "x$it") },
    )

    @Test
    fun `the source conversation and the blocked peers are never offered`() {
        val recipients = ShareRecipientDirectory.fromConversations(
            conversations = listOf(group("src", "Source"), direct("d1", "u1", "Léa"), direct("d2", "u2", "Bloqué"), group("g1", "Équipe")),
            sourceConversationId = "src",
            currentUserId = me,
            blockedUserIds = setOf("u2"),
        )
        assertThat(recipients.map { it.id }).containsExactly("conv:d1", "conv:g1").inOrder()
    }

    @Test
    fun `an end to end conversation is not a destination because Android cannot seal yet`() {
        val recipients = ShareRecipientDirectory.fromConversations(
            conversations = listOf(group("g1", "Clair"), group("g2", "Scellée", encryptionMode = "e2ee")),
            sourceConversationId = null, currentUserId = me,
        )
        assertThat(recipients.map { it.id }).containsExactly("conv:g1")
    }

    @Test
    fun `a direct row carries its peer so the presence is read from the served card and a group carries none`() {
        val rows = ShareRecipientDirectory.fromConversations(listOf(direct("d1", "u1", "Léa"), group("g1", "Équipe", 5)), null, me)
        assertThat(rows[0].userId).isEqualTo("u1")
        assertThat(rows[0].detail).isEqualTo(ShareRecipient.Detail.Direct)
        assertThat(rows[1].userId).isNull()
        assertThat(rows[1].detail).isEqualTo(ShareRecipient.Detail.Group(5))
    }

    @Test
    fun `recents are the first eight reachable conversations`() {
        val rows = ShareRecipientDirectory.fromConversations((1..12).map { group("g$it", "G$it") }, "g1", me)
        assertThat(ShareRecipientDirectory.recents(rows).map { it.id }).containsExactly(
            "conv:g2", "conv:g3", "conv:g4", "conv:g5", "conv:g6", "conv:g7", "conv:g8", "conv:g9",
        ).inOrder()
    }
}
