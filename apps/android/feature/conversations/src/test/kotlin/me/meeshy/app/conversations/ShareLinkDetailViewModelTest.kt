package me.meeshy.app.conversations

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateShareLinkRequest
import me.meeshy.sdk.model.CreateShareLinkResponse
import me.meeshy.sdk.model.ExtendShareLinkRequest
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.model.MyShareLinkStats
import me.meeshy.sdk.model.ShareLinkDetailFeedback
import me.meeshy.sdk.model.ShareLinkDetailPhase
import me.meeshy.sdk.model.ToggleShareLinkRequest
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.api.LinkApi
import me.meeshy.sdk.sharelink.ShareLinkRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural spec for [ShareLinkDetailViewModel] — cold resolution of one owned link
 * out of the owner list, the optimistic activate with rollback-on-failure, the delete
 * signal, and not-found handling. Driven through the observable
 * [me.meeshy.sdk.model.ShareLinkDetailState] and a fake [LinkApi]; the VM composes the
 * real [ShareLinkRepository].
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ShareLinkDetailViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private class FakeLinkApi(
        var listResponse: ApiResponse<List<MyShareLink>> = ApiResponse(success = true, data = emptyList()),
        var toggleResponse: ApiResponse<Unit> = ApiResponse(success = true, data = Unit),
        var deleteResponse: ApiResponse<Unit> = ApiResponse(success = true, data = Unit),
    ) : LinkApi {
        var updateResponse: ApiResponse<Unit> = ApiResponse(success = true, data = Unit)
        var lastUpdate: Pair<String, kotlinx.serialization.json.JsonObject>? = null
        var lastExpand: String? = null

        override suspend fun update(
            linkId: String,
            body: kotlinx.serialization.json.JsonObject,
        ): ApiResponse<Unit> {
            lastUpdate = linkId to body
            return updateResponse
        }

        var lastToggle: Pair<String, ToggleShareLinkRequest>? = null
        var lastDeletedLinkId: String? = null

        override suspend fun create(body: CreateShareLinkRequest): ApiResponse<CreateShareLinkResponse> =
            ApiResponse(success = false)

        override suspend fun listMyLinks(offset: Int, limit: Int, expand: String?): ApiResponse<List<MyShareLink>> =
            listResponse

        override suspend fun fetchMyStats(): ApiResponse<MyShareLinkStats> =
            ApiResponse(success = true, data = MyShareLinkStats())

        override suspend fun toggle(linkId: String, body: ToggleShareLinkRequest): ApiResponse<Unit> {
            lastToggle = linkId to body
            return toggleResponse
        }

        override suspend fun delete(linkId: String): ApiResponse<Unit> {
            lastDeletedLinkId = linkId
            return deleteResponse
        }

        override suspend fun extend(linkId: String, body: ExtendShareLinkRequest): ApiResponse<Unit> =
            ApiResponse(success = true, data = Unit)
    }

    private fun link(
        linkId: String,
        isActive: Boolean = true,
        identifier: String? = null,
        name: String? = null,
        currentUses: Int = 0,
        maxUses: Int? = null,
    ) = MyShareLink(
        id = "id-$linkId",
        linkId = linkId,
        identifier = identifier,
        name = name,
        isActive = isActive,
        currentUses = currentUses,
        maxUses = maxUses,
    )

    private fun viewModel(
        api: FakeLinkApi,
        linkId: String = "link-1",
        config: MeeshyConfig = MeeshyConfig(),
        repository: ShareLinkRepository = ShareLinkRepository(api),
    ): ShareLinkDetailViewModel = ShareLinkDetailViewModel(
        repository = repository,
        config = config,
        savedStateHandle = SavedStateHandle(mapOf(ShareLinkDetailViewModel.LINK_ID_ARG to linkId)),
    )

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun onCreation_resolvesTheLinkAndBuildsPresentation() = runTest {
        val api = FakeLinkApi(
            listResponse = ApiResponse(
                success = true,
                data = listOf(link("other"), link("link-1", name = "Launch", identifier = "party", maxUses = 50, currentUses = 3)),
            ),
        )
        val vm = viewModel(api)
        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.phase).isEqualTo(ShareLinkDetailPhase.Loaded)
        assertThat(state.link?.linkId).isEqualTo("link-1")
        assertThat(state.presentation?.displayName).isEqualTo("Launch")
        assertThat(state.presentation?.joinUrl).isEqualTo("https://meeshy.me/chat/party")
        assertThat(state.presentation?.usesLabel).isEqualTo("3")
        assertThat(state.presentation?.maxUsesLabel).isEqualTo("50")
    }

    @Test
    fun onCreation_marksNotFoundWhenLinkIdAbsentFromList() = runTest {
        val api = FakeLinkApi(listResponse = ApiResponse(success = true, data = listOf(link("other"))))
        val vm = viewModel(api, linkId = "missing")
        advanceUntilIdle()

        assertThat(vm.state.value.phase).isEqualTo(ShareLinkDetailPhase.NotFound)
        assertThat(vm.state.value.link).isNull()
    }

    @Test
    fun load_failure_surfacesTheErrorPhase() = runTest {
        val api = FakeLinkApi(listResponse = ApiResponse(success = false, error = "forbidden"))
        val vm = viewModel(api)
        advanceUntilIdle()

        assertThat(vm.state.value.phase).isEqualTo(ShareLinkDetailPhase.Error)
        assertThat(vm.state.value.errorMessage).isEqualTo("forbidden")
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

        vm.toggleActive() // optimistic, before advancing

        assertThat(vm.state.value.link?.isActive).isFalse()
        assertThat(vm.state.value.presentation?.isActive).isFalse()
    }

    @Test
    fun toggleActive_sendsTheInvertedFlagAndKeepsTheOptimisticStateOnSuccess() = runTest {
        val api = FakeLinkApi(
            listResponse = ApiResponse(success = true, data = listOf(link("link-1", isActive = true))),
        )
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.toggleActive()
        advanceUntilIdle()

        assertThat(api.lastToggle).isEqualTo("link-1" to ToggleShareLinkRequest(isActive = false))
        assertThat(vm.state.value.link?.isActive).isFalse()
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

        vm.toggleActive()
        advanceUntilIdle()

        assertThat(vm.state.value.link?.isActive).isTrue() // rolled back
        assertThat(vm.state.value.errorMessage).isEqualTo("nope")
    }

    @Test
    fun toggleActive_isInertWhenNoLinkResolved() = runTest {
        val api = FakeLinkApi(listResponse = ApiResponse(success = true, data = emptyList()))
        val vm = viewModel(api, linkId = "missing")
        advanceUntilIdle()

        vm.toggleActive()
        advanceUntilIdle()

        assertThat(api.lastToggle).isNull()
        assertThat(vm.state.value.phase).isEqualTo(ShareLinkDetailPhase.NotFound)
    }

    @Test
    fun delete_success_raisesTheDeletedSignalAndCallsTheApi() = runTest {
        val api = FakeLinkApi(
            listResponse = ApiResponse(success = true, data = listOf(link("link-1"))),
        )
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.delete()
        advanceUntilIdle()

        assertThat(api.lastDeletedLinkId).isEqualTo("link-1")
        assertThat(vm.state.value.isDeleted).isTrue()
    }

    @Test
    fun delete_failure_surfacesTheErrorAndDoesNotSignalDeleted() = runTest {
        val api = FakeLinkApi(
            listResponse = ApiResponse(success = true, data = listOf(link("link-1"))),
            deleteResponse = ApiResponse(success = false, error = "boom"),
        )
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.delete()
        advanceUntilIdle()

        assertThat(vm.state.value.isDeleted).isFalse()
        assertThat(vm.state.value.errorMessage).isEqualTo("boom")
    }

    @Test
    fun delete_isInertWhenNoLinkResolved() = runTest {
        val api = FakeLinkApi(listResponse = ApiResponse(success = true, data = emptyList()))
        val vm = viewModel(api, linkId = "missing")
        advanceUntilIdle()

        vm.delete()
        advanceUntilIdle()

        assertThat(api.lastDeletedLinkId).isNull()
        assertThat(vm.state.value.isDeleted).isFalse()
    }

    @Test
    fun dismissError_clearsTheMessageAndReturnsToLoaded() = runTest {
        val api = FakeLinkApi(
            listResponse = ApiResponse(success = true, data = listOf(link("link-1"))),
            toggleResponse = ApiResponse(success = false, error = "nope"),
        )
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.toggleActive()
        advanceUntilIdle()
        vm.dismissError()

        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.phase).isEqualTo(ShareLinkDetailPhase.Loaded)
    }

    @Test
    fun opening_paintsFromTheListRowWithoutAnyNetworkCall() = runTest {
        val api = FakeLinkApi(listResponse = ApiResponse(success = false, error = "must not be called"))
        val repository = ShareLinkRepository(api)
        repository.cache.put(listOf(link("link-1", name = "Launch")))

        val vm = viewModel(api, repository = repository)

        assertThat(vm.state.value.phase).isEqualTo(ShareLinkDetailPhase.Loaded)
        assertThat(vm.state.value.draft.name).isEqualTo("Launch")
        advanceUntilIdle()
        assertThat(vm.state.value.phase).isEqualTo(ShareLinkDetailPhase.Loaded)
    }

    private fun openedForEdit(api: FakeLinkApi): Pair<ShareLinkDetailViewModel, ShareLinkRepository> {
        val repository = ShareLinkRepository(api)
        repository.cache.put(listOf(link("link-1", name = "Launch", maxUses = 5)))
        return viewModel(api, repository = repository) to repository
    }

    @Test
    fun save_sendsOnlyTheChangedFieldsAndAClearedLimitAsExplicitNull() = runTest {
        val api = FakeLinkApi()
        val (vm, _) = openedForEdit(api)

        vm.onDraftChange(vm.state.value.draft.withMaxUsesInput(""))
        vm.save()
        advanceUntilIdle()

        assertThat(api.lastUpdate?.first).isEqualTo("link-1")
        assertThat(api.lastUpdate?.second.toString()).isEqualTo("{\"maxUses\":null}")
        assertThat(vm.state.value.feedback).isEqualTo(ShareLinkDetailFeedback.Saved)
        assertThat(vm.state.value.link?.maxUses).isNull()
    }

    @Test
    fun save_appliesTheDraftOnScreenBeforeTheNetworkAnswers() = runTest {
        val api = FakeLinkApi()
        val (vm, repository) = openedForEdit(api)

        vm.onDraftChange(vm.state.value.draft.copy(name = "Renamed"))
        vm.save()

        assertThat(vm.state.value.isSaving).isTrue()
        assertThat(vm.state.value.link?.name).isEqualTo("Renamed")
        assertThat(repository.cache.find("link-1")?.name).isEqualTo("Renamed")
    }

    @Test
    fun save_failure_restoresTheLinkAndKeepsTheDraft() = runTest {
        val api = FakeLinkApi().apply { updateResponse = ApiResponse(success = false, error = "nope") }
        val (vm, repository) = openedForEdit(api)

        vm.onDraftChange(vm.state.value.draft.copy(name = "Renamed"))
        vm.save()
        advanceUntilIdle()

        assertThat(vm.state.value.link?.name).isEqualTo("Launch")
        assertThat(vm.state.value.draft.name).isEqualTo("Renamed")
        assertThat(vm.state.value.feedback).isEqualTo(ShareLinkDetailFeedback.SaveFailed)
        assertThat(repository.cache.find("link-1")?.name).isEqualTo("Launch")
        assertThat(vm.state.value.canSave).isTrue()
    }

    @Test
    fun save_withoutChangesNeverTouchesTheNetwork() = runTest {
        val api = FakeLinkApi()
        val (vm, _) = openedForEdit(api)

        vm.save()
        advanceUntilIdle()

        assertThat(api.lastUpdate).isNull()
    }

    @Test
    fun toggleActive_failure_keepsTheDraftInProgress() = runTest {
        val api = FakeLinkApi(toggleResponse = ApiResponse(success = false, error = "nope"))
        val (vm, _) = openedForEdit(api)

        vm.onDraftChange(vm.state.value.draft.copy(name = "Renamed"))
        vm.toggleActive()
        advanceUntilIdle()

        assertThat(vm.state.value.link?.isActive).isTrue()
        assertThat(vm.state.value.draft.name).isEqualTo("Renamed")
    }
}
