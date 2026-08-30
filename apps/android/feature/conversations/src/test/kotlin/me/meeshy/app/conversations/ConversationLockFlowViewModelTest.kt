package me.meeshy.app.conversations

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
 * Behavioural coverage of the conversation-lock orchestration in
 * [ConversationListViewModel] — how the context-menu lock/unlock intent picks a
 * sheet mode, how digits flow through the [LockPinReducer] into the real
 * [InMemoryConversationLockStore], and how a first-time master-PIN setup chains
 * into the code entry. The store is a real in-memory fake (not a mock), so the
 * assertions are on observable lock state, never on canned stubs.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ConversationLockFlowViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val workManager: WorkManager = mockk(relaxed = true)

    private fun viewModel(lockStore: InMemoryConversationLockStore) = ConversationListViewModel(
        repository = mockk<ConversationRepository>(relaxed = true).also {
            every { it.conversationsStream(any(), any()) } returns flowOf(CacheResult.Empty)
        },
        messageRepository = mockk<MessageRepository>(relaxed = true),
        messageSocketManager = mockk<MessageSocketManager> {
            every { unreadUpdated } returns MutableSharedFlow()
            every { messageReceived } returns MutableSharedFlow()
            every { conversationUpdated } returns MutableSharedFlow()
            every { conversationDeleted } returns MutableSharedFlow()
            every { conversationRestored } returns MutableSharedFlow()
            every { conversationClosed } returns MutableSharedFlow()
            every { participantLeft } returns MutableSharedFlow()
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
            every { currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        },
        lockStore = lockStore,
        storyRepository = mockk<me.meeshy.sdk.story.StoryRepository>(relaxed = true) {
            every { storiesStream(any(), any()) } returns kotlinx.coroutines.flow.emptyFlow()
        },
        statusBarCache = mockk<me.meeshy.sdk.status.StatusBarCache>(relaxed = true) {
            every { load(any()) } returns CacheResult.Empty
        },
    )

    private fun ConversationListViewModel.enter(digits: String) {
        digits.forEach { onLockDigit(it - '0') }
    }

    @Test
    fun toggling_an_unlocked_conversation_without_a_master_pin_opens_first_time_setup() = runTest(dispatcher) {
        val vm = viewModel(InMemoryConversationLockStore())
        advanceUntilIdle()

        vm.onLockToggle("c1")

        val prompt = vm.state.value.lockPrompt
        assertThat(prompt?.mode).isEqualTo(LockPinMode.SETUP_MASTER_PIN)
        assertThat(prompt?.conversationId).isEqualTo("c1")
    }

    @Test
    fun setting_a_master_pin_then_a_code_locks_the_conversation_in_one_flow() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore()
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onLockToggle("c1")
        vm.enter("123456")            // create master
        vm.enter("123456")            // confirm master -> chains to code entry
        assertThat(vm.state.value.lockPrompt?.mode).isEqualTo(LockPinMode.LOCK_CONVERSATION)
        assertThat(vm.state.value.lockPrompt?.step).isEqualTo(1)
        assertThat(store.hasMasterPin()).isTrue()

        vm.enter("4321")             // enter code
        vm.enter("4321")             // confirm code -> commit + complete
        advanceUntilIdle()

        assertThat(vm.state.value.lockPrompt).isNull()
        assertThat(store.isLocked("c1")).isTrue()
        assertThat(vm.state.value.isLocked("c1")).isTrue()
    }

    @Test
    fun toggling_an_unlocked_conversation_with_a_master_pin_prompts_for_the_code_directly() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply { setMasterPin("123456") }
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onLockToggle("c1")

        assertThat(vm.state.value.lockPrompt?.mode).isEqualTo(LockPinMode.LOCK_CONVERSATION)
        assertThat(vm.state.value.lockPrompt?.step).isEqualTo(0)
    }

    @Test
    fun a_wrong_master_pin_keeps_the_sheet_open_and_locks_nothing() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply { setMasterPin("123456") }
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onLockToggle("c1")
        vm.enter("000000")

        assertThat(vm.state.value.lockPrompt?.mode).isEqualTo(LockPinMode.LOCK_CONVERSATION)
        assertThat(vm.state.value.lockPrompt?.error).isEqualTo(LockPinError.MASTER_PIN_INCORRECT)
        assertThat(store.isLocked("c1")).isFalse()
    }

    @Test
    fun toggling_a_locked_conversation_unlocks_it_with_the_correct_code() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply {
            setMasterPin("123456")
            setLock("c1", "4321")
        }
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onLockToggle("c1")
        assertThat(vm.state.value.lockPrompt?.mode).isEqualTo(LockPinMode.UNLOCK_CONVERSATION)

        vm.enter("4321")
        advanceUntilIdle()

        assertThat(vm.state.value.lockPrompt).isNull()
        assertThat(store.isLocked("c1")).isFalse()
        assertThat(vm.state.value.isLocked("c1")).isFalse()
    }

    @Test
    fun a_wrong_unlock_code_keeps_the_conversation_locked() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply {
            setMasterPin("123456")
            setLock("c1", "4321")
        }
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onLockToggle("c1")
        vm.enter("0000")

        assertThat(vm.state.value.lockPrompt?.error).isEqualTo(LockPinError.CODE_INCORRECT)
        assertThat(store.isLocked("c1")).isTrue()
    }

    @Test
    fun dismissing_the_sheet_clears_it_and_drops_the_pending_chained_lock() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore()
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onLockToggle("c1")          // setup, pends a chained lock
        vm.dismissLockPrompt()
        assertThat(vm.state.value.lockPrompt).isNull()

        // Re-open now that a master PIN exists — must NOT resurrect the dropped pending chain.
        store.setMasterPin("123456")
        vm.onLockToggle("c2")
        vm.enter("123456")             // this is a fresh LOCK verify, not a setup
        assertThat(vm.state.value.lockPrompt?.mode).isEqualTo(LockPinMode.LOCK_CONVERSATION)
        assertThat(vm.state.value.lockPrompt?.step).isEqualTo(1)
    }

    @Test
    fun lock_digit_and_delete_are_inert_when_no_sheet_is_open() = runTest(dispatcher) {
        val vm = viewModel(InMemoryConversationLockStore())
        advanceUntilIdle()

        vm.onLockDigit(5)
        vm.onLockDelete()

        assertThat(vm.state.value.lockPrompt).isNull()
    }

    @Test
    fun delete_removes_the_last_digit_of_the_open_sheet() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply { setMasterPin("123456") }
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onLockToggle("c1")
        vm.enter("12")
        vm.onLockDelete()

        assertThat(vm.state.value.lockPrompt?.pin).isEqualTo("1")
    }

    // MARK: - Tap gate (open a locked conversation)

    /** Collects every id the VM asks the screen to navigate to during [block]. */
    private fun TestScope.recordOpened(vm: ConversationListViewModel, block: () -> Unit): List<String> {
        val opened = mutableListOf<String>()
        val job = launch { vm.openConversation.collect { opened += it } }
        advanceUntilIdle()
        block()
        advanceUntilIdle()
        job.cancel()
        return opened
    }

    @Test
    fun tapping_an_unlocked_conversation_navigates_straight_through() = runTest(dispatcher) {
        val vm = viewModel(InMemoryConversationLockStore())
        advanceUntilIdle()

        val opened = recordOpened(vm) { vm.onConversationTap("c1") }

        assertThat(opened).containsExactly("c1")
        assertThat(vm.state.value.lockPrompt).isNull()
    }

    @Test
    fun tapping_a_locked_conversation_opens_the_gate_sheet_and_does_not_navigate() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply {
            setMasterPin("123456")
            setLock("c1", "4321")
        }
        val vm = viewModel(store)
        advanceUntilIdle()

        val opened = recordOpened(vm) { vm.onConversationTap("c1") }

        assertThat(opened).isEmpty()
        assertThat(vm.state.value.lockPrompt?.mode).isEqualTo(LockPinMode.OPEN_CONVERSATION)
        assertThat(vm.state.value.lockPrompt?.conversationId).isEqualTo("c1")
    }

    @Test
    fun the_correct_open_code_navigates_and_keeps_the_conversation_locked() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply {
            setMasterPin("123456")
            setLock("c1", "4321")
        }
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onConversationTap("c1")
        val opened = recordOpened(vm) { vm.enter("4321") }

        assertThat(opened).containsExactly("c1")
        assertThat(vm.state.value.lockPrompt).isNull()
        assertThat(store.isLocked("c1")).isTrue()
        assertThat(vm.state.value.isLocked("c1")).isTrue()
    }

    @Test
    fun a_wrong_open_code_keeps_the_gate_open_and_does_not_navigate() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply {
            setMasterPin("123456")
            setLock("c1", "4321")
        }
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onConversationTap("c1")
        val opened = recordOpened(vm) { vm.enter("0000") }

        assertThat(opened).isEmpty()
        assertThat(vm.state.value.lockPrompt?.mode).isEqualTo(LockPinMode.OPEN_CONVERSATION)
        assertThat(vm.state.value.lockPrompt?.error).isEqualTo(LockPinError.CODE_INCORRECT)
        assertThat(store.isLocked("c1")).isTrue()
    }

    // MARK: - Unlock-all (Settings → drop every conversation lock with the master PIN)

    @Test
    fun can_unlock_all_is_true_only_while_a_conversation_is_locked() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply { setMasterPin("123456") }
        val vm = viewModel(store)
        advanceUntilIdle()
        assertThat(vm.state.value.canUnlockAll).isFalse()

        store.setLock("c1", "4321")
        advanceUntilIdle()
        assertThat(vm.state.value.canUnlockAll).isTrue()
    }

    @Test
    fun the_correct_master_pin_drops_every_lock_at_once() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply {
            setMasterPin("123456")
            setLock("c1", "4321")
            setLock("c2", "1111")
        }
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onUnlockAll()
        assertThat(vm.state.value.lockPrompt?.mode).isEqualTo(LockPinMode.UNLOCK_ALL)
        assertThat(vm.state.value.lockPrompt?.conversationId).isNull()

        vm.enter("123456")
        advanceUntilIdle()

        assertThat(vm.state.value.lockPrompt).isNull()
        assertThat(store.isLocked("c1")).isFalse()
        assertThat(store.isLocked("c2")).isFalse()
        assertThat(vm.state.value.canUnlockAll).isFalse()
        // Unlock-all drops the locks but leaves the master PIN in place (iOS parity).
        assertThat(store.hasMasterPin()).isTrue()
    }

    @Test
    fun a_wrong_unlock_all_master_pin_keeps_every_lock() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply {
            setMasterPin("123456")
            setLock("c1", "4321")
            setLock("c2", "1111")
        }
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onUnlockAll()
        vm.enter("000000")
        advanceUntilIdle()

        assertThat(vm.state.value.lockPrompt?.mode).isEqualTo(LockPinMode.UNLOCK_ALL)
        assertThat(vm.state.value.lockPrompt?.error).isEqualTo(LockPinError.MASTER_PIN_INCORRECT)
        assertThat(store.isLocked("c1")).isTrue()
        assertThat(store.isLocked("c2")).isTrue()
    }

    @Test
    fun unlock_all_is_inert_when_nothing_is_locked() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply { setMasterPin("123456") }
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onUnlockAll()

        assertThat(vm.state.value.lockPrompt).isNull()
    }

    // MARK: - Change master PIN (Settings → verify current, enter new, confirm)

    @Test
    fun the_change_affordance_surfaces_only_once_a_master_pin_exists() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore()
        val vm = viewModel(store)
        advanceUntilIdle()
        assertThat(vm.state.value.hasMasterPin).isFalse()
        assertThat(vm.state.value.canChangeMasterPin).isFalse()

        // A first-time setup+lock flow installs a master PIN — the mirror must flip to true.
        vm.onLockToggle("c1")
        vm.enter("123456")
        vm.enter("123456")
        vm.enter("4321")
        vm.enter("4321")
        advanceUntilIdle()

        assertThat(vm.state.value.hasMasterPin).isTrue()
        assertThat(vm.state.value.canChangeMasterPin).isTrue()
    }

    @Test
    fun changing_the_master_pin_replaces_it_leaving_locks_untouched() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply {
            setMasterPin("123456")
            setLock("c1", "4321")
        }
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onChangeMasterPin()
        assertThat(vm.state.value.lockPrompt?.mode).isEqualTo(LockPinMode.CHANGE_MASTER_PIN)

        vm.enter("123456")            // verify current
        vm.enter("654321")            // new
        vm.enter("654321")            // confirm new
        advanceUntilIdle()

        assertThat(vm.state.value.lockPrompt).isNull()
        assertThat(store.verifyMasterPin("654321")).isTrue()
        assertThat(store.verifyMasterPin("123456")).isFalse()
        // Locks are untouched by a master-PIN change.
        assertThat(store.isLocked("c1")).isTrue()
    }

    @Test
    fun a_wrong_current_master_pin_keeps_the_change_sheet_open_and_changes_nothing() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply { setMasterPin("123456") }
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onChangeMasterPin()
        vm.enter("000000")

        assertThat(vm.state.value.lockPrompt?.mode).isEqualTo(LockPinMode.CHANGE_MASTER_PIN)
        assertThat(vm.state.value.lockPrompt?.error).isEqualTo(LockPinError.MASTER_PIN_INCORRECT)
        assertThat(store.verifyMasterPin("123456")).isTrue()
    }

    @Test
    fun change_is_inert_without_a_master_pin() = runTest(dispatcher) {
        val vm = viewModel(InMemoryConversationLockStore())
        advanceUntilIdle()

        vm.onChangeMasterPin()

        assertThat(vm.state.value.lockPrompt).isNull()
    }

    // MARK: - Remove master PIN (Settings → verify, clear)

    @Test
    fun the_remove_affordance_requires_a_pin_and_no_locks() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore()
        val vm = viewModel(store)
        advanceUntilIdle()
        assertThat(vm.state.value.canRemoveMasterPin).isFalse()   // no PIN

        store.setMasterPin("123456")
        store.setLock("c1", "4321")                               // fires the flow
        advanceUntilIdle()
        assertThat(vm.state.value.canRemoveMasterPin).isFalse()   // PIN but a lock survives

        store.removeLock("c1")
        advanceUntilIdle()
        assertThat(vm.state.value.canRemoveMasterPin).isTrue()    // PIN and nothing locked
    }

    @Test
    fun removing_the_master_pin_clears_it() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply { setMasterPin("123456") }
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onRemoveMasterPin()
        assertThat(vm.state.value.lockPrompt?.mode).isEqualTo(LockPinMode.REMOVE_MASTER_PIN)

        vm.enter("123456")
        advanceUntilIdle()

        assertThat(vm.state.value.lockPrompt).isNull()
        assertThat(store.hasMasterPin()).isFalse()
        assertThat(vm.state.value.hasMasterPin).isFalse()
    }

    @Test
    fun a_wrong_remove_master_pin_keeps_it() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply { setMasterPin("123456") }
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onRemoveMasterPin()
        vm.enter("000000")
        advanceUntilIdle()

        assertThat(vm.state.value.lockPrompt?.mode).isEqualTo(LockPinMode.REMOVE_MASTER_PIN)
        assertThat(vm.state.value.lockPrompt?.error).isEqualTo(LockPinError.MASTER_PIN_INCORRECT)
        assertThat(store.hasMasterPin()).isTrue()
    }

    @Test
    fun remove_is_inert_without_a_master_pin() = runTest(dispatcher) {
        val vm = viewModel(InMemoryConversationLockStore())
        advanceUntilIdle()

        vm.onRemoveMasterPin()

        assertThat(vm.state.value.lockPrompt).isNull()
    }

    @Test
    fun remove_is_inert_while_a_conversation_is_locked() = runTest(dispatcher) {
        val store = InMemoryConversationLockStore().apply {
            setMasterPin("123456")
            setLock("c1", "4321")
        }
        val vm = viewModel(store)
        advanceUntilIdle()

        vm.onRemoveMasterPin()

        assertThat(vm.state.value.lockPrompt).isNull()
    }
}
