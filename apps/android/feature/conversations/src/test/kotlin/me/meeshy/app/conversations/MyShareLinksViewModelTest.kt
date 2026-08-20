package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import java.time.Instant
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateShareLinkRequest
import me.meeshy.sdk.model.CreateShareLinkResponse
import me.meeshy.sdk.model.ExtendShareLinkRequest
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.model.MyShareLinkStats
import me.meeshy.sdk.model.MyShareLinksPhase
import me.meeshy.sdk.model.ShareLinkExpiration
import me.meeshy.sdk.model.ToggleShareLinkRequest
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.api.LinkApi
import me.meeshy.sdk.sharelink.ShareLinkRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural spec for [MyShareLinksViewModel] — cold load of list + stats, the
 * optimistic activate/delete with rollback-on-failure, and the web-origin-derived
 * join URL. Driven through the observable [me.meeshy.sdk.model.MyShareLinksState]
 * and a fake [LinkApi]; the VM composes the real [ShareLinkRepository].
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MyShareLinksViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private class FakeLinkApi(
        var listResponse: ApiResponse<List<MyShareLink>> = ApiResponse(success = true, data = emptyList()),
        var statsResponse: ApiResponse<MyShareLinkStats> =
            ApiResponse(success = true, data = MyShareLinkStats()),
        var toggleResponse: ApiResponse<Unit> = ApiResponse(success = true, data = Unit),
        var deleteResponse: ApiResponse<Unit> = ApiResponse(success = true, data = Unit),
        var extendResponse: ApiResponse<Unit> = ApiResponse(success = true, data = Unit),
    ) : LinkApi {
        var lastToggle: Pair<String, ToggleShareLinkRequest>? = null
        var lastDeletedLinkId: String? = null
        var lastExtend: Pair<String, ExtendShareLinkRequest>? = null

        override suspend fun create(body: CreateShareLinkRequest): ApiResponse<CreateShareLinkResponse> =
            ApiResponse(success = false)

        override suspend fun listMyLinks(offset: Int, limit: Int): ApiResponse<List<MyShareLink>> =
            listResponse

        override suspend fun fetchMyStats(): ApiResponse<MyShareLinkStats> = statsResponse

        override suspend fun toggle(linkId: String, body: ToggleShareLinkRequest): ApiResponse<Unit> {
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

    private fun link(
        linkId: String,
        isActive: Boolean = true,
        identifier: String? = null,
        expiresAt: String? = null,
    ) = MyShareLink(
        id = linkId,
        linkId = linkId,
        identifier = identifier,
        isActive = isActive,
        expiresAt = expiresAt,
    )

    private fun viewModel(
        api: FakeLinkApi,
        config: MeeshyConfig = MeeshyConfig(),
    ): MyShareLinksViewModel = MyShareLinksViewModel(ShareLinkRepository(api), config)

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun onCreation_loadsLinksAndStats() = runTest {
        val api = FakeLinkApi(
            listResponse = ApiResponse(success = true, data = listOf(link("link-1"))),
            statsResponse = ApiResponse(
                success = true,
                data = MyShareLinkStats(totalLinks = 1, activeLinks = 1, totalUses = 4),
            ),
        )
        val vm = viewModel(api)
        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.phase).isEqualTo(MyShareLinksPhase.Loaded)
        assertThat(state.links.map { it.linkId }).containsExactly("link-1")
        assertThat(state.stats?.totalUses).isEqualTo(4)
    }

    @Test
    fun load_failure_surfacesTheErrorPhase() = runTest {
        val api = FakeLinkApi(listResponse = ApiResponse(success = false, error = "forbidden"))
        val vm = viewModel(api)
        advanceUntilIdle()

        assertThat(vm.state.value.phase).isEqualTo(MyShareLinksPhase.Error)
        assertThat(vm.state.value.errorMessage).isEqualTo("forbidden")
    }

    @Test
    fun joinUrlFor_usesTheResolvedWebOrigin() = runTest {
        val vm = viewModel(FakeLinkApi())
        advanceUntilIdle()

        assertThat(vm.webOrigin).isEqualTo("https://meeshy.me")
        assertThat(vm.joinUrlFor(link("link-1", identifier = "party")))
            .isEqualTo("https://meeshy.me/chat/party")
    }

    @Test
    fun webOrigin_resolvesTheStagingHost() = runTest {
        val vm = viewModel(FakeLinkApi(), config = MeeshyConfig.STAGING)
        advanceUntilIdle()

        assertThat(vm.webOrigin).isEqualTo("https://staging.meeshy.me")
    }

    @Test
    fun toggleActive_optimisticallyFlipsBeforeTheNetworkResolves() = runTest {
        val api = FakeLinkApi(
            listResponse = ApiResponse(success = true, data = listOf(link("link-1", isActive = true))),
        )
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.toggleActive(vm.state.value.links.first()) // optimistic, before advancing

        assertThat(vm.state.value.links.first().isActive).isFalse()
    }

    @Test
    fun toggleActive_sendsTheInvertedFlagAndKeepsTheOptimisticStateOnSuccess() = runTest {
        val api = FakeLinkApi(
            listResponse = ApiResponse(success = true, data = listOf(link("link-1", isActive = true))),
        )
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.toggleActive(vm.state.value.links.first())
        advanceUntilIdle()

        assertThat(api.lastToggle).isEqualTo("link-1" to ToggleShareLinkRequest(isActive = false))
        assertThat(vm.state.value.links.first().isActive).isFalse()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun toggleActive_failure_rollsBackAndSurfacesTheError() = runTest {
        val api = FakeLinkApi(
            listResponse = ApiResponse(success = true, data = listOf(link("link-1", isActive = true))),
            toggleResponse = ApiResponse(success = false, error = "nope"),
        )
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.toggleActive(vm.state.value.links.first())
        advanceUntilIdle()

        assertThat(vm.state.value.links.first().isActive).isTrue() // rolled back
        assertThat(vm.state.value.errorMessage).isEqualTo("nope")
    }

    @Test
    fun delete_optimisticallyRemovesAndCallsTheApi() = runTest {
        val api = FakeLinkApi(
            listResponse = ApiResponse(
                success = true,
                data = listOf(link("link-1"), link("link-2")),
            ),
        )
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.delete(vm.state.value.links.first { it.linkId == "link-1" })
        advanceUntilIdle()

        assertThat(vm.state.value.links.map { it.linkId }).containsExactly("link-2")
        assertThat(api.lastDeletedLinkId).isEqualTo("link-1")
    }

    @Test
    fun delete_failure_restoresTheLinkAndSurfacesTheError() = runTest {
        val api = FakeLinkApi(
            listResponse = ApiResponse(success = true, data = listOf(link("link-1"), link("link-2"))),
            deleteResponse = ApiResponse(success = false, error = "boom"),
        )
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.delete(vm.state.value.links.first { it.linkId == "link-1" })
        advanceUntilIdle()

        assertThat(vm.state.value.links.map { it.linkId }).containsExactly("link-1", "link-2")
        assertThat(vm.state.value.errorMessage).isEqualTo("boom")
    }

    @Test
    fun extendExpiry_optimisticallySetsTheNewExpiryAndSendsTheRequest() = runTest {
        val fixedNow = Instant.parse("2026-07-25T12:00:00Z").toEpochMilli()
        val expected = ShareLinkExpiration.Days30.expiresAtIso(fixedNow)!!
        val api = FakeLinkApi(
            listResponse = ApiResponse(
                success = true,
                data = listOf(link("link-1", expiresAt = "2026-07-26T12:00:00Z")),
            ),
        )
        val vm = viewModel(api).apply { now = { fixedNow } }
        advanceUntilIdle()

        vm.extendExpiry(vm.state.value.links.first(), ShareLinkExpiration.Days30) // optimistic

        assertThat(vm.state.value.links.first().expiresAt).isEqualTo(expected)

        advanceUntilIdle()

        assertThat(api.lastExtend).isEqualTo("link-1" to ExtendShareLinkRequest(expected))
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun extendExpiry_failure_rollsBackAndSurfacesTheError() = runTest {
        val fixedNow = Instant.parse("2026-07-25T12:00:00Z").toEpochMilli()
        val api = FakeLinkApi(
            listResponse = ApiResponse(
                success = true,
                data = listOf(link("link-1", expiresAt = "2026-07-26T12:00:00Z")),
            ),
            extendResponse = ApiResponse(success = false, error = "already expired"),
        )
        val vm = viewModel(api).apply { now = { fixedNow } }
        advanceUntilIdle()

        vm.extendExpiry(vm.state.value.links.first(), ShareLinkExpiration.Days7)
        advanceUntilIdle()

        assertThat(vm.state.value.links.first().expiresAt).isEqualTo("2026-07-26T12:00:00Z")
        assertThat(vm.state.value.errorMessage).isEqualTo("already expired")
    }

    @Test
    fun extendExpiry_neverHorizon_isInertAndNeverTouchesTheNetwork() = runTest {
        val api = FakeLinkApi(
            listResponse = ApiResponse(
                success = true,
                data = listOf(link("link-1", expiresAt = "2026-07-26T12:00:00Z")),
            ),
        )
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.extendExpiry(vm.state.value.links.first(), ShareLinkExpiration.Never)
        advanceUntilIdle()

        assertThat(api.lastExtend).isNull()
        assertThat(vm.state.value.links.first().expiresAt).isEqualTo("2026-07-26T12:00:00Z")
    }

    @Test
    fun dismissError_clearsTheMessageAndReturnsToLoaded() = runTest {
        val api = FakeLinkApi(listResponse = ApiResponse(success = false, error = "forbidden"))
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.dismissError()

        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.phase).isEqualTo(MyShareLinksPhase.Loaded)
    }
}
