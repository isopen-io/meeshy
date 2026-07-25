package me.meeshy.sdk.sharelink

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateShareLinkDetail
import me.meeshy.sdk.model.CreateShareLinkRequest
import me.meeshy.sdk.model.CreateShareLinkResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.LinkApi
import org.junit.Test

/**
 * Behavioural spec for [ShareLinkRepository.create] — it flattens the gateway's
 * nested create envelope into a [me.meeshy.sdk.model.CreatedShareLink] on success
 * and propagates the failure otherwise. Driven through a fake [LinkApi] recording
 * the exact request it received.
 */
class ShareLinkRepositoryTest {

    private class FakeLinkApi(
        var response: ApiResponse<CreateShareLinkResponse> = ApiResponse(success = false),
        val requests: MutableList<CreateShareLinkRequest> = mutableListOf(),
    ) : LinkApi {
        override suspend fun create(body: CreateShareLinkRequest): ApiResponse<CreateShareLinkResponse> {
            requests += body
            return response
        }
    }

    private fun request() = CreateShareLinkRequest(conversationId = "conv-1", name = "Launch")

    @Test
    fun create_success_flattensTheNestedEnvelopeAndForwardsTheRequest() = runTest {
        val api = FakeLinkApi(
            response = ApiResponse(
                success = true,
                data = CreateShareLinkResponse(
                    linkId = "link-42",
                    conversationId = "conv-1",
                    shareLink = CreateShareLinkDetail(
                        id = "sl-1",
                        linkId = "ignored-when-top-present",
                        name = "Launch",
                        isActive = true,
                    ),
                ),
            ),
        )
        val repo = ShareLinkRepository(api)

        val result = repo.create(request())

        assertThat(api.requests).hasSize(1)
        assertThat(api.requests.first().conversationId).isEqualTo("conv-1")
        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        val created = (result as NetworkResult.Success).data
        assertThat(created.id).isEqualTo("sl-1")
        assertThat(created.linkId).isEqualTo("link-42")
        assertThat(created.conversationId).isEqualTo("conv-1")
        assertThat(created.name).isEqualTo("Launch")
        assertThat(created.isActive).isTrue()
    }

    @Test
    fun create_success_fallsBackToTheNestedLinkIdWhenTopLevelIsBlank() = runTest {
        val api = FakeLinkApi(
            response = ApiResponse(
                success = true,
                data = CreateShareLinkResponse(
                    linkId = "",
                    conversationId = "conv-1",
                    shareLink = CreateShareLinkDetail(id = "sl-1", linkId = "nested-9"),
                ),
            ),
        )

        val result = ShareLinkRepository(api).create(request())

        val created = (result as NetworkResult.Success).data
        assertThat(created.linkId).isEqualTo("nested-9")
    }

    @Test
    fun create_failure_propagatesTheError() = runTest {
        val api = FakeLinkApi(response = ApiResponse(success = false, error = "forbidden"))

        val result = ShareLinkRepository(api).create(request())

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((result as NetworkResult.Failure).error.message).isEqualTo("forbidden")
    }
}
