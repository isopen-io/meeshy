package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/**
 * #19424 — une conversation lue hors ligne garde un badge nul tant que l'accusé n'est pas confirmé : une ligne servie
 * dont le dernier message est déjà lu (instant SERVEUR du message, jamais l'horloge de l'appareil) ne remonte pas, un
 * message plus récent compte.
 */
@RunWith(RobolectricTestRunner::class)
class ConversationCacheSourcePendingReadTest {

    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private fun served(lastAt: String, unread: Int) = ApiConversation(
        id = "c1",
        type = "group",
        title = "Groupe",
        updatedAt = lastAt,
        unreadCount = unread,
        lastMessage = ApiConversationLastMessage(id = "m-$lastAt", content = "texte", createdAt = lastAt),
    )

    private fun page(vararg rows: ApiConversation) = Response.success(
        ApiResponse(success = true, data = rows.toList(), pagination = Pagination(total = rows.size, offset = 0, limit = 100, hasMore = false)),
    )

    private fun repository(api: ConversationApi) = ConversationRepository(
        conversationApi = api,
        database = db,
        conversationDao = db.conversationDao(),
        syncMetaDao = db.syncMetaDao(),
        outboxRepository = OutboxRepository(db, db.outboxDao()),
    )

    private suspend fun cachedUnread(): Int = db.conversationDao().find("c1")!!.unreadCount

    @Test
    fun `a conversation read offline keeps a zero badge when a sweep serves its last message as unread`() = runTest {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(served(T1, unread = 3))
        val repository = repository(api)
        repository.syncSilently()
        repository.markReadOptimistic("c1")

        repository.syncSilently()

        assertThat(cachedUnread()).isEqualTo(0)
    }

    @Test
    fun `a message newer than the one read counts again`() = runTest {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(served(T1, unread = 3))
        val repository = repository(api)
        repository.syncSilently()
        repository.markReadOptimistic("c1")
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(served(T2, unread = 1))

        repository.syncSilently()

        assertThat(cachedUnread()).isEqualTo(1)
    }

    @Test
    fun `once the receipt is no longer owed the served count is taken`() = runTest {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(served(T1, unread = 3))
        val repository = repository(api)
        repository.syncSilently()
        repository.markReadOptimistic("c1")
        val receipt = db.outboxDao().byKind("READ_RECEIPT").single()
        db.outboxDao().deleteAll(listOf(receipt.cmid))

        repository.syncSilently()

        assertThat(cachedUnread()).isEqualTo(3)
    }

    private companion object {
        const val T1 = "2023-11-14T20:00:00.000Z"
        const val T2 = "2023-11-14T21:00:00.000Z"
    }
}
