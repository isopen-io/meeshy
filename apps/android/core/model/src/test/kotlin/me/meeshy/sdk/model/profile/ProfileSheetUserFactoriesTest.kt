package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.FeedComment
import me.meeshy.sdk.model.FeedPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.RepostContent
import me.meeshy.sdk.model.StoryGroup
import org.junit.Test

class ProfileSheetUserFactoriesTest {
    private fun message(sender: ApiMessageSender?, senderId: String? = null) =
        ApiMessage(id = "m", conversationId = "c", senderId = senderId, sender = sender)

    @Test
    fun `account sender yields userId and participantId`() {
        val user = ProfileSheetUser.from(
            message(ApiMessageSender(id = "p1", userId = "u1", username = "al", displayName = "Al"), "p1"),
        )
        assertThat(user.userId).isEqualTo("u1")
        assertThat(user.participantId).isEqualTo("p1")
        assertThat(user.isAnonymous).isFalse()
        assertThat(user.username).isEqualTo("al")
    }

    @Test
    fun `anonymous sender never copies the participant id into userId`() {
        val user = ProfileSheetUser.from(message(ApiMessageSender(id = "p9", displayName = "Guest"), "p9"))
        assertThat(user.userId).isNull()
        assertThat(user.participantId).isEqualTo("p9")
        assertThat(user.isAnonymous).isTrue()
        assertThat(user.id).isEqualTo("p9")
        assertThat(user.username).isEqualTo("Guest")
    }

    @Test
    fun `message without sender does not break`() {
        val user = ProfileSheetUser.from(message(null))
        assertThat(user.username).isEqualTo("?")
        assertThat(user.isAnonymous).isFalse()
    }

    @Test
    fun `story group post repost and comment factories`() {
        assertThat(ProfileSheetUser.from(StoryGroup(id = "g", username = "s", avatarColor = "AA")).userId).isEqualTo("g")
        val post = ProfileSheetUser.from(FeedPost(id = "p", author = "Ann", authorId = "", authorUsername = null))
        assertThat(post.userId).isNull()
        assertThat(post.username).isEqualTo("Ann")
        val repost = ProfileSheetUser.from(RepostContent(id = "r", author = "Bo", authorId = "b", authorUsername = "bo"))
        assertThat(repost.userId).isEqualTo("b")
        assertThat(repost.username).isEqualTo("bo")
        val comment = ProfileSheetUser.from(FeedComment(id = "c", author = "Cy", authorId = "c1", authorColor = "FF"))
        assertThat(comment.userId).isEqualTo("c1")
        assertThat(comment.accentColor).isEqualTo("FF")
        assertThat(ProfileSheetUser.fromReference(userId = "", username = "x").userId).isNull()
    }

    @Test
    fun `direct conversation yields the peer not the reader`() {
        val conversation = ApiConversation(
            id = "c",
            type = "direct",
            participants = listOf(
                ApiParticipant(id = "p1", userId = "me", username = "me"),
                ApiParticipant(id = "p2", userId = "peer", username = "pe", displayName = "Pe", avatar = "a.png"),
            ),
        )
        val user = ProfileSheetUser.from(conversation, readerId = "me")
        assertThat(user?.userId).isEqualTo("peer")
        assertThat(user?.displayName).isEqualTo("Pe")
        assertThat(user?.avatarUrl).isEqualTo("a.png")
        assertThat(ProfileSheetUser.from(conversation, readerId = null)).isNull()
        assertThat(ProfileSheetUser.from(conversation.copy(type = "group"), readerId = "me")).isNull()
    }

    @Test
    fun `meeshy user factory composes name and parses dates`() {
        val user = ProfileSheetUser.from(
            MeeshyUser(
                id = "u", username = "al", firstName = "Al", lastName = "B",
                createdAt = "2024-01-01T00:00:00.000Z", signalIdentityKeyPublic = "k",
            ),
            accentColor = "AB",
        )
        assertThat(user.displayName).isEqualTo("Al B")
        assertThat(user.createdAtEpochMillis).isEqualTo(1704067200000L)
        assertThat(user.lastActiveAtEpochMillis).isNull()
        assertThat(user.hasE2EE).isTrue()
        assertThat(user.accentColor).isEqualTo("AB")
        assertThat(ProfileSheetUser.from(MeeshyUser(id = "u", username = "al")).displayName).isNull()
    }
}
