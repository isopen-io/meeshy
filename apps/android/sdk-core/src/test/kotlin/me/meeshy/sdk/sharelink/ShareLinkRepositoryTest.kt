package me.meeshy.sdk.sharelink

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateShareLinkDetail
import me.meeshy.sdk.model.CreateShareLinkRequest
import me.meeshy.sdk.model.CreateShareLinkResponse
import me.meeshy.sdk.model.ExtendShareLinkRequest
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.model.MyShareLinkStats
import me.meeshy.sdk.model.ToggleShareLinkRequest
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
        var listResponse: ApiResponse<List<MyShareLink>> = ApiResponse(success = false),
        var statsResponse: ApiResponse<MyShareLinkStats> = ApiResponse(success = false),
        var toggleResponse: ApiResponse<Unit> = ApiResponse(success = false),
        var deleteResponse: ApiResponse<Unit> = ApiResponse(success = false),
        var extendResponse: ApiResponse<Unit> = ApiResponse(success = false),
    ) : LinkApi {
        var lastListOffset: Int? = null
        var lastListLimit: Int? = null
        var lastToggle: Pair<String, ToggleShareLinkRequest>? = null
        var lastDeletedLinkId: String? = null
        var lastExtend: Pair<String, ExtendShareLinkRequest>? = null

        override suspend fun create(body: CreateShareLinkRequest): ApiResponse<CreateShareLinkResponse> {
            requests += body
            return response
        }

        override suspend fun listMyLinks(offset: Int, limit: Int): ApiResponse<List<MyShareLink>> {
            lastListOffset = offset
            lastListLimit = limit
            return listResponse
        }

        override suspend fun fetchMyStats(): ApiResponse<MyShareLinkStats> = statsResponse

        override suspend fun toggle(
            linkId: String,
            body: ToggleShareLinkRequest,
        ): ApiResponse<Unit> {
            lastToggle = linkId to body
            return toggleResponse
        }

        override suspend fun delete(linkId: String): ApiResponse<Unit> {
            lastDeletedLinkId = linkId
            return deleteResponse
        }

        override suspend fun extend(
            linkId: String,
            body: ExtendShareLinkRequest,
        ): ApiResponse<Unit> {
            lastExtend = linkId to body
            return extendResponse
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

    @Test
    fun listMyLinks_success_returnsTheLinksAndForwardsPaging() = runTest {
        val api = FakeLinkApi(
            listResponse = ApiResponse(
                success = true,
                data = listOf(MyShareLink(id = "sl-1", linkId = "link-1", name = "Launch")),
            ),
        )

        val result = ShareLinkRepository(api).listMyLinks(offset = 20, limit = 10)

        assertThat(api.lastListOffset).isEqualTo(20)
        assertThat(api.lastListLimit).isEqualTo(10)
        val links = (result as NetworkResult.Success).data
        assertThat(links.map { it.linkId }).containsExactly("link-1")
    }

    @Test
    fun listMyLinks_defaultsToTheFirstPage() = runTest {
        val api = FakeLinkApi(listResponse = ApiResponse(success = true, data = emptyList()))

        ShareLinkRepository(api).listMyLinks()

        assertThat(api.lastListOffset).isEqualTo(0)
        assertThat(api.lastListLimit).isEqualTo(50)
    }

    @Test
    fun fetchMyStats_success_returnsTheAggregate() = runTest {
        val api = FakeLinkApi(
            statsResponse = ApiResponse(
                success = true,
                data = MyShareLinkStats(totalLinks = 3, activeLinks = 2, totalUses = 12),
            ),
        )

        val result = ShareLinkRepository(api).fetchMyStats()

        assertThat((result as NetworkResult.Success).data.totalUses).isEqualTo(12)
    }

    @Test
    fun setActive_forwardsTheLinkIdAndFlagInTheBody() = runTest {
        val api = FakeLinkApi(toggleResponse = ApiResponse(success = true, data = Unit))

        val result = ShareLinkRepository(api).setActive("link-7", isActive = false)

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(api.lastToggle).isEqualTo("link-7" to ToggleShareLinkRequest(isActive = false))
    }

    @Test
    fun delete_forwardsTheLinkId() = runTest {
        val api = FakeLinkApi(deleteResponse = ApiResponse(success = true, data = Unit))

        val result = ShareLinkRepository(api).delete("link-7")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(api.lastDeletedLinkId).isEqualTo("link-7")
    }

    @Test
    fun delete_failure_propagatesTheError() = runTest {
        val api = FakeLinkApi(deleteResponse = ApiResponse(success = false, error = "nope"))

        val result = ShareLinkRepository(api).delete("link-7")

        assertThat((result as NetworkResult.Failure).error.message).isEqualTo("nope")
    }

    @Test
    fun extend_forwardsTheLinkIdAndExpiryInTheBody() = runTest {
        val api = FakeLinkApi(extendResponse = ApiResponse(success = true, data = Unit))

        val result = ShareLinkRepository(api).extend("link-7", "2026-10-23T12:00:00Z")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(api.lastExtend)
            .isEqualTo("link-7" to ExtendShareLinkRequest("2026-10-23T12:00:00Z"))
    }

    @Test
    fun extend_failure_propagatesTheError() = runTest {
        val api = FakeLinkApi(extendResponse = ApiResponse(success = false, error = "expired"))

        val result = ShareLinkRepository(api).extend("link-7", "2026-10-23T12:00:00Z")

        assertThat((result as NetworkResult.Failure).error.message).isEqualTo("expired")
    }
}
