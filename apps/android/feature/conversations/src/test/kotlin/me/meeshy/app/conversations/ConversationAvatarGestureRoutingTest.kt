package me.meeshy.app.conversations

import me.meeshy.sdk.model.lock.LockPinMode
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import me.meeshy.sdk.model.ApiParticipant
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.chat.InMemoryStarredMessagesStore
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lock.ConversationUnlockSessionStore
import me.meeshy.sdk.lock.InMemoryConversationLockStore
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.CategoryEvent
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CategorySocketManager
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #15887 / #15989 — toucher l'avatar d'une ligne ouvre le profil du pair d'une directe, les détails de
 * toute autre conversation, et — verrouillée — la porte du code PUIS les détails. Jamais le fil.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ConversationAvatarGestureRoutingTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val workManager: WorkManager = mockk(relaxed = true)

    private fun direct(id: String, peer: ApiParticipant) = ApiConversation(
        id = id,
        type = "direct",
        participants = listOf(ApiParticipant(id = "p-me-$id", userId = "me"), peer),
    )

    private val rows = listOf(
        direct("dm", ApiParticipant(id = "p-ann", userId = "ann")),
        direct("dm-closed", ApiParticipant(id = "p-bob", userId = "bob", accountClosed = true)),
        direct("dm-blocked", ApiParticipant(id = "p-eve", userId = "eve")),
        ApiConversation(id = "grp", type = "group"),
        ApiConversation(id = "pub", type = "public"),
        ApiConversation(id = "glo", type = "global"),
    )

    private fun viewModel(
        lockStore: InMemoryConversationLockStore = InMemoryConversationLockStore(),
        conversations: List<ApiConversation> = rows,
        blocked: Set<String> = emptySet(),
    ) = ConversationListViewModel(
        repository = mockk<ConversationRepository>(relaxed = true).also {
            every { it.conversationsStream(any(), any()) } returns flowOf(CacheResult.Fresh(conversations, ageMillis = 0))
        },
        messageRepository = mockk<MessageRepository>(relaxed = true),
        messageSocketManager = mockk<MessageSocketManager> {
            every { unreadUpdated } returns MutableSharedFlow()
            every { messageReceived } returns MutableSharedFlow()
            every { messageEdited } returns MutableSharedFlow()
            every { messageDeleted } returns MutableSharedFlow()
            every { conversationUpdated } returns MutableSharedFlow()
            every { conversationDeleted } returns MutableSharedFlow()
            every { conversationRestored } returns MutableSharedFlow()
            every { conversationClosed } returns MutableSharedFlow()
            every { conversationObsoleted } returns MutableSharedFlow()
            every { participantLeft } returns MutableSharedFlow()
            every { participantBanned } returns MutableSharedFlow()
            every { participantJoined } returns MutableSharedFlow()
            every { participantUnbanned } returns MutableSharedFlow()
            every { userStatus } returns MutableSharedFlow()
            every { presenceSnapshot } returns MutableSharedFlow()
            every { typingStarted } returns MutableSharedFlow()
            every { typingStopped } returns MutableSharedFlow()
        },
        workManager = workManager,
        draftStore = InMemoryConversationDraftStore(),
        starredStore = InMemoryStarredMessagesStore(),
        categoryRepository = mockk<CategoryRepository> {
            every { categoriesStream(any(), any()) } returns flowOf(emptyList())
        },
        categorySocketManager = mockk<CategorySocketManager> {
            every { categoryEvents } returns MutableSharedFlow<CategoryEvent>()
        },
        preferencesSocketManager = mockk<me.meeshy.sdk.socket.PreferencesSocketManager> {
            every { conversationPreferencesUpdated } returns
                MutableSharedFlow<me.meeshy.sdk.model.UserPreferencesConversationUpdatedSocketData>()
        },
        socketManager = mockk<SocketManager> {
            every { connectionState } returns MutableStateFlow(SocketConnectionState.DISCONNECTED)
        },
        sessionRepository = mockk<SessionRepository> {
            every { currentUser } returns MutableStateFlow<MeeshyUser?>(MeeshyUser(id = "me", username = "me"))
        },
        lockStore = lockStore,
        unlockSession = ConversationUnlockSessionStore(),
        storyRepository = mockk<me.meeshy.sdk.story.StoryRepository>(relaxed = true) {
            every { storiesStream(any(), any()) } returns kotlinx.coroutines.flow.emptyFlow()
        },
        statusBarCache = mockk<me.meeshy.sdk.status.StatusBarCache>(relaxed = true) {
            every { load(any()) } returns CacheResult.Empty
        },
        messagePrefetch = mockk(relaxed = true),
        networkMonitor = me.meeshy.sdk.network.InMemoryNetworkMonitor(),
        statusRepository = mockk(relaxed = true),
        rowSignalsSource = idleRowSignalsSource(),
        livePatcher = mockk(relaxed = true),
        dialogDeps = ConversationListDialogDeps(
            blocker = object : ConversationPeerBlocker {
                override suspend fun block(userId: String): Boolean = false
                override suspend fun unblock(userId: String): Boolean = false
                override fun isBlocked(userId: String): Boolean = userId in blocked
            },
            reporter = ConversationReporter { _, _, _ -> null },
        ),
    )

    private fun ConversationListViewModel.enter(digits: String) {
        digits.forEach { onLockDigit(it - '0') }
    }

    private class Recorded(val avatar: List<ConversationAvatarEffect>, val opened: List<String>)

    private fun TestScope.record(vm: ConversationListViewModel, block: () -> Unit): Recorded {
        val avatar = mutableListOf<ConversationAvatarEffect>()
        val opened = mutableListOf<String>()
        val jobs = listOf(
            launch { vm.avatarEffects.collect { avatar += it } },
            launch { vm.openConversation.collect { opened += it } },
        )
        advanceUntilIdle()
        block()
        advanceUntilIdle()
        jobs.forEach { it.cancel() }
        return Recorded(avatar, opened)
    }

    @Test
    fun `toucher l'avatar d'un direct ouvre le profil du pair, jamais le fil`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()

        val seen = record(vm) { vm.onAvatarTap("dm") }

        assertThat(seen.avatar).containsExactly(ConversationAvatarEffect.OpenProfile("ann"))
        assertThat(seen.opened).isEmpty()
    }

    @Test
    fun `toucher l'avatar d'un groupe, d'une publique ou de Global ouvre les details`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()

        val seen = record(vm) { listOf("grp", "pub", "glo").forEach(vm::onAvatarTap) }

        assertThat(seen.avatar).containsExactly(
            ConversationAvatarEffect.OpenInfo("grp"),
            ConversationAvatarEffect.OpenInfo("pub"),
            ConversationAvatarEffect.OpenInfo("glo"),
        ).inOrder()
        assertThat(seen.opened).isEmpty()
    }

    @Test
    fun `un pair bloque ou au compte ferme ouvre les details, jamais son profil`() = runTest(dispatcher) {
        val vm = viewModel(blocked = setOf("eve"))
        advanceUntilIdle()

        val seen = record(vm) {
            vm.onAvatarTap("dm-blocked")
            vm.onAvatarTap("dm-closed")
        }

        assertThat(seen.avatar).containsExactly(
            ConversationAvatarEffect.OpenInfo("dm-blocked"),
            ConversationAvatarEffect.OpenInfo("dm-closed"),
        ).inOrder()
    }

    @Test
    fun `une conversation verrouillee demande le code puis ouvre les details, jamais le fil`() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply {
            setMasterPin("123456")
            setLock("dm", "4321")
        }
        val vm = viewModel(store)
        advanceUntilIdle()

        val asked = record(vm) { vm.onAvatarTap("dm") }
        assertThat(asked.avatar).isEmpty()
        assertThat(vm.state.value.lockPrompt?.mode).isEqualTo(LockPinMode.OPEN_CONVERSATION)
        assertThat(vm.state.value.lockPrompt?.conversationId).isEqualTo("dm")

        val unlocked = record(vm) { vm.enter("4321") }
        assertThat(unlocked.avatar).containsExactly(ConversationAvatarEffect.OpenInfo("dm"))
        assertThat(unlocked.opened).isEmpty()
        assertThat(vm.state.value.lockPrompt).isNull()
    }

    @Test
    fun `un code abandonne oublie les details demandes, le toucher de la ligne rouvre le fil`() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply {
            setMasterPin("123456")
            setLock("dm", "4321")
        }
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onAvatarTap("dm")
        vm.dismissLockPrompt()
        vm.onConversationTap("dm")
        val seen = record(vm) { vm.enter("4321") }

        assertThat(seen.opened).containsExactly("dm")
        assertThat(seen.avatar).isEmpty()
    }

    @Test
    fun `une ligne inconnue ouvre ses details plutot que rien`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()

        val seen = record(vm) { vm.onAvatarTap("ghost") }

        assertThat(seen.avatar).containsExactly(ConversationAvatarEffect.OpenInfo("ghost"))
    }
}
