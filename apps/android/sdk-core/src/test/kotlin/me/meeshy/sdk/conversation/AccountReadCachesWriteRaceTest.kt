package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.call.CallHistoryRepository
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.CallHistoryApi
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.chat.InMemoryStarredMessagesStore
import me.meeshy.sdk.chat.StarredMessagesSync
import me.meeshy.sdk.chat.StarredSource
import me.meeshy.sdk.post.FeedListingRegistry
import me.meeshy.sdk.mediahub.ConversationMediaHubIndex
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MessageStarredEvent
import me.meeshy.sdk.model.mediahub.ConversationMediaKind
import me.meeshy.sdk.net.api.HashtagApi
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.post.PostHashtagRepository
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.status.StatusBarCacheRepository
import me.meeshy.sdk.status.StatusFeedMode
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13560 — the read caches (stories tray, call journal, status bar): an answer or an event of account A, begun under
 * A's ticket, never lands once A has signed out and B signed in. Each race is FORCED (the response arrives after the
 * switch).
 */
@RunWith(RobolectricTestRunner::class)
class AccountReadCachesWriteRaceTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private lateinit var db: MeeshyDatabase
    private val owner = Owner("A")
    private val transition = SessionTransitionFlags()
    private val fence = AccountFence(owner, transition)

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private suspend fun signOutThenSignInAsB() {
        owner.id = null
        transition.bumpGeneration()
        fence.close { db.clearAllTables() }
        owner.id = "B"
        transition.bumpGeneration()
    }

    private fun stories(api: StoryApi) = StoryRepository(
        api, db, db.storyDao(), db.syncMetaDao(), OutboxRepository(db, db.outboxDao()), mockk(relaxed = true),
        fence = fence,
    )

    private val story = ApiPost(id = "s-de-A", type = "STORY", createdAt = "2026-10-23T10:00:00Z")

    @Test
    fun `a stories tray answered after A signed out is not kept for B`(): Unit = runBlocking {
        val api: StoryApi = mockk(relaxed = true)
        coEvery { api.list(any(), any()) } coAnswers {
            signOutThenSignInAsB()
            ApiResponse(success = true, data = listOf(story), pagination = Pagination(hasMore = false))
        }
        val repository = stories(api)

        repository.refresh()

        assertThat(repository.cachedStories()).isEmpty()
    }

    @Test
    fun `a stories tray answered while A is still signed in lands`(): Unit = runBlocking {
        val api: StoryApi = mockk(relaxed = true)
        coEvery { api.list(any(), any()) } returns
            ApiResponse(success = true, data = listOf(story), pagination = Pagination(hasMore = false))
        val repository = stories(api)

        repository.refresh()

        assertThat(repository.cachedStories().map { it.id }).containsExactly("s-de-A")
    }

    @Test
    fun `a story announced to A and folded after B signed in never joins B's tray`(): Unit = runBlocking {
        val repository = stories(mockk(relaxed = true))
        val ticketOfEvent = fence.ticket()
        signOutThenSignInAsB()

        me.meeshy.sdk.session.withAccountTicket(ticketOfEvent) {
            repository.adoptAnnounced(story)
        }

        assertThat(repository.cachedStories()).isEmpty()
    }

    private fun record(id: String) = CallRecord(
        callId = id, conversationId = "conv-$id", conversationType = "direct", mode = "p2p", status = "ended",
        direction = "incoming", isVideo = false, startedAt = "2026-10-23T10:00:00Z", durationSec = 0, peer = null,
    )

    @Test
    fun `a call journal answered after A signed out is not kept for B`(): Unit = runBlocking {
        val api: CallHistoryApi = mockk(relaxed = true)
        coEvery { api.history(any(), any(), any(), any(), any()) } coAnswers {
            signOutThenSignInAsB()
            ApiResponse(success = true, data = listOf(record("appel-de-A")), pagination = Pagination(hasMore = false))
        }
        val repository = CallHistoryRepository(api, db, db.callHistoryDao(), db.syncMetaDao(), fence)

        repository.refresh()

        assertThat(db.callHistoryDao().all()).isEmpty()
    }

    @Test
    fun `a status bar persisted under A's ticket after A signed out is not kept for B`(): Unit = runBlocking {
        val bars = StatusBarCacheRepository(db.statusBarCacheDao(), fence)
        val ticket = bars.ticket()
        signOutThenSignInAsB()

        bars.persistBar(StatusFeedMode.FRIENDS, listOf(StatusEntry(id = "statut-de-A")), ticket)

        assertThat(bars.cachedBar(StatusFeedMode.FRIENDS)).isNull()
    }

    @Test
    fun `a feed answered after A signed out is not kept for B`(): Unit = runBlocking {
        val api: PostApi = mockk(relaxed = true)
        coEvery { api.getFeed(any(), any()) } coAnswers {
            signOutThenSignInAsB()
            ApiResponse(success = true, data = listOf(ApiPost(id = "post-de-A")))
        }
        val repository = PostRepository(api, mockk(relaxed = true), OutboxRepository(db, db.outboxDao()), fence = fence)

        repository.refresh()

        assertThat(repository.feedCacheSnapshot).isNull()
    }

    @Test
    fun `a feed answered while A is still signed in lands`(): Unit = runBlocking {
        val api: PostApi = mockk(relaxed = true)
        coEvery { api.getFeed(any(), any()) } returns ApiResponse(success = true, data = listOf(ApiPost(id = "post-de-A")))
        val repository = PostRepository(api, mockk(relaxed = true), OutboxRepository(db, db.outboxDao()), fence = fence)

        repository.refresh()

        assertThat(repository.feedCacheSnapshot?.map { it.id }).containsExactly("post-de-A")
    }

    @Test
    fun `a hashtag page answered after A signed out is not kept for B`(): Unit = runBlocking {
        val api: PostApi = mockk(relaxed = true)
        coEvery { api.getByHashtag(any(), any(), any()) } coAnswers {
            signOutThenSignInAsB()
            ApiResponse(success = true, data = listOf(ApiPost(id = "post-de-A")), pagination = Pagination(hasMore = false))
        }
        val repository = PostHashtagRepository(api, mockk<HashtagApi>(relaxed = true), FeedListingRegistry(), fence)

        repository.posts("paris")

        assertThat(repository.cachedFirstPage("paris")).isNull()
    }

    @Test
    fun `the drained stories archive of A is not kept for B`(): Unit = runBlocking {
        val api: StoryApi = mockk(relaxed = true)
        coEvery { api.listMine(any(), any()) } coAnswers {
            signOutThenSignInAsB()
            ApiResponse(success = true, data = listOf(story), pagination = Pagination(hasMore = false))
        }
        val repository = stories(api)

        repository.drainMyStories()

        assertThat(repository.cachedMyStories()).isNull()
    }

    @Test
    fun `a media hub page fetched for A and merged after B signed in never joins B's index`(): Unit = runBlocking {
        val index = ConversationMediaHubIndex(fence)
        val ticket = index.ticket()
        signOutThenSignInAsB()

        index.merge("conv-de-A", ConversationMediaKind.VISUAL, listOf(ApiMessage(id = "m", conversationId = "conv-de-A")), true, ticket)

        assertThat(index.read("conv-de-A", ConversationMediaKind.VISUAL)).isNull()
    }

    @Test
    fun `a star placed by A and composed after B signed in never joins B's favourites`(): Unit = runBlocking {
        val store = InMemoryStarredMessagesStore()
        val source = object : StarredSource {
            override suspend fun message(messageId: String): ApiMessage? {
                signOutThenSignInAsB()
                return ApiMessage(id = messageId, conversationId = "c1", content = "secret de A", originalLanguage = "fr")
            }
            override suspend fun conversation(conversationId: String): ApiConversation? = null
            override suspend fun readerPrism(): List<String> = listOf("fr")
        }
        val sync = StarredMessagesSync(store, source, { "x" }, { null }, { 1L }, fence)

        sync.onStarred(MessageStarredEvent("m1", "c1", true, null), fence.ticket())

        assertThat(store.starred.value.items).isEmpty()
    }
}
