package me.meeshy.app.sync

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.connection.ConnectionStatusStore
import me.meeshy.sdk.model.TypingEvent
import me.meeshy.sdk.model.sync.OutboxNavigationSource
import me.meeshy.sdk.model.sync.OutboxUiIcon
import me.meeshy.sdk.model.sync.OutboxUiItem
import me.meeshy.sdk.model.sync.OutboxUiKind
import me.meeshy.sdk.model.sync.OutboxUiStatus
import me.meeshy.sdk.outbox.OfflineQueuePillProviding
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SyncPillViewModelTest {
    private class Fakes {
        val online = MutableStateFlow(true)
        val socket = MutableStateFlow(true)
        val items = MutableStateFlow<List<OutboxUiItem>>(emptyList())
        val started = MutableSharedFlow<TypingEvent>(extraBufferCapacity = 8)
        val stopped = MutableSharedFlow<TypingEvent>(extraBufferCapacity = 8)
        val sent = MutableSharedFlow<Pair<String, String>>(extraBufferCapacity = 8)
        val open = MutableStateFlow<String?>(null)
        val retried = mutableListOf<String>()
        var retryResult = true

        val queue = object : OfflineQueuePillProviding {
            override val pendingUiItems: Flow<List<OutboxUiItem>> = items
            override suspend fun retryItem(outboxId: String): Boolean {
                retried += outboxId
                return retryResult
            }
        }
        val typing = object : SyncPillTypingSource {
            override val started: Flow<TypingEvent> = this@Fakes.started
            override val stopped: Flow<TypingEvent> = this@Fakes.stopped
            override val sent: Flow<Pair<String, String>> = this@Fakes.sent
            override val selfId: String? = "me"
            override val openConversationId: Flow<String?> = open
        }
        val store = ConnectionStatusStore(online, socket, MutableStateFlow(0))
    }

    @Before
    fun setUp() = Dispatchers.setMain(StandardTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun TestScope.viewModel(f: Fakes): SyncPillViewModel {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val vm = SyncPillViewModel(f.store, f.queue, f.typing) { testScheduler.currentTime }
        backgroundScope.launch { vm.uiState.collect { } }
        runCurrent()
        return vm
    }

    private fun message(id: String, status: OutboxUiStatus = OutboxUiStatus.PENDING, createdAt: Long = 0) =
        OutboxUiItem(id, OutboxUiKind.MESSAGE, null, OutboxUiIcon.TEXT, 0, OutboxNavigationSource.Conversation("c1", id), status, createdAt)

    @Test
    fun `connecte et file vide, rien n'est montre`() = runTest {
        val vm = viewModel(Fakes())
        assertThat(vm.uiState.value.rows).isEmpty()
    }

    @Test
    fun `sans reseau la pastille dit hors ligne puis confirme le retour 4 secondes`() = runTest {
        val f = Fakes()
        val vm = viewModel(f)
        f.online.value = false
        runCurrent()
        assertThat(vm.uiState.value.rows.map { it.labelKey }).containsExactly("connection.offline")

        f.online.value = true
        runCurrent()
        assertThat(vm.uiState.value.rows.map { it.labelKey }).containsExactly("connection.online")

        advanceTimeBy(4_001)
        runCurrent()
        assertThat(vm.uiState.value.rows).isEmpty()
    }

    @Test
    fun `une socket tombee ne se montre qu'apres la grace de 3 secondes`() = runTest {
        val f = Fakes()
        val vm = viewModel(f)
        f.socket.value = false
        runCurrent()
        assertThat(vm.uiState.value.rows).isEmpty()

        advanceTimeBy(3_001)
        runCurrent()
        assertThat(vm.uiState.value.rows.map { it.labelKey }).containsExactly("connection.reconnecting")
    }

    @Test
    fun `les operations de la file passent apres l'etat de connexion`() = runTest {
        val f = Fakes()
        val vm = viewModel(f)
        f.online.value = false
        f.items.value = listOf(message("a"))
        runCurrent()
        assertThat(vm.uiState.value.rows.map { it.id }).containsExactly("status.offline", "op:a").inOrder()
    }

    @Test
    fun `un echec sort de l'affichage apres sa fenetre de 60 secondes`() = runTest {
        val f = Fakes()
        val vm = viewModel(f)
        f.items.value = listOf(message("a", OutboxUiStatus.EXHAUSTED, createdAt = 0))
        runCurrent()
        assertThat(vm.uiState.value.rows.single().labelKey).isEqualTo("sync.pill.failed.message")

        advanceTimeBy(60_200)
        runCurrent()
        assertThat(vm.uiState.value.rows).isEmpty()
    }

    @Test
    fun `un ami qui ecrit ailleurs s'annonce, ici il se tait, et son message l'eteint`() = runTest {
        val f = Fakes()
        val vm = viewModel(f)
        f.started.emit(TypingEvent("c1", "u1", "ana"))
        runCurrent()
        assertThat(vm.uiState.value.rows.single().literalLabel).isEqualTo("@ana")

        f.open.value = "c1"
        runCurrent()
        assertThat(vm.uiState.value.rows).isEmpty()

        f.open.value = null
        runCurrent()
        f.sent.emit("c1" to "u1")
        runCurrent()
        assertThat(vm.uiState.value.rows).isEmpty()
    }

    @Test
    fun `ma propre frappe ne s'annonce pas, et une frappe sans stop s'eteint apres 15 secondes`() = runTest {
        val f = Fakes()
        val vm = viewModel(f)
        f.started.emit(TypingEvent("c1", "me", "moi"))
        runCurrent()
        assertThat(vm.uiState.value.rows).isEmpty()

        f.started.emit(TypingEvent("c2", "u2", "bob"))
        runCurrent()
        assertThat(vm.uiState.value.rows).hasSize(1)
        advanceTimeBy(SyncPillViewModel.TYPING_SAFETY_TIMEOUT_MS + 1)
        runCurrent()
        assertThat(vm.uiState.value.rows).isEmpty()
    }

    @Test
    fun `relancer un echec appelle retryItem et dit le resultat`() = runTest {
        val f = Fakes()
        val vm = viewModel(f)
        val results = mutableListOf<SyncPillEffect>()
        backgroundScope.launch { vm.effectFlow.collect { results += it } }
        runCurrent()

        vm.onEvent(SyncPillUiEvent.Retry("o1"))
        runCurrent()
        assertThat(f.retried).containsExactly("o1")
        assertThat(results).containsExactly(SyncPillEffect.RetryResult(started = true))

        f.retryResult = false
        vm.onEvent(SyncPillUiEvent.Retry("o2"))
        runCurrent()
        assertThat(results.last()).isEqualTo(SyncPillEffect.RetryResult(started = false))
    }
}
