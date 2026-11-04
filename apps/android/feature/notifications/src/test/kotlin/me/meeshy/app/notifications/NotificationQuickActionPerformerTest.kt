package me.meeshy.app.notifications

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.NotificationQuickAction
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

class NotificationQuickActionPerformerTest {

    private class Fixture(
        val friends: FriendRepository = mockk(),
        val conversations: ConversationRepository = mockk(),
        val cache: FriendshipCache = FriendshipCache(),
    ) {
        val performer = NotificationQuickActionPerformer(friends, cache, conversations)
    }

    @Test
    fun `connect sends the request without a message and records it in the friendship cache`() = runTest {
        val f = Fixture()
        coEvery { f.friends.sendFriendRequest(receiverId = "u1") } returns NetworkResult.Success(FriendRequest(id = "r1"))

        val outcome = f.performer.perform(NotificationQuickAction.Connect("u1"))

        assertThat(outcome).isEqualTo(QuickActionOutcome.Connected)
        assertThat(f.cache.currentSentPendingReceiverIds).containsExactly("u1")
        coVerify(exactly = 1) { f.friends.sendFriendRequest(receiverId = "u1") }
    }

    @Test
    fun `a failed connect leaves the friendship cache untouched`() = runTest {
        val f = Fixture()
        coEvery { f.friends.sendFriendRequest(receiverId = "u1") } returns NetworkResult.Failure(ApiError("offline"))

        val outcome = f.performer.perform(NotificationQuickAction.Connect("u1"))

        assertThat(outcome).isEqualTo(QuickActionOutcome.Failed)
        assertThat(f.cache.currentSentPendingReceiverIds).isEmpty()
    }

    @Test
    fun `write opens a conversation that already exists`() = runTest {
        val f = Fixture()
        coEvery { f.conversations.directConversationWith("u1") } returns
            DirectConversationResolution.Found(ApiConversation(id = "c1"), fromCache = false)

        assertThat(f.performer.perform(NotificationQuickAction.Write("u1"))).isEqualTo(QuickActionOutcome.OpenConversation("c1"))
    }

    @Test
    fun `write opens the conversation it just created`() = runTest {
        val f = Fixture()
        coEvery { f.conversations.directConversationWith("u1") } returns DirectConversationResolution.Created(ApiConversation(id = "c2"))

        assertThat(f.performer.perform(NotificationQuickAction.Write("u1"))).isEqualTo(QuickActionOutcome.OpenConversation("c2"))
    }

    @Test
    fun `write fails when the conversation cannot be resolved`() = runTest {
        val f = Fixture()
        coEvery { f.conversations.directConversationWith("u1") } returns DirectConversationResolution.Failed(ApiError("offline"), offline = true)

        assertThat(f.performer.perform(NotificationQuickAction.Write("u1"))).isEqualTo(QuickActionOutcome.Failed)
    }
}
