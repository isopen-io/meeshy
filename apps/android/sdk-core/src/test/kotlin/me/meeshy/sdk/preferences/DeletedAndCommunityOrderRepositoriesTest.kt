package me.meeshy.sdk.preferences

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.preferences.CommunityReorderBody
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CommunityPreferencesApi
import me.meeshy.sdk.net.api.DeletedConversationsApi
import org.junit.Test
import java.io.IOException
import java.time.Instant

class DeletedAndCommunityOrderRepositoriesTest {

    private class Trash(var body: String? = null, var offline: Boolean = false) : DeletedConversationsApi {
        override suspend fun deletedConversations(): ApiResponse<JsonElement> {
            if (offline) throw IOException("no network")
            return ApiResponse(success = true, data = Json.parseToJsonElement(body ?: "[]"))
        }
    }

    private class Communities : CommunityPreferencesApi {
        var offline = false
        var refusal: String? = null
        val sent = mutableListOf<CommunityReorderBody>()

        override suspend fun reorder(body: CommunityReorderBody): ApiResponse<Unit> {
            sent += body
            if (offline) throw IOException("no network")
            return refusal?.let { ApiResponse(success = false, error = it, code = "FORBIDDEN") }
                ?: ApiResponse(success = true, data = Unit)
        }
    }

    @Test
    fun `fetchSince keeps the deletions made after the bound`() = runTest {
        val api = Trash(
            """[{"conversationId":"old","deletedAt":"2026-10-01T00:00:00Z"},
                {"conversationId":"new","deletedAt":"2026-10-09T00:00:00Z"}]""",
        )

        val result = DeletedConversationsRepository(api)
            .fetchSince(Instant.parse("2026-10-05T00:00:00Z").toEpochMilli())

        assertThat((result as NetworkResult.Success).data.map { it.conversationId }).containsExactly("new")
    }

    @Test
    fun `fetchSince without a bound returns the whole trash and an outage is returned`() = runTest {
        val api = Trash("""[{"conversationId":"a"},{"conversationId":"b"}]""")
        val repository = DeletedConversationsRepository(api)

        assertThat((repository.fetchSince(null) as NetworkResult.Success).data).hasSize(2)

        api.offline = true
        assertThat(repository.fetchSince(null)).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `the community order is sent complete`() = runTest {
        val api = Communities()

        val outcome = CommunityOrderRepository(api).reorder(listOf("a", "b", "c"))

        assertThat(outcome).isEqualTo(ReorderOutcome.Sent)
        assertThat(api.sent.single().updates.map { it.communityId }).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `offline the last order is held and replayed once`() = runTest {
        val api = Communities().apply { offline = true }
        val repository = CommunityOrderRepository(api)

        assertThat(repository.reorder(listOf("a", "b"))).isEqualTo(ReorderOutcome.Queued)
        assertThat(repository.reorder(listOf("b", "a"))).isEqualTo(ReorderOutcome.Queued)
        api.offline = false
        assertThat(repository.flushPending()).isEqualTo(ReorderOutcome.Sent)
        assertThat(api.sent.last().updates.map { it.communityId }).containsExactly("b", "a").inOrder()
        assertThat(repository.flushPending()).isNull()
    }

    @Test
    fun `a refusal withdraws the held order`() = runTest {
        val api = Communities().apply { offline = true }
        val repository = CommunityOrderRepository(api)
        repository.reorder(listOf("a", "b"))
        api.offline = false
        api.refusal = "not a member"

        val outcome = repository.reorder(listOf("b", "a"))

        assertThat(outcome).isEqualTo(ReorderOutcome.Rejected("not a member"))
        assertThat(repository.flushPending()).isNull()
    }
}
