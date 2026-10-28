package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.call.CallLinkRequest
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallLinkConfirmationViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val conversation = ApiConversation(
        id = "c1",
        type = "direct",
        participants = listOf(
            ApiParticipant(id = "p0", userId = "me"),
            ApiParticipant(id = "p1", userId = "u1", displayName = "Ada", username = "ada"),
        ),
    )

    private class Account(var id: String?)

    private fun viewModel(
        cached: ApiConversation? = conversation,
        fetched: NetworkResult<ApiConversation> = NetworkResult.Failure(ApiError(message = "404", httpStatus = 404)),
        blocks: BlockCache = BlockCache(),
        account: Account = Account("me"),
    ): CallLinkConfirmationViewModel {
        val conversations = mockk<ConversationRepository>(relaxed = true)
        coEvery { conversations.cachedById("c1") } returns cached
        coEvery { conversations.getById("c1") } returns fetched
        val sessions = mockk<SessionRepository>(relaxed = true)
        every { sessions.currentUserId } answers { account.id }
        return CallLinkConfirmationViewModel(conversations, blocks, sessions)
    }

    private val request = CallLinkRequest("c1", isVideo = true)

    private fun kotlinx.coroutines.test.TestScope.collect(vm: CallLinkConfirmationViewModel): List<CallLinkEvent> {
        val seen = mutableListOf<CallLinkEvent>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.events.collect { seen += it } }
        return seen
    }

    @Test
    fun `un lien montre sa confirmation et ne compose rien`() = runTest(dispatcher) {
        val vm = viewModel()
        val events = collect(vm)
        advanceUntilIdle()
        vm.request(request)
        advanceUntilIdle()

        assertThat(vm.pending.value?.handle).isEqualTo("@ada")
        assertThat(vm.pending.value?.isVideo).isTrue()
        assertThat(events).isEmpty()
    }

    @Test
    fun `seul le geste Appeler compose, exactement la cible montree`() = runTest(dispatcher) {
        val vm = viewModel()
        val events = collect(vm)
        vm.request(request); advanceUntilIdle()
        val shown = checkNotNull(vm.pending.value)

        vm.confirm(shown); advanceUntilIdle()

        assertThat(events).containsExactly(CallLinkEvent.Dial(shown))
        assertThat(vm.pending.value).isNull()
    }

    @Test
    fun `un second geste sur la meme feuille ne compose pas deux fois`() = runTest(dispatcher) {
        val vm = viewModel()
        val events = collect(vm)
        vm.request(request); advanceUntilIdle()
        val shown = checkNotNull(vm.pending.value)

        vm.confirm(shown); vm.confirm(shown); advanceUntilIdle()

        assertThat(events).hasSize(1)
    }

    @Test
    fun `annuler ou glisser la feuille ne compose rien`() = runTest(dispatcher) {
        val vm = viewModel()
        val events = collect(vm)
        vm.request(request); advanceUntilIdle()
        val shown = checkNotNull(vm.pending.value)

        vm.dismissed(shown); advanceUntilIdle()
        vm.confirm(shown); advanceUntilIdle()

        assertThat(vm.pending.value).isNull()
        assertThat(events).isEmpty()
    }

    @Test
    fun `un second lien remplace la feuille ouverte et l'ancienne ne compose plus`() = runTest(dispatcher) {
        val vm = viewModel()
        val events = collect(vm)
        vm.request(request); advanceUntilIdle()
        val first = checkNotNull(vm.pending.value)
        vm.request(request.copy(isVideo = false)); advanceUntilIdle()
        val second = checkNotNull(vm.pending.value)

        vm.confirm(first); advanceUntilIdle()
        assertThat(events).isEmpty()
        vm.dismissed(first)
        assertThat(vm.pending.value).isEqualTo(second)

        vm.confirm(second); advanceUntilIdle()
        assertThat(events).containsExactly(CallLinkEvent.Dial(second))
    }

    @Test
    fun `un contact bloque ou inconnu donne un refus propre`() = runTest(dispatcher) {
        val blocks = BlockCache().also { it.setBlocked("u1", true) }
        val blocked = viewModel(blocks = blocks)
        val blockedEvents = collect(blocked)
        blocked.request(request); advanceUntilIdle()
        assertThat(blockedEvents).containsExactly(CallLinkEvent.Refused(CallLinkRefusal.BLOCKED))
        assertThat(blocked.pending.value).isNull()

        val unknown = viewModel(cached = null)
        val unknownEvents = collect(unknown)
        unknown.request(request); advanceUntilIdle()
        assertThat(unknownEvents).containsExactly(CallLinkEvent.Refused(CallLinkRefusal.UNKNOWN_CONTACT))
    }

    @Test
    fun `une conversation hors cache est lue sur la passerelle`() = runTest(dispatcher) {
        val vm = viewModel(cached = null, fetched = NetworkResult.Success(conversation))
        vm.request(request); advanceUntilIdle()
        assertThat(vm.pending.value?.userId).isEqualTo("u1")
    }

    @Test
    fun `le compte qui change pendant la resolution ne montre rien`() = runTest(dispatcher) {
        val account = Account("me")
        val conversations = mockk<ConversationRepository>(relaxed = true)
        coEvery { conversations.cachedById("c1") } coAnswers { account.id = "intruder"; conversation }
        val sessions = mockk<SessionRepository>(relaxed = true)
        every { sessions.currentUserId } answers { account.id }
        val vm = CallLinkConfirmationViewModel(conversations, BlockCache(), sessions)
        val events = collect(vm)

        vm.request(request); advanceUntilIdle()

        assertThat(vm.pending.value).isNull()
        assertThat(events).isEmpty()
    }

    @Test
    fun `le compte change ou le contact est bloque entre la feuille et le geste, rien ne part`() = runTest(dispatcher) {
        val account = Account("me")
        val blocks = BlockCache()
        val vm = viewModel(blocks = blocks, account = account)
        val events = collect(vm)
        vm.request(request); advanceUntilIdle()
        val shown = checkNotNull(vm.pending.value)
        account.id = "other"

        vm.confirm(shown); advanceUntilIdle()
        assertThat(events).isEmpty()

        account.id = "me"
        vm.request(request); advanceUntilIdle()
        val again = checkNotNull(vm.pending.value)
        blocks.setBlocked("u1", true)
        vm.confirm(again); advanceUntilIdle()
        assertThat(events).isEmpty()
    }

    @Test
    fun `sans session un lien ne garde rien`() = runTest(dispatcher) {
        val vm = viewModel(account = Account(null))
        val events = collect(vm)
        vm.request(request); advanceUntilIdle()
        assertThat(vm.pending.value).isNull()
        assertThat(events).isEmpty()
    }
}
