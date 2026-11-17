package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.SocketStatusCreatedData
import me.meeshy.sdk.model.SocketStatusDeletedData
import me.meeshy.sdk.model.SocketStatusUpdatedData
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.Test

/**
 * #18930 — iso iOS: a friend's mood changing while the list is shown repaints its row mood at once, without reloading
 * the list. The moods used to be painted once, from the cache, and stayed until the next load.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListObserversMoodTest {

    private val created = MutableSharedFlow<SocketStatusCreatedData>(extraBufferCapacity = 8)
    private val updated = MutableSharedFlow<SocketStatusUpdatedData>(extraBufferCapacity = 8)
    private val deleted = MutableSharedFlow<SocketStatusDeletedData>(extraBufferCapacity = 8)

    private fun mood(id: String, userId: String, emoji: String) =
        ApiPost(id = id, type = "STATUS", moodEmoji = emoji, author = ApiAuthor(id = userId, username = "user-$userId"))

    private fun TestScope.rig(cached: List<StatusEntry> = emptyList()): MutableStateFlow<ConversationListUiState> {
        val state = MutableStateFlow(ConversationListUiState(currentUserId = "me"))
        ConversationListObservers(
            scope = backgroundScope,
            state = state,
            messageSocketManager = mockk<MessageSocketManager> {
                every { typingStarted } returns MutableSharedFlow()
                every { typingStopped } returns MutableSharedFlow()
                every { messageReceived } returns MutableSharedFlow()
            },
            categoryRepository = mockk(relaxed = true),
            categorySocketManager = mockk(relaxed = true),
            storyRepository = mockk(relaxed = true) { every { storiesStream(any(), any()) } returns emptyFlow() },
            statusBarCache = mockk(relaxed = true) {
                every { load(any()) } returns if (cached.isEmpty()) CacheResult.Empty else CacheResult.Fresh(cached, 0L)
            },
            socialSocketManager = mockk<SocialSocketManager> {
                every { statusCreated } returns created
                every { statusUpdated } returns updated
                every { statusDeleted } returns deleted
            },
        ).startLive()
        return state
    }

    private fun MutableStateFlow<ConversationListUiState>.emojiOf(userId: String): String? =
        value.moodStatuses.firstOrNull { it.userId == userId }?.moodEmoji

    @Test
    fun `a mood a friend publishes while the list is shown reaches the list state`() = runTest(StandardTestDispatcher()) {
        val state = rig()
        runCurrent()

        created.emit(SocketStatusCreatedData(status = mood("s1", "ali", "🔥")))
        runCurrent()

        assertThat(state.emojiOf("ali")).isEqualTo("🔥")
    }

    @Test
    fun `a mood edited elsewhere replaces the one the list holds`() = runTest(StandardTestDispatcher()) {
        val state = rig(cached = listOf(StatusEntry(id = "s1", userId = "ali", moodEmoji = "🙂")))
        runCurrent()

        updated.emit(SocketStatusUpdatedData(status = mood("s1", "ali", "😴")))
        runCurrent()

        assertThat(state.emojiOf("ali")).isEqualTo("😴")
    }

    @Test
    fun `a mood removed elsewhere leaves the list`() = runTest(StandardTestDispatcher()) {
        val state = rig(cached = listOf(StatusEntry(id = "s1", userId = "ali", moodEmoji = "🙂")))
        runCurrent()

        deleted.emit(SocketStatusDeletedData(statusId = "s1", authorId = "ali"))
        runCurrent()

        assertThat(state.emojiOf("ali")).isNull()
    }

    @Test
    fun `a post that is not a mood leaves the row moods as they are`() = runTest(StandardTestDispatcher()) {
        val cached = listOf(StatusEntry(id = "s1", userId = "ali", moodEmoji = "🙂"))
        val state = rig(cached = cached)
        runCurrent()

        created.emit(SocketStatusCreatedData(status = ApiPost(id = "p1", type = "POST")))
        runCurrent()

        assertThat(state.value.moodStatuses).isEqualTo(cached)
    }
}
