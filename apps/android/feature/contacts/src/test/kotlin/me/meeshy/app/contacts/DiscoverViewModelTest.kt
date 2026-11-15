package me.meeshy.app.contacts

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.feedback.FeedbackToastKind
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.ConnectionActionController
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.friend.SuggestionsRepository
import me.meeshy.sdk.model.EmailInvitationResponse
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.friend.BlockedUser
import me.meeshy.sdk.model.friend.ConnectAction
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DiscoverViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val userRepository: UserRepository = mockk(relaxed = true)
    private val friendRepository: FriendRepository = mockk(relaxed = true)
    private val suggestionsRepository: SuggestionsRepository = mockk(relaxed = true)
    private val controller: ConnectionActionController = mockk(relaxed = true)
    private val toasts: FeedbackToastCenter = FeedbackToastCenter()
    private val strings = object : DiscoverStrings {
        override fun inviteSent(email: String) = "sent to $email"
        override fun inviteFailed() = "invite failed"
        override fun smsUnavailable() = "sms unavailable"
    }

    private fun session(id: String? = "me"): SessionRepository =
        mockk<SessionRepository> { every { currentUserId } returns id }

    private fun result(id: String, username: String = id, isOnline: Boolean? = null) =
        UserSearchResult(id = id, username = username, isOnline = isOnline)

    private fun request(id: String, receiverId: String = "", senderId: String = "") =
        FriendRequest(id = id, status = "pending", senderId = senderId, receiverId = receiverId)

    private fun viewModel(
        cache: FriendshipCache = FriendshipCache(),
        blockCache: BlockCache = BlockCache(),
        session: SessionRepository = session(),
    ): DiscoverViewModel =
        DiscoverViewModel(userRepository, friendRepository, suggestionsRepository, cache, blockCache, controller, session, toasts, strings)

    @Test
    fun `a sub-threshold query clears results and never hits the network`() = runTest {
        val vm = viewModel()

        vm.onQueryChanged("a")

        assertThat(vm.state.value.rows).isEmpty()
        assertThat(vm.state.value.isLoading).isFalse()
        coVerify(exactly = 0) { userRepository.searchUsers(any(), any(), any()) }
    }

    @Test
    fun `a searchable query populates rows with a connect action for strangers`() = runTest {
        coEvery { userRepository.searchUsers("ali", any(), any()) } returns
            NetworkResult.Success(listOf(result("alice"), result("bob")))
        val vm = viewModel()

        vm.onQueryChanged("ali")

        assertThat(vm.state.value.rows.map { it.user.id }).containsExactly("alice", "bob").inOrder()
        assertThat(vm.state.value.rows.map { it.connect }).containsExactly(ConnectAction.Connect, ConnectAction.Connect)
        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.isNoResults).isFalse()
    }

    @Test
    fun `a blocked user resolves to the Blocked connect action via the shared cache`() = runTest {
        coEvery { userRepository.searchUsers("bob", any(), any()) } returns
            NetworkResult.Success(listOf(result("bob")))
        val blockCache = BlockCache().apply { hydrate(listOf(BlockedUser(id = "bob", username = "bob"))) }
        val vm = viewModel(blockCache = blockCache)

        vm.onQueryChanged("bob")

        assertThat(vm.state.value.rows.single().connect).isEqualTo(ConnectAction.Blocked)
    }

    @Test
    fun `a search returning nothing surfaces the no-results state`() = runTest {
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns NetworkResult.Success(emptyList())
        val vm = viewModel()

        vm.onQueryChanged("zzz")

        assertThat(vm.state.value.rows).isEmpty()
        assertThat(vm.state.value.isNoResults).isTrue()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun `a failed search surfaces the error and clears rows`() = runTest {
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns NetworkResult.Failure(ApiError("boom"))
        val vm = viewModel()

        vm.onQueryChanged("alice")

        assertThat(vm.state.value.rows).isEmpty()
        assertThat(vm.state.value.errorMessage).isEqualTo("boom")
        assertThat(vm.state.value.isNoResults).isFalse()
    }

    @Test
    fun `an existing friend renders as contact, an existing sent request as pending`() = runTest {
        val cache = FriendshipCache()
        cache.hydrate(
            sent = listOf(FriendRequest(id = "s1", status = "pending", receiverId = "bob")),
            received = emptyList(),
        )
        cache.didAcceptRequest("alice")
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns
            NetworkResult.Success(listOf(result("alice"), result("bob"), result("carol")))
        val vm = viewModel(cache = cache)

        vm.onQueryChanged("query")

        val byId = vm.state.value.rows.associate { it.user.id to it.connect }
        assertThat(byId["alice"]).isEqualTo(ConnectAction.Contact)
        assertThat(byId["bob"]).isEqualTo(ConnectAction.Pending)
        assertThat(byId["carol"]).isEqualTo(ConnectAction.Connect)
    }

    @Test
    fun `a cross-screen friendship change re-derives the visible rows`() = runTest {
        val cache = FriendshipCache()
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns
            NetworkResult.Success(listOf(result("alice")))
        val vm = viewModel(cache = cache)
        vm.onQueryChanged("alice")
        assertThat(vm.state.value.rows.single().connect).isEqualTo(ConnectAction.Connect)

        cache.didAcceptRequest("alice")

        assertThat(vm.state.value.rows.single().connect).isEqualTo(ConnectAction.Contact)
    }

    @Test
    fun `clearing the query after a search empties the rows`() = runTest {
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns
            NetworkResult.Success(listOf(result("alice")))
        val vm = viewModel()
        vm.onQueryChanged("alice")
        assertThat(vm.state.value.rows).isNotEmpty()

        vm.onQueryChanged("")

        assertThat(vm.state.value.rows).isEmpty()
        assertThat(vm.state.value.showEmptyPrompt).isTrue()
    }

    @Test
    fun `retry re-runs the search for the current query`() = runTest {
        coEvery { userRepository.searchUsers("alice", any(), any()) } returnsMany listOf(
            NetworkResult.Failure(ApiError("boom")),
            NetworkResult.Success(listOf(result("alice"))),
        )
        val vm = viewModel()
        vm.onQueryChanged("alice")
        assertThat(vm.state.value.errorMessage).isEqualTo("boom")

        vm.retry()

        assertThat(vm.state.value.rows.map { it.user.id }).containsExactly("alice")
        assertThat(vm.state.value.errorMessage).isNull()
        coVerify(exactly = 2) { userRepository.searchUsers("alice", any(), any()) }
    }

    @Test
    fun `retry with a sub-threshold query is inert`() = runTest {
        val vm = viewModel()
        vm.onQueryChanged("a")

        vm.retry()

        coVerify(exactly = 0) { userRepository.searchUsers(any(), any(), any()) }
    }

    @Test
    fun `dismissError clears the error message`() = runTest {
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns NetworkResult.Failure(ApiError("boom"))
        val vm = viewModel()
        vm.onQueryChanged("alice")

        vm.dismissError()

        assertThat(vm.state.value.errorMessage).isNull()
    }

    // ── Suggestions surface (empty-query, cache-first) ───────────────────────

    @Test
    fun `loadSuggestions paints the fetched suggestions with connect actions`() = runTest {
        every { suggestionsRepository.suggestionsStream(any()) } returns
            flowOf(CacheResult.Fresh(listOf(result("carol"), result("dan")), ageMillis = 0L))
        val vm = viewModel()

        vm.loadSuggestions()

        assertThat(vm.state.value.rows.map { it.user.id }).containsExactly("carol", "dan").inOrder()
        assertThat(vm.state.value.rows.map { it.connect })
            .containsExactly(ConnectAction.Connect, ConnectAction.Connect)
        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.isShowingSuggestions).isTrue()
        assertThat(vm.state.value.isSuggestionsEmpty).isFalse()
    }

    @Test
    fun `a cold suggestions cache shows the loading skeleton`() = runTest {
        every { suggestionsRepository.suggestionsStream(any()) } returns flowOf(CacheResult.Empty)
        val vm = viewModel()

        vm.loadSuggestions()

        assertThat(vm.state.value.rows).isEmpty()
        assertThat(vm.state.value.isLoading).isTrue()
        assertThat(vm.state.value.isShowingSuggestions).isTrue()
        assertThat(vm.state.value.isSuggestionsEmpty).isFalse()
    }

    @Test
    fun `a revalidated-empty suggestions list is a quiet empty state, not a spinner`() = runTest {
        every { suggestionsRepository.suggestionsStream(any()) } returns
            flowOf(CacheResult.Fresh(emptyList(), ageMillis = 0L))
        val vm = viewModel()

        vm.loadSuggestions()

        assertThat(vm.state.value.rows).isEmpty()
        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.isSuggestionsEmpty).isTrue()
        assertThat(vm.state.value.showEmptyPrompt).isFalse()
    }

    @Test
    fun `a failed suggestions revalidation surfaces the error and leaves the skeleton`() = runTest {
        every { suggestionsRepository.suggestionsStream(any()) } answers {
            val onError = firstArg<(Throwable) -> Unit>()
            flow {
                emit(CacheResult.Empty)
                onError(RuntimeException("offline"))
            }
        }
        val vm = viewModel()

        vm.loadSuggestions()

        assertThat(vm.state.value.errorMessage).isEqualTo("offline")
        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.rows).isEmpty()
    }

    @Test
    fun `a cross-screen friendship change re-derives the suggestion rows`() = runTest {
        every { suggestionsRepository.suggestionsStream(any()) } returns
            flowOf(CacheResult.Fresh(listOf(result("alice")), ageMillis = 0L))
        val cache = FriendshipCache()
        val vm = viewModel(cache = cache)
        vm.loadSuggestions()
        assertThat(vm.state.value.rows.single().connect).isEqualTo(ConnectAction.Connect)

        cache.didAcceptRequest("alice")

        assertThat(vm.state.value.rows.single().connect).isEqualTo(ConnectAction.Contact)
    }

    @Test
    fun `loadSuggestions is inert while suggestions are already streaming`() = runTest {
        every { suggestionsRepository.suggestionsStream(any()) } returns MutableSharedFlow()
        val vm = viewModel()

        vm.loadSuggestions()
        vm.loadSuggestions()

        verify(exactly = 1) { suggestionsRepository.suggestionsStream(any()) }
    }

    @Test
    fun `searching cancels the suggestions surface and switches to results`() = runTest {
        every { suggestionsRepository.suggestionsStream(any()) } returns MutableSharedFlow()
        coEvery { userRepository.searchUsers("alice", any(), any()) } returns
            NetworkResult.Success(listOf(result("alice")))
        val vm = viewModel()
        vm.loadSuggestions()
        assertThat(vm.state.value.isShowingSuggestions).isTrue()

        vm.onQueryChanged("alice")

        assertThat(vm.state.value.isShowingSuggestions).isFalse()
        assertThat(vm.state.value.rows.map { it.user.id }).containsExactly("alice")
    }

    @Test
    fun `retry after a failed cold suggestions load re-runs the stream`() = runTest {
        every { suggestionsRepository.suggestionsStream(any()) } answers {
            val onError = firstArg<(Throwable) -> Unit>()
            flow {
                emit(CacheResult.Empty)
                onError(RuntimeException("down"))
            }
        } andThenAnswer {
            flowOf(CacheResult.Fresh(listOf(result("carol")), ageMillis = 0L))
        }
        val vm = viewModel()
        vm.loadSuggestions()
        assertThat(vm.state.value.errorMessage).isEqualTo("down")

        vm.retry()

        assertThat(vm.state.value.rows.map { it.user.id }).containsExactly("carol")
        assertThat(vm.state.value.errorMessage).isNull()
        verify(exactly = 2) { suggestionsRepository.suggestionsStream(any()) }
    }

    // Port of iOS DiscoverViewModel.sendEmailInvitation — email invite card (feature-parity §J).
    @Test
    fun `sendEmailInvitation with a blank address never hits the network`() = runTest {
        val vm = viewModel()
        vm.onEmailTextChanged("   ")

        vm.sendEmailInvitation()

        coVerify(exactly = 0) { friendRepository.sendEmailInvitation(any()) }
    }

    @Test
    fun `a second sendEmailInvitation while one is in flight is a no-op`() = runTest {
        val pending = kotlinx.coroutines.CompletableDeferred<NetworkResult<EmailInvitationResponse>>()
        coEvery { friendRepository.sendEmailInvitation(any()) } coAnswers { pending.await() }
        val vm = viewModel()
        vm.onEmailTextChanged("friend@example.com")

        vm.sendEmailInvitation()
        vm.sendEmailInvitation()

        coVerify(exactly = 1) { friendRepository.sendEmailInvitation(any()) }
        pending.complete(NetworkResult.Success(mockk(relaxed = true)))
    }

    // Port of iOS DiscoverViewModel.phoneText — SMS invite card (feature-parity §J). The
    // actual send is a native SMS-composer intent (app-side, coverage-exempt glue in
    // DiscoverTab.kt), so the ViewModel's only responsibility is holding the draft.
    @Test
    fun `onPhoneTextChanged updates the phone field`() = runTest {
        val vm = viewModel()

        vm.onPhoneTextChanged("+1 555 0100")

        assertThat(vm.state.value.phoneText).isEqualTo("+1 555 0100")
    }

    @Test
    fun `connect delegates to the shared coordinator`() = runTest {
        val vm = viewModel()

        vm.connect("alice")
        vm.acceptReceived("bob")

        verify(exactly = 1) { controller.send("alice") }
        verify(exactly = 1) { controller.accept("bob") }
    }

    @Test
    fun `a sent email invitation toasts the address, clears the field and signals success`() = runTest {
        coEvery { friendRepository.sendEmailInvitation("friend@example.com") } returns
            NetworkResult.Success(mockk(relaxed = true))
        val vm = viewModel()
        vm.onEmailTextChanged("  friend@example.com  ")
        val effects = mutableListOf<DiscoverEffect>()
        val job = launch(dispatcher) { vm.effects.toList(effects) }

        vm.sendEmailInvitation()

        coVerify(exactly = 1) { friendRepository.sendEmailInvitation("friend@example.com") }
        assertThat(vm.state.value.emailText).isEmpty()
        assertThat(toasts.current.value?.message).isEqualTo("sent to friend@example.com")
        assertThat(toasts.current.value?.kind).isEqualTo(FeedbackToastKind.SUCCESS)
        assertThat(effects).containsExactly(DiscoverEffect.Success)
        job.cancel()
    }

    @Test
    fun `a failed email invitation toasts an error, keeps the address and signals failure`() = runTest {
        coEvery { friendRepository.sendEmailInvitation("friend@example.com") } returns
            NetworkResult.Failure(ApiError("offline"))
        val vm = viewModel()
        vm.onEmailTextChanged("friend@example.com")
        val effects = mutableListOf<DiscoverEffect>()
        val job = launch(dispatcher) { vm.effects.toList(effects) }

        vm.sendEmailInvitation()

        assertThat(toasts.current.value?.message).isEqualTo("invite failed")
        assertThat(toasts.current.value?.kind).isEqualTo(FeedbackToastKind.ERROR)
        assertThat(vm.state.value.isSendingInvite).isFalse()
        assertThat(vm.state.value.emailText).isEqualTo("friend@example.com")
        assertThat(effects).containsExactly(DiscoverEffect.Failure)
        job.cancel()
    }

    @Test
    fun `an unavailable SMS app toasts an error`() = runTest {
        val vm = viewModel()

        vm.onSmsUnavailable()

        assertThat(toasts.current.value?.message).isEqualTo("sms unavailable")
        assertThat(toasts.current.value?.kind).isEqualTo(FeedbackToastKind.ERROR)
    }

    @Test
    fun `refresh revalidates the suggestions and clears the refreshing flag`() = runTest {
        val vm = viewModel()

        vm.refresh()

        coVerify(exactly = 1) { suggestionsRepository.refresh() }
        assertThat(vm.state.value.isRefreshing).isFalse()
    }

    @Test
    fun `refresh does nothing while a query is typed`() = runTest {
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.onQueryChanged("ali")

        vm.refresh()

        coVerify(exactly = 0) { suggestionsRepository.refresh() }
    }

    @Test
    fun `a failing refresh surfaces the error and stops refreshing`() = runTest {
        coEvery { suggestionsRepository.refresh() } throws RuntimeException("down")
        val vm = viewModel()

        vm.refresh()

        assertThat(vm.state.value.errorMessage).isEqualTo("down")
        assertThat(vm.state.value.isRefreshing).isFalse()
    }
}
