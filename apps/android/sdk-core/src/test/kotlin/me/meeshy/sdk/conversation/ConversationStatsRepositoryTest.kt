package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ConversationAnalysis
import me.meeshy.sdk.model.ContentTypeCounts
import me.meeshy.sdk.model.ConversationMessageStatsResponse
import me.meeshy.sdk.model.CreateConversationRequest
import me.meeshy.sdk.model.JoinAuthenticatedResponse
import me.meeshy.sdk.model.PaginatedParticipantsResponse
import me.meeshy.sdk.model.UpdateConversationResponse
import me.meeshy.sdk.model.UpdateConversationSettingsRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AddParticipantRequest
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.ConversationPreferencesUpdate
import me.meeshy.sdk.net.api.ParticipantRoleUpdate
import java.io.IOException
import org.junit.Test

/** Every unrelated endpoint answers "not wired" so a stray call fails loudly. */
private abstract class StubStatsApi : ConversationApi {
    override suspend fun list(offset: Int?, limit: Int?) = ApiResponse<List<ApiConversation>>(success = false)
    override suspend fun search(query: String) = ApiResponse<List<ApiConversation>>(success = false)
    override suspend fun getById(id: String) = ApiResponse<ApiConversation>(success = false)
    override suspend fun stats(id: String) = ApiResponse<ConversationMessageStatsResponse>(success = false)
    override suspend fun analysis(id: String) = ApiResponse<ConversationAnalysis>(success = false)
    override suspend fun create(body: CreateConversationRequest) = ApiResponse<ApiConversation>(success = false)
    override suspend fun markRead(id: String) = ApiResponse<Unit>(success = false)
    override suspend fun markUnread(id: String) = ApiResponse<Unit>(success = false)
    override suspend fun updatePreferences(id: String, body: ConversationPreferencesUpdate) =
        ApiResponse<Unit>(success = false)
    override suspend fun updateSettings(id: String, body: UpdateConversationSettingsRequest) =
        ApiResponse<UpdateConversationResponse>(success = false)
    override suspend fun leave(id: String) = ApiResponse<Unit>(success = false)
    override suspend fun deleteForMe(id: String) = ApiResponse<Unit>(success = false)
    override suspend fun deleteForAll(id: String) = ApiResponse<Unit>(success = false)
    override suspend fun participants(id: String, search: String?, limit: Int?, cursor: String?) =
        PaginatedParticipantsResponse(success = false)
    override suspend fun updateParticipantRole(id: String, userId: String, body: ParticipantRoleUpdate) =
        ApiResponse<Unit>(success = false)
    override suspend fun removeParticipant(id: String, userId: String) = ApiResponse<Unit>(success = false)
    override suspend fun addParticipant(id: String, body: AddParticipantRequest) = ApiResponse<Unit>(success = false)
    override suspend fun banParticipant(id: String, userId: String) = ApiResponse<Unit>(success = false)
    override suspend fun joinViaShareLink(linkId: String) = ApiResponse<JoinAuthenticatedResponse>(success = false)
}

private class SuccessStatsApi(private val payload: ConversationMessageStatsResponse) : StubStatsApi() {
    var requestedId: String? = null
    override suspend fun stats(id: String): ApiResponse<ConversationMessageStatsResponse> {
        requestedId = id
        return ApiResponse(success = true, data = payload)
    }
}

private class EnvelopeFailureApi : StubStatsApi() {
    override suspend fun stats(id: String) =
        ApiResponse<ConversationMessageStatsResponse>(success = false, error = "boom")
}

private class ThrowingStatsApi : StubStatsApi() {
    override suspend fun stats(id: String): ApiResponse<ConversationMessageStatsResponse> =
        throw IOException("offline")
}

class ConversationStatsRepositoryTest {

    @Test
    fun `fetchStats returns the payload on success and forwards the id`() = runTest {
        val api = SuccessStatsApi(
            ConversationMessageStatsResponse(conversationId = "c1", totalMessages = 12, contentTypes = ContentTypeCounts(text = 12)),
        )
        val repo = ConversationStatsRepository(api)

        val result = repo.fetchStats("c1")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat((result as NetworkResult.Success).data.totalMessages).isEqualTo(12)
        assertThat(api.requestedId).isEqualTo("c1")
    }

    @Test
    fun `fetchStats folds an unsuccessful envelope into a failure`() = runTest {
        val result = ConversationStatsRepository(EnvelopeFailureApi()).fetchStats("c1")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `fetchStats folds a transport error into a failure`() = runTest {
        val result = ConversationStatsRepository(ThrowingStatsApi()).fetchStats("c1")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }
}
