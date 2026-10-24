package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import app.cash.turbine.test
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallAudioRoute
import me.meeshy.sdk.model.call.CallAudioRouteKind
import me.meeshy.sdk.model.call.TelecomConnectionState
import me.meeshy.sdk.model.call.TelecomConnectionUpdate
import me.meeshy.sdk.model.call.TelecomDisconnectCause
import me.meeshy.sdk.model.call.TelecomSystemDisconnectKind
import me.meeshy.sdk.model.call.TelecomSystemRequest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CoreTelecomCallReporterTest {

    /** Une connexion système factice : enregistre les ordres, expose les flux que le test pilote. */
    private class FakeControl : TelecomCallControl {
        val calls = mutableListOf<String>()
        val muted = MutableStateFlow(false)
        val current = MutableStateFlow<TelecomEndpoint?>(null)
        val available = MutableStateFlow<List<TelecomEndpoint>>(emptyList())
        val requestedEndpoints = mutableListOf<TelecomEndpoint>()

        override suspend fun answer(isVideo: Boolean): Boolean = true.also { calls += "answer(video=$isVideo)" }
        override suspend fun setActive(): Boolean = true.also { calls += "setActive" }
        override suspend fun disconnect(cause: TelecomDisconnectCause): Boolean = true.also { calls += "disconnect($cause)" }
        override suspend fun requestEndpoint(endpoint: TelecomEndpoint): Boolean = true.also { requestedEndpoints += endpoint }
        override val isMuted: Flow<Boolean> = muted
        override val currentEndpoint: Flow<TelecomEndpoint?> = current
        override val availableEndpoints: Flow<List<TelecomEndpoint>> = available
    }

    private class FakeGateway : TelecomCallsGateway {
        val control = FakeControl()
        var info: TelecomCallInfo? = null
        var handlers: TelecomCallHandlers? = null
        var opened = 0
        var failure: Exception? = null
        val live = CompletableDeferred<Unit>()

        override suspend fun addCall(info: TelecomCallInfo, handlers: TelecomCallHandlers, block: suspend TelecomCallControl.() -> Unit) {
            failure?.let { throw it }
            opened += 1
            this.info = info
            this.handlers = handlers
            control.block()
            live.complete(Unit)
        }
    }

    private class FakeRoutes : CallAudioRouteProviding {
        val changes = MutableSharedFlow<Unit>(extraBufferCapacity = 4)
        var snapshotValue = CallAudioRouteSnapshot(emptyList(), null)
        val selected = mutableListOf<Int>()
        override val routeChanges: Flow<Unit> = changes
        override fun snapshot() = snapshotValue
        override fun select(id: Int): Boolean = true.also { selected += id }
    }

    private fun TestScope.reporter(
        gateway: FakeGateway = FakeGateway(),
        supported: Boolean = true,
        routes: FakeRoutes = FakeRoutes(),
    ) = CoreTelecomCallReporter(gateway, { supported }, routes, StandardTestDispatcher(testScheduler))

    private val outgoing = TelecomCallInfo("u1", "Awa", isVideo = false, isOutgoing = true)
    private val incoming = TelecomCallInfo("u2", "Koffi", isVideo = true, isOutgoing = false)
    private val active = TelecomConnectionUpdate(TelecomConnectionState.Active)

    @Test
    fun `un appel sortant ouvre une connexion sortante qui devient active a la connexion media`() = runTest {
        val gateway = FakeGateway()
        val reporter = reporter(gateway)

        reporter.begin(outgoing)
        reporter.report(TelecomConnectionUpdate(TelecomConnectionState.Dialing))
        reporter.report(active)
        advanceTimeBy(3_000)
        assertThat(gateway.control.calls).isEmpty()

        reporter.onMediaConnected()
        advanceUntilIdle()

        assertThat(gateway.info).isEqualTo(outgoing)
        assertThat(gateway.control.calls).containsExactly("setActive")
        reporter.release()
    }

    @Test
    fun `un appel entrant decroche dans l application est repondu a la connexion media`() = runTest {
        val gateway = FakeGateway()
        val reporter = reporter(gateway)

        reporter.begin(incoming)
        reporter.report(TelecomConnectionUpdate(TelecomConnectionState.Ringing))
        reporter.report(active)
        reporter.onMediaConnected()
        advanceUntilIdle()

        assertThat(gateway.control.calls).containsExactly("answer(video=true)")
        reporter.release()
    }

    @Test
    fun `la fin de l appel deconnecte avec sa cause et clot la connexion`() = runTest {
        val gateway = FakeGateway()
        val reporter = reporter(gateway)
        reporter.begin(outgoing)
        advanceUntilIdle()

        reporter.report(TelecomConnectionUpdate(TelecomConnectionState.Disconnected, TelecomDisconnectCause.Remote))
        advanceUntilIdle()

        assertThat(gateway.control.calls).containsExactly("disconnect(Remote)")
        assertThat(gateway.live.isCompleted).isTrue()
    }

    @Test
    fun `un decroche depuis le systeme est demande a l appel puis tenu jusqu au media`() = runTest {
        val gateway = FakeGateway()
        val reporter = reporter(gateway)
        reporter.begin(incoming)
        advanceUntilIdle()

        reporter.requests.test {
            val answered = this@runTest.launch { gateway.handlers!!.onAnswer() }
            advanceTimeBy(CallTelecomSession.SETTLE_TIMEOUT_MS - 1)
            assertThat(awaitItem()).isEqualTo(TelecomSystemRequest.Answer)
            assertThat(answered.isCompleted).isFalse()

            reporter.onMediaConnected()
            advanceUntilIdle()
            assertThat(answered.isCompleted).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
        reporter.release()
    }

    @Test
    fun `raccrocher depuis le systeme devient une demande de fin`() = runTest {
        val gateway = FakeGateway()
        val reporter = reporter(gateway)
        reporter.begin(incoming)
        advanceUntilIdle()

        reporter.requests.test {
            gateway.handlers!!.onDisconnect(TelecomSystemDisconnectKind.Local)
            assertThat(awaitItem()).isEqualTo(TelecomSystemRequest.Disconnect)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `une destruction par le systeme n emet aucune demande de fin`() = runTest {
        val gateway = FakeGateway()
        val reporter = reporter(gateway)
        reporter.begin(incoming)
        advanceUntilIdle()

        reporter.requests.test {
            gateway.handlers!!.onDisconnect(TelecomSystemDisconnectKind.Error)
            advanceUntilIdle()
            expectNoEvents()
        }
        assertThat(gateway.control.calls).isEmpty()
    }

    @Test
    fun `la mise en attente et le micro du systeme sont relayes`() = runTest {
        val gateway = FakeGateway()
        val reporter = reporter(gateway)
        reporter.begin(outgoing)
        advanceUntilIdle()

        reporter.requests.test {
            gateway.handlers!!.onSetInactive()
            assertThat(awaitItem()).isEqualTo(TelecomSystemRequest.Hold(onHold = true))
            gateway.handlers!!.onSetActive()
            assertThat(awaitItem()).isEqualTo(TelecomSystemRequest.Hold(onHold = false))
            gateway.control.muted.value = true
            advanceUntilIdle()
            assertThat(awaitItem()).isEqualTo(TelecomSystemRequest.Mute(true))
            cancelAndIgnoreRemainingEvents()
        }
        reporter.release()
    }

    @Test
    fun `une sortie choisie dans le systeme devient la route de l application`() = runTest {
        val gateway = FakeGateway()
        val routes = FakeRoutes().apply {
            snapshotValue = CallAudioRouteSnapshot(
                listOf(
                    CallAudioRoute(1, "Ecouteur", CallAudioRouteKind.Earpiece),
                    CallAudioRoute(3, "Casque", CallAudioRouteKind.Bluetooth),
                ),
                activeId = 1,
            )
        }
        val reporter = reporter(gateway, routes = routes)
        reporter.begin(outgoing)
        advanceUntilIdle()

        gateway.control.current.value = TelecomEndpoint(CallAudioRouteKind.Bluetooth, Any())
        advanceUntilIdle()

        assertThat(routes.selected).containsExactly(3)
        reporter.release()
    }

    @Test
    fun `une route choisie dans l application est demandee au systeme`() = runTest {
        val gateway = FakeGateway()
        val routes = FakeRoutes().apply {
            snapshotValue = CallAudioRouteSnapshot(
                listOf(CallAudioRoute(3, "Casque", CallAudioRouteKind.Bluetooth)),
                activeId = 3,
            )
        }
        val reporter = reporter(gateway, routes = routes)
        reporter.begin(outgoing)
        val bluetooth = TelecomEndpoint(CallAudioRouteKind.Bluetooth, Any())
        gateway.control.available.value = listOf(TelecomEndpoint(CallAudioRouteKind.Earpiece, Any()), bluetooth)
        gateway.control.current.value = TelecomEndpoint(CallAudioRouteKind.Earpiece, Any())
        advanceUntilIdle()

        assertThat(gateway.control.requestedEndpoints).containsExactly(bluetooth)
        reporter.release()
    }

    @Test
    fun `sans telephonie le flux in-app reste intact et rien n est ouvert`() = runTest {
        val gateway = FakeGateway()
        val reporter = reporter(gateway, supported = false)

        reporter.begin(outgoing)
        reporter.report(active)
        reporter.onMediaConnected()
        advanceUntilIdle()

        assertThat(gateway.opened).isEqualTo(0)
        reporter.release()
    }

    @Test
    fun `un systeme qui refuse la connexion laisse l appel in-app`() = runTest {
        val gateway = FakeGateway().apply { failure = SecurityException("MANAGE_OWN_CALLS") }
        val reporter = reporter(gateway)

        reporter.begin(outgoing)
        reporter.report(active)
        reporter.onMediaConnected()
        advanceUntilIdle()

        assertThat(gateway.control.calls).isEmpty()
    }

    @Test
    fun `un nouvel appel remplace la connexion precedente`() = runTest {
        val gateway = FakeGateway()
        val reporter = reporter(gateway)

        reporter.begin(outgoing)
        advanceUntilIdle()
        reporter.begin(incoming)
        advanceUntilIdle()

        assertThat(gateway.opened).isEqualTo(2)
        assertThat(gateway.info).isEqualTo(incoming)
        reporter.release()
    }
}
