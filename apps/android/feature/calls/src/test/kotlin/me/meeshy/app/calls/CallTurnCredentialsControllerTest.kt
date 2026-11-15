package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.Test

/**
 * Un long appel renouvelle ses identifiants TURN avant qu'ils n'expirent (#13773), avec les émissions d'iOS
 * `CallTurnCredentials` : `call:request-ice-servers` à 80 % du TTL servi, chien de garde de 8 s, trois demandes au
 * plus par cycle puis un cycle au plancher ; le jeu reçu réarme sur son TTL ; la fin de l'appel coupe tout.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallTurnCredentialsControllerTest {

    private val signals: CallSignalManager = mockk(relaxed = true)
    private val timer = ManualTurnTimer()
    private val turn = listOf(SocketIceServer(urls = listOf("turn:relay"), username = "u", credential = "p"))

    private class Host(override val scope: CoroutineScope) : CallSessionHost {
        override val config: CallConfig = CallConfig.EMPTY
        override var callId: String = "call-1"
        override val selfId: String = "me"
        override var callState: CallState = CallState.Connected
        override val elapsedSeconds: Long = 0
        override fun dispatch(event: CallEvent) = Unit
        override fun endMedia() = Unit
        override fun restartMediaIce() = Unit
        override fun publish() = Unit
    }

    private fun TestScope.controller(): Pair<CallTurnCredentialsController, Host> {
        val host = Host(backgroundScope)
        return CallTurnCredentialsController(signals, timer).apply { attach(host) } to host
    }

    @Test
    fun `a served set asks the gateway at 80 percent of its lifetime, then watches for the answer`() =
        runTest(UnconfinedTestDispatcher()) {
            val (turnCredentials, _) = controller()
            turnCredentials.afterConfigure("call-1", turn, ttlSeconds = 3_600)
            assertThat(timer.live).containsExactly(2_880_000L)
            verify(exactly = 0) { signals.emitRequestIceServers(any()) }

            timer.fire(2_880_000L)

            verify(exactly = 1) { signals.emitRequestIceServers("call-1") }
            assertThat(timer.live).containsExactly(8_000L)
        }

    @Test
    fun `the answer re-arms on its own lifetime and stands the watchdog down`() = runTest(UnconfinedTestDispatcher()) {
        val (turnCredentials, _) = controller()
        turnCredentials.afterConfigure("call-1", turn, ttlSeconds = 3_600)
        timer.fire(2_880_000L)

        turnCredentials.schedule(ttlSeconds = 600)

        assertThat(timer.live).containsExactly(480_000L)
    }

    @Test
    fun `an unanswered request is asked three times, then the next cycle arms at the floor`() =
        runTest(UnconfinedTestDispatcher()) {
            val (turnCredentials, _) = controller()
            turnCredentials.schedule(ttlSeconds = 3_600)
            timer.fire(2_880_000L)
            repeat(3) { timer.fire(8_000L) }

            verify(exactly = 3) { signals.emitRequestIceServers("call-1") }
            assertThat(timer.live).containsExactly(30_000L)
        }

    @Test
    fun `an empty set asks at once, an unknown lifetime takes the gateway default`() = runTest(UnconfinedTestDispatcher()) {
        val (turnCredentials, _) = controller()
        turnCredentials.afterConfigure("call-1", emptyList())
        verify(exactly = 1) { signals.emitRequestIceServers("call-1") }

        turnCredentials.afterConfigure("call-1", turn)
        assertThat(timer.live).containsExactly(69_120_000L)
    }

    @Test
    fun `a call that ended asks nothing more, and the end disarms everything`() = runTest(UnconfinedTestDispatcher()) {
        val (turnCredentials, host) = controller()
        turnCredentials.schedule(ttlSeconds = 3_600)
        host.callState = CallState.Ended(CallEndReason.Local)
        timer.fire(2_880_000L)
        verify(exactly = 0) { signals.emitRequestIceServers(any()) }

        host.callState = CallState.Connected
        turnCredentials.schedule(ttlSeconds = 3_600)
        turnCredentials.cancelAll()
        assertThat(timer.live).isEmpty()
    }

    @Test
    fun `each reconnection attempt cancels the deadline and asks once for a fresh set, watchdog armed`() =
        runTest(UnconfinedTestDispatcher()) {
            val (turnCredentials, host) = controller()
            turnCredentials.afterConfigure("call-1", turn, ttlSeconds = 3_600)

            host.callState = CallState.Reconnecting(1)
            turnCredentials.onTransition(CallState.Connected, host.callState)

            verify(exactly = 1) { signals.emitRequestIceServers("call-1") }
            assertThat(timer.live).containsExactly(8_000L)

            turnCredentials.onTransition(host.callState, host.callState)
            verify(exactly = 1) { signals.emitRequestIceServers("call-1") }

            host.callState = CallState.Reconnecting(2)
            turnCredentials.onTransition(CallState.Reconnecting(1), host.callState)
            verify(exactly = 2) { signals.emitRequestIceServers("call-1") }
            assertThat(timer.live).containsExactly(8_000L)

            turnCredentials.schedule(ttlSeconds = 600)
            assertThat(timer.live).containsExactly(480_000L)
        }

    @Test
    fun `a reconnection without a joined call asks nothing`() = runTest(UnconfinedTestDispatcher()) {
        val (turnCredentials, host) = controller()
        host.callId = ""
        host.callState = CallState.Reconnecting(1)
        turnCredentials.onTransition(CallState.Connected, host.callState)
        verify(exactly = 0) { signals.emitRequestIceServers(any()) }
    }
}
