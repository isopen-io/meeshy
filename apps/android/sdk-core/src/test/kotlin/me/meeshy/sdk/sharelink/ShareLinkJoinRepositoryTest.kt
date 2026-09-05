package me.meeshy.sdk.sharelink

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ConversationAnalysis
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
private abstract class StubJoinApi : ConversationApi {
    // #3943 — la fiche d'un participant. Ces quatre stubs implémentent
    // `ConversationApi` À LA MAIN : chaque route ajoutée à l'interface est donc
    // un inventaire à tenir dans quatre fichiers, et le compilateur est le seul
    // à s'en souvenir. Refusent par défaut — un test qui a besoin de la route
    // la redéfinit.
    override suspend fun participantProfile(id: String, participantId: String) =
        me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.model.ApiParticipantProfile>(success = false)

    override suspend fun updateHistoryGrant(
        id: String,
        participantId: String,
        body: me.meeshy.sdk.model.HistoryGrantUpdate,
    ) = me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.net.api.ParticipantRightsUpdateResult>(success = false)

    override suspend fun list(offset: Int?, limit: Int?, updatedSince: String?) = ApiResponse<List<ApiConversation>>(success = false)
    override suspend fun listConditional(
        offset: Int?,
        limit: Int?,
        updatedSince: String?,
        ifNoneMatch: String?,
    ): retrofit2.Response<ApiResponse<List<ApiConversation>>> =
        retrofit2.Response.success(ApiResponse(success = false))
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

private class JoinApi(
    private val response: ApiResponse<JoinAuthenticatedResponse>,
) : StubJoinApi() {
    var requestedLinkId: String? = null
    var callCount: Int = 0

    override suspend fun joinViaShareLink(linkId: String): ApiResponse<JoinAuthenticatedResponse> {
        callCount += 1
        requestedLinkId = linkId
        return response
    }
}

private class ThrowingJoinApi : StubJoinApi() {
    var callCount: Int = 0

    override suspend fun joinViaShareLink(linkId: String): ApiResponse<JoinAuthenticatedResponse> {
        callCount += 1
        throw IOException("offline")
    }
}

class ShareLinkJoinRepositoryTest {

    @Test
    fun `joinAuthenticated returns the canonical conversationId and forwards the linkId`() = runTest {
        val api = JoinApi(
            ApiResponse(success = true, data = JoinAuthenticatedResponse(conversationId = "conv-1")),
        )
        val repo = ShareLinkJoinRepository(api)

        val result = repo.joinAuthenticated("link-1")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat((result as NetworkResult.Success).data).isEqualTo("conv-1")
        assertThat(api.requestedLinkId).isEqualTo("link-1")
    }

    @Test
    fun `joinAuthenticated trims the linkId sent and the conversationId returned`() = runTest {
        val api = JoinApi(
            ApiResponse(success = true, data = JoinAuthenticatedResponse(conversationId = "  conv-9  ")),
        )
        val repo = ShareLinkJoinRepository(api)

        val result = repo.joinAuthenticated("  link-9  ")

        assertThat((result as NetworkResult.Success).data).isEqualTo("conv-9")
        assertThat(api.requestedLinkId).isEqualTo("link-9")
    }

    @Test
    fun `joinAuthenticated folds a success envelope with a blank conversationId into a failure`() = runTest {
        val api = JoinApi(
            ApiResponse(success = true, data = JoinAuthenticatedResponse(conversationId = "   ")),
        )
        val repo = ShareLinkJoinRepository(api)

        val result = repo.joinAuthenticated("link-1")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `joinAuthenticated is inert on a blank linkId and never calls the network`() = runTest {
        val api = JoinApi(
            ApiResponse(success = true, data = JoinAuthenticatedResponse(conversationId = "conv-1")),
        )
        val repo = ShareLinkJoinRepository(api)

        val result = repo.joinAuthenticated("   ")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(api.callCount).isEqualTo(0)
    }

    @Test
    fun `joinAuthenticated folds an unsuccessful envelope into a failure`() = runTest {
        val api = JoinApi(ApiResponse(success = false, error = "boom"))
        val repo = ShareLinkJoinRepository(api)

        val result = repo.joinAuthenticated("link-1")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `joinAuthenticated folds a transport error into a failure`() = runTest {
        val api = ThrowingJoinApi()
        val repo = ShareLinkJoinRepository(api)

        val result = repo.joinAuthenticated("link-1")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(api.callCount).isEqualTo(1)
    }
}
