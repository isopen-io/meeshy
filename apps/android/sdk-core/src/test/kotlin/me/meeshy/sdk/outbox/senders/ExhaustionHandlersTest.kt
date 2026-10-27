package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.confirmVerified
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.BlockRepository
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.media.TusUploadRepository
import me.meeshy.sdk.model.friend.FriendshipStatus
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.ReactionApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.PinPayload
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.Test

/**
 * Pins what each kind undoes once its row gives up. The rollbacks moved out of the flush
 * worker's `when` into their kind's handler; none of them changed.
 */
class ExhaustionHandlersTest {

    private val messageRepository = mockk<MessageRepository>(relaxed = true)
    private val sessionRepository = mockk<SessionRepository>(relaxed = true)
    private val postRepository = mockk<PostRepository>(relaxed = true)
    private val mediaBlobStore = mockk<MediaBlobStore>(relaxed = true)

    @Test
    fun `an exhausted message send flips its bubble to the failed state`() = runTest {
        val handler = SendMessageHandler(mockk<MessageApi>(), messageRepository, senderJson)

        handler.onExhausted(outboxRow(OutboxKind.SEND_MESSAGE, cmid = "cmid-7"))

        coVerify(exactly = 1) { messageRepository.markSendFailed("cmid-7") }
    }

    @Test
    fun `an exhausted media upload drops its stored bytes`() = runTest {
        val handler = UploadMediaHandler(mediaBlobStore, mockk<MediaRepository>(), mockk<TusUploadRepository>(), senderJson)

        handler.onExhausted(outboxRow(OutboxKind.UPLOAD_MEDIA, cmid = "cmid-7"))

        coVerify(exactly = 1) { mediaBlobStore.remove("cmid-7") }
    }

    @Test
    fun `an exhausted block removes the optimistic block`() = runTest {
        val cache = BlockCache().apply { setBlocked("u1", blocked = true) }

        BlockUserHandler(mockk<BlockRepository>(), cache).onExhausted(outboxRow(OutboxKind.BLOCK_USER, targetId = "u1"))

        assertThat(cache.isBlocked("u1")).isFalse()
    }

    @Test
    fun `an exhausted unblock restores the block`() = runTest {
        val cache = BlockCache()

        UnblockUserHandler(mockk<BlockRepository>(), cache).onExhausted(outboxRow(OutboxKind.UNBLOCK_USER, targetId = "u1"))

        assertThat(cache.isBlocked("u1")).isTrue()
    }

    @Test
    fun `an exhausted friend request rolls the optimistic pending entry back`() = runTest {
        val cache = FriendshipCache().apply { didSendRequest("u1", "cmid-1") }
        val handler = SendFriendRequestHandler(mockk<FriendRepository>(), cache, senderJson)

        handler.onExhausted(outboxRow(OutboxKind.SEND_FRIEND_REQUEST, targetId = "u1"))

        assertThat(cache.status("u1")).isEqualTo(FriendshipStatus.None)
    }

    @Test
    fun `an exhausted profile edit reverts the optimistic paint to the gateway truth`() = runTest {
        val handler = UpdateProfileHandler(mockk<UserRepository>(), sessionRepository, senderJson)

        handler.onExhausted(outboxRow(OutboxKind.UPDATE_PROFILE))

        coVerify(exactly = 1) { sessionRepository.refresh() }
    }

    @Test
    fun `an exhausted pin or unpin refreshes the conversation named by its payload`() = runTest {
        val payload = encodedPayload(PinPayload("c1"))

        PinMessageHandler(mockk<MessageApi>(), messageRepository, senderJson)
            .onExhausted(outboxRow(OutboxKind.PIN_MESSAGE, payload = payload))
        UnpinMessageHandler(mockk<MessageApi>(), messageRepository, senderJson)
            .onExhausted(outboxRow(OutboxKind.UNPIN_MESSAGE, payload = payload))

        coVerify(exactly = 2) { messageRepository.refresh("c1") }
    }

    @Test
    fun `an exhausted pin whose payload cannot be read refreshes nothing`() = runTest {
        PinMessageHandler(mockk<MessageApi>(), messageRepository, senderJson)
            .onExhausted(outboxRow(OutboxKind.PIN_MESSAGE, payload = "garbage"))

        coVerify(exactly = 0) { messageRepository.refresh(any()) }
    }

    @Test
    fun `an exhausted like or unlike rolls the optimistic flip back to its previous state`() = runTest {
        LikePostHandler(mockk<PostApi>(), postRepository).onExhausted(outboxRow(OutboxKind.LIKE_POST, targetId = "p1"))
        UnlikePostHandler(mockk<PostApi>(), postRepository).onExhausted(outboxRow(OutboxKind.UNLIKE_POST, targetId = "p2"))

        verify(exactly = 1) { postRepository.rollbackLike("p1", liked = false) }
        verify(exactly = 1) { postRepository.rollbackLike("p2", liked = true) }
    }

    @Test
    fun `an exhausted bookmark or unbookmark rolls the optimistic flip back to its previous state`() = runTest {
        BookmarkPostHandler(mockk<PostApi>(), postRepository)
            .onExhausted(outboxRow(OutboxKind.BOOKMARK_POST, targetId = "p1"))
        UnbookmarkPostHandler(mockk<PostApi>(), postRepository)
            .onExhausted(outboxRow(OutboxKind.UNBOOKMARK_POST, targetId = "p2"))

        verify(exactly = 1) { postRepository.rollbackBookmark("p1", bookmarked = false) }
        verify(exactly = 1) { postRepository.rollbackBookmark("p2", bookmarked = true) }
    }

    @Test
    fun `kinds with no optimistic effect touch nothing when exhausted`() = runTest {
        val messageApi = mockk<MessageApi>()
        val reactionApi = mockk<ReactionApi>()
        val conversationApi = mockk<ConversationApi>()
        val postApi = mockk<PostApi>()
        val outboxRepository = mockk<OutboxRepository>()
        val untouchable: Map<OutboxKind, OutboxKindHandler> = mapOf(
            OutboxKind.EDIT_MESSAGE to EditMessageHandler(messageApi, senderJson),
            OutboxKind.DELETE_MESSAGE to DeleteMessageHandler(messageApi),
            OutboxKind.ADD_REACTION to AddReactionHandler(reactionApi, senderJson),
            OutboxKind.REMOVE_REACTION to RemoveReactionHandler(reactionApi, senderJson),
            OutboxKind.READ_RECEIPT to ReadReceiptHandler(conversationApi),
            OutboxKind.MARK_UNREAD to MarkUnreadHandler(conversationApi),
            OutboxKind.UPDATE_CONVERSATION_PREFS to UpdateConversationPrefsHandler(conversationApi, senderJson),
            OutboxKind.PUBLISH_STORY to PublishStoryHandler(postApi, outboxRepository, senderJson, mockk(relaxed = true)),
        )

        untouchable.forEach { (kind, handler) -> handler.onExhausted(outboxRow(kind)) }

        confirmVerified(messageApi, reactionApi, conversationApi, postApi, outboxRepository)
    }
}
