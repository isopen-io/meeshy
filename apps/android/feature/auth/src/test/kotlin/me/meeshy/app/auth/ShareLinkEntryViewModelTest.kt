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
import me.meeshy.sdk.model.AnonymousSessionContext
import me.meeshy.sdk.model.ParticipantPermissions
import me.meeshy.sdk.model.ShareLinkConversation
import me.meeshy.sdk.model.ShareLinkInfo
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.InMemoryAnonymousSessionStore
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural spec for [ShareLinkEntryViewModel] — the app-side brain of the
 * guest-join deep-link route. Driven through the observable [ShareLinkEntryUiState]
 * with a REAL [ShareLinkEntryResolver] (over faked leaf seams: preview, guest-session
 * store, join, auth, known-ids), so the whole resolve → policy → navigation reduction
 * is exercised end to end; no internal is inspected.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ShareLinkEntryViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private class FakePreview(
        var result: NetworkResult<ShareLinkInfo>,
        val identifiers: MutableList<String> = mutableListOf(),
    ) : ShareLinkPreviewProviding {
        override suspend fun preview(identifier: String): NetworkResult<ShareLinkInfo> {
            identifiers += identifier
            return result
        }
    }

    private class FakeJoin(
        var result: NetworkResult<String>,
        val linkIds: MutableList<String> = mutableListOf(),
    ) : AuthenticatedShareLinkJoining {
        override suspend fun join(linkId: String): NetworkResult<String> {
            linkIds += linkId
            return result
        }
    }

    private class FakeKnownIds(
        var ids: Set<String> = emptySet(),
        var callCount: Int = 0,
    ) : KnownConversationIdsProviding {
        override suspend fun current(): Set<String> {
            callCount += 1
            return ids
        }
    }

    private fun info(
        conversationId: String? = "conv-1",
        title: String? = "Design",
        requireAccount: Boolean = false,
    ) = ShareLinkInfo(
        id = "link-raw",
        linkId = "design-chat",
        requireAccount = requireAccount,
        conversation = conversationId?.let { ShareLinkConversation(id = it, title = title) },
    )

    private fun storedSession(
        linkId: String,
        conversationId: String = "conv-stored",
    ) = AnonymousSessionContext(
        sessionToken = "sess-1",
        participantId = "p1",
        permissions = ParticipantPermissions.anonymous(
            canSendMessages = true,
            canSendFiles = false,
            canSendImages = false,
        ),
        linkId = linkId,
        conversationId = conversationId,
    )

    private class Fixture(
        val preview: FakePreview,
        val join: FakeJoin,
        val knownIds: FakeKnownIds,
        val store: InMemoryAnonymousSessionStore,
        val vm: ShareLinkEntryViewModel,
    )

    private fun fixture(
        previewResult: NetworkResult<ShareLinkInfo> = NetworkResult.Success(info()),
        joinResult: NetworkResult<String> = NetworkResult.Success("conv-joined"),
        isAuthenticated: Boolean = false,
        knownIds: Set<String> = emptySet(),
        stored: AnonymousSessionContext? = null,
        identifier: String = "design-chat",
    ): Fixture {
        val preview = FakePreview(previewResult)
        val join = FakeJoin(joinResult)
        val known = FakeKnownIds(knownIds)
        val store = InMemoryAnonymousSessionStore(stored)
        val resolver = ShareLinkEntryResolver(preview, store)
        val handle = SavedStateHandle(mapOf(GuestJoinViewModel.IDENTIFIER_ARG to identifier))
        val vm = ShareLinkEntryViewModel(
            resolver = resolver,
            join = join,
            authState = { isAuthenticated },
            knownConversationIds = known,
            sessionStore = store,
            savedStateHandle = handle,
        )
        return Fixture(preview, join, known, store, vm)
    }

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun guest_openLink_showsTheAnonymousForm() = runTest {
        val f = fixture(isAuthenticated = false)

        advanceUntilIdle()

        assertThat(f.vm.state.value).isEqualTo(ShareLinkEntryUiState.GuestForm)
    }

    @Test
    fun guest_neverConsultsTheAccountConversationList() = runTest {
        val f = fixture(isAuthenticated = false)

        advanceUntilIdle()

        assertThat(f.knownIds.callCount).isEqualTo(0)
    }

    @Test
    fun guest_linkRequiringAnAccount_steersToSignIn() = runTest {
        val f = fixture(
            previewResult = NetworkResult.Success(info(requireAccount = true)),
            isAuthenticated = false,
        )

        advanceUntilIdle()

        assertThat(f.vm.state.value).isEqualTo(ShareLinkEntryUiState.RequiresAccount)
    }

    @Test
    fun guest_withAStoredSessionForThisLink_resumesIntoItsConversation() = runTest {
        val f = fixture(
            isAuthenticated = false,
            stored = storedSession(linkId = "design-chat", conversationId = "conv-stored"),
        )

        advanceUntilIdle()

        assertThat(f.vm.state.value)
            .isEqualTo(ShareLinkEntryUiState.OpenConversation("conv-stored"))
    }

    @Test
    fun guest_previewFailure_fallsBackToTheAnonymousForm() = runTest {
        val f = fixture(
            previewResult = NetworkResult.Failure(ApiError(message = "offline")),
            isAuthenticated = false,
        )

        advanceUntilIdle()

        assertThat(f.vm.state.value).isEqualTo(ShareLinkEntryUiState.GuestForm)
    }

    @Test
    fun account_memberOfTheTargetConversation_opensItStraightAway() = runTest {
        val f = fixture(
            isAuthenticated = true,
            knownIds = setOf("conv-1"),
        )

        advanceUntilIdle()

        assertThat(f.vm.state.value)
            .isEqualTo(ShareLinkEntryUiState.OpenConversation("conv-1"))
        assertThat(f.join.linkIds).isEmpty()
    }

    @Test
    fun account_nonMemberOnAnOpenLink_asksWhichIdentity() = runTest {
        val f = fixture(
            isAuthenticated = true,
            knownIds = emptySet(),
        )

        advanceUntilIdle()

        assertThat(f.vm.state.value).isEqualTo(
            ShareLinkEntryUiState.ChooseIdentity(
                conversationId = "conv-1",
                conversationTitle = "Design",
                resumesGuestSession = false,
            ),
        )
    }

    @Test
    fun account_chooseIdentity_flagsAResumableGuestSessionForThisLink() = runTest {
        val f = fixture(
            isAuthenticated = true,
            knownIds = emptySet(),
            stored = storedSession(linkId = "design-chat"),
        )

        advanceUntilIdle()

        val state = f.vm.state.value
        assertThat(state).isInstanceOf(ShareLinkEntryUiState.ChooseIdentity::class.java)
        assertThat((state as ShareLinkEntryUiState.ChooseIdentity).resumesGuestSession).isTrue()
    }

    @Test
    fun account_nonMemberOnAnAccountLink_joinsSilentlyAndOpensTheConversation() = runTest {
        val f = fixture(
            previewResult = NetworkResult.Success(info(requireAccount = true)),
            joinResult = NetworkResult.Success("conv-joined"),
            isAuthenticated = true,
            knownIds = emptySet(),
        )

        advanceUntilIdle()

        assertThat(f.join.linkIds).containsExactly("design-chat")
        assertThat(f.vm.state.value)
            .isEqualTo(ShareLinkEntryUiState.OpenConversation("conv-joined"))
    }

    @Test
    fun account_joinFailure_surfacesTheError() = runTest {
        val f = fixture(
            previewResult = NetworkResult.Success(info(requireAccount = true)),
            joinResult = NetworkResult.Failure(ApiError(message = "link expired")),
            isAuthenticated = true,
        )

        advanceUntilIdle()

        assertThat(f.vm.state.value).isEqualTo(ShareLinkEntryUiState.Failed("link expired"))
    }

    @Test
    fun account_unresolvableLink_fallsBackToAnAuthenticatedJoin() = runTest {
        val f = fixture(
            previewResult = NetworkResult.Failure(ApiError(message = "offline")),
            joinResult = NetworkResult.Success("conv-joined"),
            isAuthenticated = true,
        )

        advanceUntilIdle()

        assertThat(f.join.linkIds).containsExactly("design-chat")
        assertThat(f.vm.state.value)
            .isEqualTo(ShareLinkEntryUiState.OpenConversation("conv-joined"))
    }

    @Test
    fun account_unresolvableLinkAndJoinFailure_surfacesTheError() = runTest {
        val f = fixture(
            previewResult = NetworkResult.Failure(ApiError(message = "offline")),
            joinResult = NetworkResult.Failure(ApiError(message = "still offline")),
            isAuthenticated = true,
        )

        advanceUntilIdle()

        assertThat(f.vm.state.value).isEqualTo(ShareLinkEntryUiState.Failed("still offline"))
    }

    @Test
    fun resume_withABlankStoredConversationId_degradesToTheAnonymousForm() = runTest {
        val f = fixture(
            isAuthenticated = false,
            stored = storedSession(linkId = "design-chat", conversationId = "   "),
        )

        advanceUntilIdle()

        assertThat(f.vm.state.value).isEqualTo(ShareLinkEntryUiState.GuestForm)
    }

    @Test
    fun retry_afterAFailedJoin_reResolvesAndSucceeds() = runTest {
        val f = fixture(
            previewResult = NetworkResult.Success(info(requireAccount = true)),
            joinResult = NetworkResult.Failure(ApiError(message = "flaky")),
            isAuthenticated = true,
        )
        advanceUntilIdle()
        assertThat(f.vm.state.value).isInstanceOf(ShareLinkEntryUiState.Failed::class.java)

        f.join.result = NetworkResult.Success("conv-joined")
        f.vm.resolve()
        advanceUntilIdle()

        assertThat(f.vm.state.value)
            .isEqualTo(ShareLinkEntryUiState.OpenConversation("conv-joined"))
    }

    @Test
    fun chooseAccount_fromTheIdentityPrompt_joinsAndOpensTheConversation() = runTest {
        val f = fixture(isAuthenticated = true, knownIds = emptySet())
        advanceUntilIdle()
        assertThat(f.vm.state.value).isInstanceOf(ShareLinkEntryUiState.ChooseIdentity::class.java)

        f.vm.chooseAccount()
        advanceUntilIdle()

        assertThat(f.join.linkIds).containsExactly("design-chat")
        assertThat(f.vm.state.value)
            .isEqualTo(ShareLinkEntryUiState.OpenConversation("conv-joined"))
    }

    @Test
    fun chooseAccount_whenTheJoinFails_surfacesTheError() = runTest {
        val f = fixture(
            joinResult = NetworkResult.Failure(ApiError(message = "denied")),
            isAuthenticated = true,
            knownIds = emptySet(),
        )
        advanceUntilIdle()

        f.vm.chooseAccount()
        advanceUntilIdle()

        assertThat(f.vm.state.value).isEqualTo(ShareLinkEntryUiState.Failed("denied"))
    }

    @Test
    fun chooseAnonymous_withAStoredSession_resumesIntoItsConversation() = runTest {
        val f = fixture(
            isAuthenticated = true,
            knownIds = emptySet(),
            stored = storedSession(linkId = "design-chat", conversationId = "conv-stored"),
        )
        advanceUntilIdle()

        f.vm.chooseAnonymous()
        advanceUntilIdle()

        assertThat(f.vm.state.value)
            .isEqualTo(ShareLinkEntryUiState.OpenConversation("conv-stored"))
    }

    @Test
    fun chooseAnonymous_withNoStoredSession_opensTheJoinForm() = runTest {
        val f = fixture(isAuthenticated = true, knownIds = emptySet())
        advanceUntilIdle()

        f.vm.chooseAnonymous()
        advanceUntilIdle()

        assertThat(f.vm.state.value).isEqualTo(ShareLinkEntryUiState.GuestForm)
    }

    @Test
    fun initialState_isResolving_beforeAnyWorkCompletes() = runTest {
        val f = fixture(isAuthenticated = false)

        // No advanceUntilIdle: the launched resolution has not run yet.
        assertThat(f.vm.state.value).isEqualTo(ShareLinkEntryUiState.Resolving)
    }
}
