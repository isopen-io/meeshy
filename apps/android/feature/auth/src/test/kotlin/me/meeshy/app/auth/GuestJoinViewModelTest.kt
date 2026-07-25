package me.meeshy.app.auth

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.AnonymousJoinRequest
import me.meeshy.sdk.model.AnonymousJoinResponse
import me.meeshy.sdk.model.AnonymousParticipant
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.JoinedConversation
import me.meeshy.sdk.model.LeaveAnonymousRequest
import me.meeshy.sdk.model.ShareLinkInfo
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.api.ShareLinkApi
import me.meeshy.sdk.session.AnonymousSessionRepository
import me.meeshy.sdk.session.InMemoryAnonymousSessionStore
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural spec for [GuestJoinViewModel] — the guest-join orchestration, driven
 * through the observable [GuestJoinUiState] and the fake API's recorded calls. The
 * VM composes the real [AnonymousSessionRepository] + pure `GuestJoinForm`; no
 * internal is inspected.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GuestJoinViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private class FakeShareLinkApi(
        var linkInfoResponse: ApiResponse<ShareLinkInfo> = ApiResponse(success = false),
        var joinResponse: ApiResponse<AnonymousJoinResponse> = ApiResponse(success = false),
        val joinCalls: MutableList<Pair<String, AnonymousJoinRequest>> = mutableListOf(),
    ) : ShareLinkApi {
        override suspend fun getLinkInfo(identifier: String) = linkInfoResponse

        override suspend fun joinAnonymously(
            linkId: String,
            body: AnonymousJoinRequest,
        ): ApiResponse<AnonymousJoinResponse> {
            joinCalls += linkId to body
            return joinResponse
        }

        override suspend fun leaveAnonymously(body: LeaveAnonymousRequest) =
            ApiResponse(success = true, data = Unit)
    }

    private fun joinResponse() = AnonymousJoinResponse(
        sessionToken = "sess-1",
        participant = AnonymousParticipant(id = "p1", canSendMessages = true),
        conversation = JoinedConversation(id = "c1"),
        linkId = "l1",
    )

    private fun viewModel(
        api: FakeShareLinkApi,
        identifier: String = "design-chat",
    ): GuestJoinViewModel {
        val repo = AnonymousSessionRepository(api, InMemoryAnonymousSessionStore(), InMemoryTokenStore())
        val handle = SavedStateHandle(mapOf(GuestJoinViewModel.IDENTIFIER_ARG to identifier))
        return GuestJoinViewModel(repo, handle).apply { usernameSuffix = { 7 } }
    }

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun onCreation_loadsPreviewAndSeedsTheForm() = runTest {
        val info = ShareLinkInfo(id = "l1", name = "Design", requireNickname = true)
        val vm = viewModel(FakeShareLinkApi(linkInfoResponse = ApiResponse(success = true, data = info)))

        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.isLoadingPreview).isFalse()
        assertThat(state.info).isEqualTo(info)
        assertThat(state.form.requireNickname).isTrue()
        assertThat(state.previewErrorMessage).isNull()
    }

    @Test
    fun previewFailure_surfacesAMessageAndLeavesNoInfo() = runTest {
        val vm = viewModel(FakeShareLinkApi(linkInfoResponse = ApiResponse(success = false, error = "not found")))

        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.isLoadingPreview).isFalse()
        assertThat(state.info).isNull()
        assertThat(state.previewErrorMessage).isEqualTo("not found")
        assertThat(state.canSubmit).isFalse()
    }

    @Test
    fun enteringBothNames_autoSuggestsAUsernameFromThem() = runTest {
        val info = ShareLinkInfo(id = "l1")
        val vm = viewModel(FakeShareLinkApi(linkInfoResponse = ApiResponse(success = true, data = info)))
        advanceUntilIdle()

        vm.onFirstNameChange("Ada")
        vm.onLastNameChange("Lovelace")

        assertThat(vm.state.value.form.username).isEqualTo("ada_lovelace007")
        assertThat(vm.state.value.canSubmit).isTrue()
    }

    @Test
    fun submit_success_joinsWithTheLinkIdAndExposesTheSession() = runTest {
        val api = FakeShareLinkApi(
            linkInfoResponse = ApiResponse(success = true, data = ShareLinkInfo(id = "raw", linkId = "l1")),
            joinResponse = ApiResponse(success = true, data = joinResponse()),
        )
        val vm = viewModel(api)
        advanceUntilIdle()
        vm.onFirstNameChange("Ada")
        vm.onLastNameChange("Lovelace")

        vm.submit()
        advanceUntilIdle()

        assertThat(api.joinCalls).hasSize(1)
        assertThat(api.joinCalls.first().first).isEqualTo("l1")
        assertThat(api.joinCalls.first().second.firstName).isEqualTo("Ada")
        val state = vm.state.value
        assertThat(state.isSubmitting).isFalse()
        assertThat(state.isJoined).isTrue()
        assertThat(state.session?.conversationId).isEqualTo("c1")
    }

    @Test
    fun submit_failure_keepsEveryEditForRetryAndSurfacesTheError() = runTest {
        val api = FakeShareLinkApi(
            linkInfoResponse = ApiResponse(success = true, data = ShareLinkInfo(id = "l1")),
            joinResponse = ApiResponse(success = false, error = "offline"),
        )
        val vm = viewModel(api)
        advanceUntilIdle()
        vm.onFirstNameChange("Ada")
        vm.onLastNameChange("Lovelace")

        vm.submit()
        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.isSubmitting).isFalse()
        assertThat(state.isJoined).isFalse()
        assertThat(state.submitErrorMessage).isEqualTo("offline")
        assertThat(state.form.firstName).isEqualTo("Ada")
        assertThat(state.form.lastName).isEqualTo("Lovelace")
    }

    @Test
    fun editingAfterAFailedSubmit_clearsThePriorError() = runTest {
        val api = FakeShareLinkApi(
            linkInfoResponse = ApiResponse(success = true, data = ShareLinkInfo(id = "l1")),
            joinResponse = ApiResponse(success = false, error = "offline"),
        )
        val vm = viewModel(api)
        advanceUntilIdle()
        vm.onFirstNameChange("Ada")
        vm.onLastNameChange("Lovelace")
        vm.submit()
        advanceUntilIdle()

        vm.onEmailChange("ada@calc.org")

        assertThat(vm.state.value.submitErrorMessage).isNull()
    }

    @Test
    fun submit_isInertWhenTheFormCannotBeBuilt() = runTest {
        val api = FakeShareLinkApi(linkInfoResponse = ApiResponse(success = true, data = ShareLinkInfo(id = "l1")))
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.submit() // names still blank
        advanceUntilIdle()

        assertThat(api.joinCalls).isEmpty()
        assertThat(vm.state.value.isSubmitting).isFalse()
    }

    @Test
    fun anAccountRequiredLink_cannotBeJoinedAnonymously() = runTest {
        val api = FakeShareLinkApi(
            linkInfoResponse = ApiResponse(success = true, data = ShareLinkInfo(id = "l1", requireAccount = true)),
        )
        val vm = viewModel(api)
        advanceUntilIdle()
        vm.onFirstNameChange("Ada")
        vm.onLastNameChange("Lovelace")

        assertThat(vm.state.value.requiresAccount).isTrue()
        assertThat(vm.state.value.canSubmit).isFalse()

        vm.submit()
        advanceUntilIdle()
        assertThat(api.joinCalls).isEmpty()
    }
}
