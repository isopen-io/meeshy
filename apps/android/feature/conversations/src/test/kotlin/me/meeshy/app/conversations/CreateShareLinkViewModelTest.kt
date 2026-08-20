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
import me.meeshy.sdk.model.CreateShareLinkDetail
import me.meeshy.sdk.model.CreateShareLinkRequest
import me.meeshy.sdk.model.CreateShareLinkResponse
import me.meeshy.sdk.model.ShareLinkExpiration
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.api.LinkApi
import me.meeshy.sdk.sharelink.ShareLinkRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.Instant

/**
 * Behavioural spec for [CreateShareLinkViewModel] — the create-link orchestration,
 * driven through the observable [CreateShareLinkUiState] and a fake [LinkApi]. The
 * VM composes the real [ShareLinkRepository] + pure `CreateShareLinkForm`; the clock
 * is injected at the edge so the built `expiresAt` stays deterministic.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CreateShareLinkViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private val now = Instant.parse("2026-07-25T12:00:00Z")

    private class FakeLinkApi(
        var response: ApiResponse<CreateShareLinkResponse> = ApiResponse(success = false),
        val requests: MutableList<CreateShareLinkRequest> = mutableListOf(),
    ) : LinkApi {
        override suspend fun create(body: CreateShareLinkRequest): ApiResponse<CreateShareLinkResponse> {
            requests += body
            return response
        }

        override suspend fun listMyLinks(
            offset: Int,
            limit: Int,
        ): ApiResponse<List<me.meeshy.sdk.model.MyShareLink>> = ApiResponse(success = true, data = emptyList())

        override suspend fun fetchMyStats(): ApiResponse<me.meeshy.sdk.model.MyShareLinkStats> =
            ApiResponse(success = true, data = me.meeshy.sdk.model.MyShareLinkStats())

        override suspend fun toggle(
            linkId: String,
            body: me.meeshy.sdk.model.ToggleShareLinkRequest,
        ): ApiResponse<Unit> = ApiResponse(success = true, data = Unit)

        override suspend fun delete(linkId: String): ApiResponse<Unit> =
            ApiResponse(success = true, data = Unit)

        override suspend fun extend(
            linkId: String,
            body: me.meeshy.sdk.model.ExtendShareLinkRequest,
        ): ApiResponse<Unit> = ApiResponse(success = true, data = Unit)
    }

    private fun okResponse() = ApiResponse(
        success = true,
        data = CreateShareLinkResponse(
            linkId = "link-1",
            conversationId = "conv-1",
            shareLink = CreateShareLinkDetail(id = "sl-1", name = "Launch", isActive = true),
        ),
    )

    private fun viewModel(
        api: FakeLinkApi,
        conversationId: String = "conv-1",
        config: MeeshyConfig = MeeshyConfig(),
    ): CreateShareLinkViewModel {
        val handle = SavedStateHandle(
            mapOf(CreateShareLinkViewModel.CONVERSATION_ID_ARG to conversationId),
        )
        return CreateShareLinkViewModel(ShareLinkRepository(api), handle, config)
            .apply { now = { this@CreateShareLinkViewModelTest.now.toEpochMilli() } }
    }

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun onCreation_seedsTheFormFromTheConversationArg() {
        val vm = viewModel(FakeLinkApi())

        val state = vm.state.value
        assertThat(state.form.conversationId).isEqualTo("conv-1")
        assertThat(state.canSubmit).isTrue()
        assertThat(state.isCreated).isFalse()
    }

    @Test
    fun edits_threadThroughTheFormAndReachTheRequestOnSubmit() = runTest {
        val api = FakeLinkApi(response = okResponse())
        val vm = viewModel(api)

        vm.onNameChange("Launch")
        vm.onSlugChange("My-Group")
        vm.onRequireEmailChange(true)
        vm.onAllowAnonymousImagesChange(false)
        vm.onExpirationChange(ShareLinkExpiration.Days7)
        vm.onMaxUsesEnabledChange(true)
        vm.onMaxUsesChange(250)
        vm.submit()
        advanceUntilIdle()

        assertThat(api.requests).hasSize(1)
        val req = api.requests.first()
        assertThat(req.name).isEqualTo("Launch")
        assertThat(req.identifier).isEqualTo("my-group")
        assertThat(req.requireEmail).isTrue()
        assertThat(req.allowAnonymousImages).isFalse()
        assertThat(req.maxUses).isEqualTo(250)
        assertThat(req.expiresAt).isEqualTo(now.plusSeconds(7 * 24 * 3600).toString())
    }

    @Test
    fun submit_success_exposesTheCreatedLink() = runTest {
        val vm = viewModel(FakeLinkApi(response = okResponse()))

        vm.submit()
        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.isSubmitting).isFalse()
        assertThat(state.isCreated).isTrue()
        assertThat(state.created?.linkId).isEqualTo("link-1")
        assertThat(state.errorMessage).isNull()
    }

    @Test
    fun beforeCreate_theCreatedJoinUrlIsNull() {
        val vm = viewModel(FakeLinkApi(response = okResponse()))

        assertThat(vm.state.value.createdJoinUrl).isNull()
    }

    @Test
    fun submit_success_derivesTheCreatedJoinUrlFromTheResolvedWebOrigin() = runTest {
        val vm = viewModel(FakeLinkApi(response = okResponse()))

        vm.submit()
        advanceUntilIdle()

        assertThat(vm.state.value.createdJoinUrl).isEqualTo("https://meeshy.me/chat/link-1")
    }

    @Test
    fun submit_success_joinUrlHonoursANonDefaultServerEnvironment() = runTest {
        val vm = viewModel(FakeLinkApi(response = okResponse()), config = MeeshyConfig.STAGING)

        vm.submit()
        advanceUntilIdle()

        assertThat(vm.state.value.createdJoinUrl).isEqualTo("https://staging.meeshy.me/chat/link-1")
    }

    @Test
    fun submit_failure_keepsEveryEditForRetryAndSurfacesTheError() = runTest {
        val api = FakeLinkApi(response = ApiResponse(success = false, error = "forbidden"))
        val vm = viewModel(api)
        vm.onNameChange("Launch")

        vm.submit()
        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.isSubmitting).isFalse()
        assertThat(state.isCreated).isFalse()
        assertThat(state.errorMessage).isEqualTo("forbidden")
        assertThat(state.form.name).isEqualTo("Launch")
    }

    @Test
    fun editingAfterAFailedSubmit_clearsThePriorError() = runTest {
        val api = FakeLinkApi(response = ApiResponse(success = false, error = "forbidden"))
        val vm = viewModel(api)
        vm.submit()
        advanceUntilIdle()

        vm.onDescriptionChange("come in")

        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun submit_isInertWhenTheConversationIsBlank() = runTest {
        val api = FakeLinkApi(response = okResponse())
        val vm = viewModel(api, conversationId = "   ")

        vm.submit()
        advanceUntilIdle()

        assertThat(api.requests).isEmpty()
        assertThat(vm.state.value.isSubmitting).isFalse()
    }

    @Test
    fun submit_isInertWhileAnEarlierSubmitIsInFlight() = runTest {
        val api = FakeLinkApi(response = okResponse())
        val vm = viewModel(api)

        vm.submit()
        vm.submit() // second call before the first coroutine runs
        advanceUntilIdle()

        assertThat(api.requests).hasSize(1)
    }
}
