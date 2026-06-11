package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateConversationRequest
import me.meeshy.sdk.net.api.ConversationApi
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private class FakeConversationApi(
    var response: ApiResponse<List<ApiConversation>>,
) : ConversationApi {
    override suspend fun list(offset: Int?, limit: Int?) = response
    override suspend fun getById(id: String) = ApiResponse<ApiConversation>(success = false)
    override suspend fun create(body: CreateConversationRequest) =
        ApiResponse<ApiConversation>(success = false)
    override suspend fun markRead(id: String) = ApiResponse(success = true, data = Unit)
}

@RunWith(RobolectricTestRunner::class)
class ConversationRepositoryTest {

    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun repository(api: ConversationApi) =
        ConversationRepository(api, db, db.conversationDao(), db.syncMetaDao())

    @Test
    fun `stream first emission is Empty on a cold cache`() = runTest {
        val repo = repository(FakeConversationApi(ApiResponse(success = false, error = "down")))

        assertThat(repo.conversationsStream().first()).isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `refresh persists conversations and sync metadata`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(
                    success = true,
                    data = listOf(
                        ApiConversation(id = "c1", title = "Team"),
                        ApiConversation(id = "c2", title = "Family"),
                    ),
                ),
            ),
        )

        repo.refresh()

        assertThat(db.conversationDao().observeAll().first().map { it.id })
            .containsExactly("c1", "c2")
        assertThat(db.syncMetaDao().observe(ConversationCacheSource.RESOURCE_KEY).first())
            .isNotNull()
    }

    @Test
    fun `refresh removes conversations absent from the latest sync`() = runTest {
        val api = FakeConversationApi(
            ApiResponse(success = true, data = listOf(ApiConversation(id = "c1"), ApiConversation(id = "c2"))),
        )
        val repo = repository(api)
        repo.refresh()

        api.response = ApiResponse(success = true, data = listOf(ApiConversation(id = "c2")))
        repo.refresh()

        assertThat(db.conversationDao().observeAll().first().map { it.id }).containsExactly("c2")
    }

    @Test
    fun `conversationStream emits the cached conversation by id`() = runTest {
        val repo = repository(
            FakeConversationApi(
                ApiResponse(
                    success = true,
                    data = listOf(
                        ApiConversation(id = "c1", title = "Team"),
                        ApiConversation(id = "c2", title = "Family"),
                    ),
                ),
            ),
        )
        repo.refresh()

        assertThat(repo.conversationStream("c2").first()?.title).isEqualTo("Family")
    }

    @Test
    fun `conversationStream emits null for an unknown conversation`() = runTest {
        val repo = repository(FakeConversationApi(ApiResponse(success = false, error = "n/a")))

        assertThat(repo.conversationStream("missing").first()).isNull()
    }

    @Test
    fun `refresh throws when the network fails`() = runTest {
        val repo = repository(FakeConversationApi(ApiResponse(success = false, error = "Server down")))

        val thrown = runCatching { repo.refresh() }.exceptionOrNull()

        assertThat(thrown).isInstanceOf(ConversationSyncException::class.java)
        assertThat(thrown).hasMessageThat().isEqualTo("Server down")
    }
}
