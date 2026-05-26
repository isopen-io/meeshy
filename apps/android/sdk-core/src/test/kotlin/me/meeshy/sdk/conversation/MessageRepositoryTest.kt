package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.api.MessageApi
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private class FakeMessageApi(
    var response: ApiResponse<List<ApiMessage>>,
) : MessageApi {
    override suspend fun list(conversationId: String, offset: Int?, limit: Int?) = response
    override suspend fun send(conversationId: String, body: SendMessageRequest) =
        ApiResponse<ApiMessage>(success = false)
}

private fun apiMessage(id: String, conversationId: String = "c1") =
    ApiMessage(id = id, conversationId = conversationId, content = "hi")

@RunWith(RobolectricTestRunner::class)
class MessageRepositoryTest {

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

    private fun repository(api: MessageApi) =
        MessageRepository(api, db, db.messageDao(), db.syncMetaDao())

    @Test
    fun `stream first emission is Empty on a cold cache`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "down")))

        assertThat(repo.messagesStream("c1").first()).isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `refresh persists the conversation's messages`() = runTest {
        val repo = repository(
            FakeMessageApi(
                ApiResponse(success = true, data = listOf(apiMessage("m1"), apiMessage("m2"))),
            ),
        )

        repo.refresh("c1")

        assertThat(db.messageDao().observeForConversation("c1").first().map { it.id })
            .containsExactly("m1", "m2")
    }

    @Test
    fun `refresh prunes messages absent from the latest sync`() = runTest {
        val api = FakeMessageApi(
            ApiResponse(success = true, data = listOf(apiMessage("m1"), apiMessage("m2"))),
        )
        val repo = repository(api)
        repo.refresh("c1")

        api.response = ApiResponse(success = true, data = listOf(apiMessage("m2")))
        repo.refresh("c1")

        assertThat(db.messageDao().observeForConversation("c1").first().map { it.id })
            .containsExactly("m2")
    }

    @Test
    fun `refresh throws when the network fails`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "Server down")))

        val thrown = runCatching { repo.refresh("c1") }.exceptionOrNull()

        assertThat(thrown).isInstanceOf(MessageSyncException::class.java)
    }
}
