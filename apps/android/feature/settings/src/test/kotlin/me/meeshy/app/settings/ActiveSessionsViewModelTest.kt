package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.session.ActiveSessionsScreenLaw.Banner
import me.meeshy.sdk.model.session.ActiveSessionsScreenLaw.Mode
import me.meeshy.sdk.model.session.UserSession
import me.meeshy.sdk.model.session.UserSessionsPayload
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import me.meeshy.sdk.session.InMemoryUserSessionsSnapshotStore
import me.meeshy.sdk.session.UserSessionsRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class ActiveSessionsViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private val now = 10_000_000L
    private val me = UserSession(id = "me", isCurrentSession = true, deviceName = "Pixel 8")
    private val tablet = UserSession(id = "tablet", deviceName = "iPad de Marie", lastActivityAt = "2026-01-01T00:00:00Z")
    private val phone = UserSession(id = "phone", deviceName = "iPhone", lastActivityAt = "2026-06-01T00:00:00Z")

    private class Rig(
        val api: AuthApi,
        val store: InMemoryUserSessionsSnapshotStore,
        val network: InMemoryNetworkMonitor,
        val viewModel: ActiveSessionsViewModel,
    )

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun served(vararg sessions: UserSession) = UserSessionsPayload(sessions.toList(), sessions.size)

    private fun rig(
        cached: UserSessionsPayload? = null,
        online: Boolean = true,
        configure: (AuthApi) -> Unit = {},
    ): Rig {
        val api = mockk<AuthApi>()
        val store = InMemoryUserSessionsSnapshotStore()
        val network = InMemoryNetworkMonitor(initialOnline = online)
        val clock = object : CacheClock { override fun nowMillis() = now }
        configure(api)
        if (cached != null) kotlinx.coroutines.runBlocking { store.save(cached, now - 10 * 60_000L) }
        val viewModel = ActiveSessionsViewModel(UserSessionsRepository(api, store, clock), network, clock)
        return Rig(api, store, network, viewModel)
    }

    private fun TestScope.observe(rig: Rig): List<ActiveSessionsUiState> {
        val seen = mutableListOf<ActiveSessionsUiState>()
        backgroundScope.launch(dispatcher) { rig.viewModel.state.collect { seen += it } }
        runCurrent()
        return seen
    }

    private fun AuthApi.serving(payload: UserSessionsPayload) {
        coEvery { listSessions() } returns ApiResponse(success = true, data = payload)
    }

    @Test
    fun `a cold cache shows the skeleton then the sessions in order, current first`() = runTest(dispatcher) {
        val rig = rig { api ->
            coEvery { api.listSessions() } coAnswers {
                delay(100)
                ApiResponse(success = true, data = served(tablet, phone, me))
            }
        }
        val seen = observe(rig)
        assertThat(seen.last().mode).isEqualTo(Mode.SKELETON)

        advanceUntilIdle()

        val state = rig.viewModel.state.value
        assertThat(state.mode).isEqualTo(Mode.CONTENT)
        assertThat(state.current?.id).isEqualTo("me")
        assertThat(state.others.map { it.id }).containsExactly("phone", "tablet").inOrder()
    }

    @Test
    fun `a known list is shown at once without a skeleton, then revalidated silently`() = runTest(dispatcher) {
        val rig = rig(cached = served(me, tablet)) { it.serving(served(me, tablet, phone)) }

        val seen = observe(rig)

        val firstContent = seen.indexOfFirst { it.mode == Mode.CONTENT }
        assertThat(firstContent).isAtLeast(0)
        assertThat(seen.drop(firstContent).none { it.mode == Mode.SKELETON }).isTrue()
        advanceUntilIdle()
        assertThat(rig.viewModel.state.value.others.map { it.id }).containsExactly("phone", "tablet")
        assertThat(rig.viewModel.state.value.banner).isNull()
    }

    @Test
    fun `offline without a cache is the offline state, online it is the error state`() = runTest(dispatcher) {
        val offline = rig(online = false) { coEvery { it.listSessions() } throws IOException("down") }
        observe(offline)
        advanceUntilIdle()
        assertThat(offline.viewModel.state.value.mode).isEqualTo(Mode.OFFLINE)

        val online = rig { coEvery { it.listSessions() } throws IOException("boom") }
        observe(online)
        advanceUntilIdle()
        assertThat(online.viewModel.state.value.mode).isEqualTo(Mode.ERROR)
    }

    @Test
    fun `a failed refresh over a known list keeps it and raises the banner`() = runTest(dispatcher) {
        val offline = rig(cached = served(me, tablet), online = false) { coEvery { it.listSessions() } throws IOException("down") }
        observe(offline)
        advanceUntilIdle()
        assertThat(offline.viewModel.state.value.mode).isEqualTo(Mode.CONTENT)
        assertThat(offline.viewModel.state.value.banner).isEqualTo(Banner.OFFLINE)

        val online = rig(cached = served(me, tablet)) { coEvery { it.listSessions() } throws IOException("boom") }
        observe(online)
        advanceUntilIdle()
        assertThat(online.viewModel.state.value.banner).isEqualTo(Banner.ERROR)
        assertThat(online.viewModel.state.value.others).hasSize(1)
    }

    @Test
    fun `a served list with no session is the empty state`() = runTest(dispatcher) {
        val rig = rig { it.serving(served()) }
        observe(rig)
        advanceUntilIdle()
        assertThat(rig.viewModel.state.value.mode).isEqualTo(Mode.EMPTY)
    }

    @Test
    fun `retry after an error loads the list`() = runTest(dispatcher) {
        val rig = rig { coEvery { it.listSessions() } throws IOException("boom") }
        observe(rig)
        advanceUntilIdle()
        rig.api.serving(served(me, tablet))

        rig.viewModel.onEvent(ActiveSessionsUiEvent.Retry)
        advanceUntilIdle()

        assertThat(rig.viewModel.state.value.mode).isEqualTo(Mode.CONTENT)
        assertThat(rig.viewModel.state.value.isRefreshing).isFalse()
    }

    @Test
    fun `asking to disconnect only asks, and the current device cannot be asked`() = runTest(dispatcher) {
        val rig = rig(cached = served(me, tablet)) { it.serving(served(me, tablet)) }
        observe(rig)
        advanceUntilIdle()

        rig.viewModel.onEvent(ActiveSessionsUiEvent.RequestRevoke("me"))
        runCurrent()
        assertThat(rig.viewModel.state.value.pendingRevocation).isNull()

        rig.viewModel.onEvent(ActiveSessionsUiEvent.RequestRevoke("tablet"))
        runCurrent()
        assertThat(rig.viewModel.state.value.pendingRevocation?.id).isEqualTo("tablet")
        coVerify(exactly = 0) { rig.api.revokeSession(any()) }

        rig.viewModel.onEvent(ActiveSessionsUiEvent.CancelConfirmation)
        rig.viewModel.onEvent(ActiveSessionsUiEvent.ConfirmRevoke)
        advanceUntilIdle()
        coVerify(exactly = 0) { rig.api.revokeSession(any()) }
        assertThat(rig.viewModel.state.value.others).hasSize(1)
    }

    @Test
    fun `a confirmed revocation removes the row and emits success`() = runTest(dispatcher) {
        val rig = rig(cached = served(me, tablet, phone)) {
            it.serving(served(me, tablet, phone))
            coEvery { it.revokeSession("tablet") } returns ApiResponse(success = true)
        }
        observe(rig)
        val effects = mutableListOf<ActiveSessionsUiEffect>()
        backgroundScope.launch(dispatcher) { rig.viewModel.effectFlow.collect { effects += it } }
        advanceUntilIdle()

        rig.viewModel.onEvent(ActiveSessionsUiEvent.RequestRevoke("tablet"))
        rig.viewModel.onEvent(ActiveSessionsUiEvent.ConfirmRevoke)
        advanceUntilIdle()

        coVerify(exactly = 1) { rig.api.revokeSession("tablet") }
        assertThat(rig.viewModel.state.value.others.map { it.id }).containsExactly("phone")
        assertThat(rig.viewModel.state.value.failure).isNull()
        assertThat(effects).containsExactly(ActiveSessionsUiEffect.Success)
    }

    @Test
    fun `a refused revocation puts the row back at its index and raises the alert`() = runTest(dispatcher) {
        val rig = rig(cached = served(me, phone, tablet)) {
            it.serving(served(me, phone, tablet))
            coEvery { it.revokeSession("phone") } throws IOException("refused")
        }
        observe(rig)
        val effects = mutableListOf<ActiveSessionsUiEffect>()
        backgroundScope.launch(dispatcher) { rig.viewModel.effectFlow.collect { effects += it } }
        advanceUntilIdle()

        rig.viewModel.onEvent(ActiveSessionsUiEvent.RequestRevoke("phone"))
        rig.viewModel.onEvent(ActiveSessionsUiEvent.ConfirmRevoke)
        advanceUntilIdle()

        assertThat(rig.viewModel.state.value.others.map { it.id }).containsExactly("phone", "tablet")
        assertThat(rig.viewModel.state.value.failure).isEqualTo(ActiveSessionsFailure.REVOKE_ONE)
        assertThat(effects).containsExactly(ActiveSessionsUiEffect.Error)

        rig.viewModel.onEvent(ActiveSessionsUiEvent.DismissFailure)
        runCurrent()
        assertThat(rig.viewModel.state.value.failure).isNull()
    }

    @Test
    fun `disconnecting the other devices asks first, then keeps only this device`() = runTest(dispatcher) {
        val rig = rig(cached = served(me, phone, tablet)) {
            it.serving(served(me, phone, tablet))
            coEvery { it.revokeOtherSessions() } returns ApiResponse(success = true)
        }
        observe(rig)
        advanceUntilIdle()

        rig.viewModel.onEvent(ActiveSessionsUiEvent.RequestRevokeOthers)
        runCurrent()
        assertThat(rig.viewModel.state.value.confirmingRevokeOthers).isTrue()
        coVerify(exactly = 0) { rig.api.revokeOtherSessions() }

        rig.viewModel.onEvent(ActiveSessionsUiEvent.ConfirmRevokeOthers)
        advanceUntilIdle()

        coVerify(exactly = 1) { rig.api.revokeOtherSessions() }
        assertThat(rig.viewModel.state.value.others).isEmpty()
        assertThat(rig.viewModel.state.value.current?.id).isEqualTo("me")
        assertThat(rig.viewModel.state.value.confirmingRevokeOthers).isFalse()
    }

    @Test
    fun `a second confirmation while one revocation is in flight is ignored`() = runTest(dispatcher) {
        val rig = rig(cached = served(me, phone, tablet)) {
            it.serving(served(me, phone, tablet))
            coEvery { it.revokeSession(any()) } coAnswers {
                delay(1_000)
                ApiResponse(success = true)
            }
        }
        observe(rig)
        advanceUntilIdle()

        rig.viewModel.onEvent(ActiveSessionsUiEvent.RequestRevoke("phone"))
        rig.viewModel.onEvent(ActiveSessionsUiEvent.ConfirmRevoke)
        advanceTimeBy(100)
        rig.viewModel.onEvent(ActiveSessionsUiEvent.RequestRevoke("tablet"))
        rig.viewModel.onEvent(ActiveSessionsUiEvent.ConfirmRevoke)
        advanceUntilIdle()

        coVerify(exactly = 1) { rig.api.revokeSession(any()) }
    }
}
