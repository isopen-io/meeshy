package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.TelecomConnectionUpdate
import me.meeshy.sdk.model.call.TelecomSystemRequest
import me.meeshy.sdk.model.ongoing.CallActivityPhase
import me.meeshy.sdk.model.ongoing.CallActivitySnapshot
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TelecomCallBridgeTest {

    private class FakeReporter : TelecomCallReporter {
        val incoming = MutableSharedFlow<TelecomSystemRequest>(extraBufferCapacity = 8)
        override val requests: Flow<TelecomSystemRequest> = incoming
        override fun report(update: TelecomConnectionUpdate) = Unit
        override fun release() = Unit
    }

    private class Recorder : ActiveCallCommands {
        val log = mutableListOf<String>()
        override fun hangUp() { log += "hangUp" }
        override fun toggleMute() { log += "toggleMute" }
        override fun answer() { log += "answer" }
        override fun decline() { log += "decline" }
    }

    private class Setup(val reporter: FakeReporter, val holder: ActiveCallSnapshotHolder, val commands: Recorder, val bridge: TelecomCallBridge)

    private fun kotlinx.coroutines.test.TestScope.setup(): Setup {
        val reporter = FakeReporter()
        val holder = ActiveCallSnapshotHolder()
        val commands = Recorder().also(holder::attach)
        val bridge = TelecomCallBridge(reporter, holder, UnconfinedTestDispatcher(testScheduler))
        return Setup(reporter, holder, commands, bridge)
    }

    private val session = CallSessionInfo(callId = "call-1", config = CallConfig.EMPTY)

    private fun Setup.enter(state: CallState) = bridge.onTransition(CallState.Idle, state, session)

    private fun snapshot(muted: Boolean) = CallActivitySnapshot(
        phase = CallActivityPhase.Connected,
        title = "Awa",
        statusLabel = "",
        initials = "A",
        isVideo = false,
        isMuted = muted,
        connectedSinceEpochMs = null,
        showsDurationInCompact = false,
        caption = null,
    )

    @Test
    fun `decrocher depuis le casque repond a l appel entrant`() = runTest {
        val s = setup()
        s.enter(CallState.Ringing(isOutgoing = false))

        s.reporter.incoming.tryEmit(TelecomSystemRequest.Answer)

        assertThat(s.commands.log).containsExactly("answer")
    }

    @Test
    fun `raccrocher pendant la sonnerie refuse l appel`() = runTest {
        val s = setup()
        s.enter(CallState.Ringing(isOutgoing = false))

        s.reporter.incoming.tryEmit(TelecomSystemRequest.Disconnect)

        assertThat(s.commands.log).containsExactly("decline")
    }

    @Test
    fun `raccrocher depuis la montre termine l appel en cours`() = runTest {
        val s = setup()
        s.enter(CallState.Connected)

        s.reporter.incoming.tryEmit(TelecomSystemRequest.Disconnect)

        assertThat(s.commands.log).containsExactly("hangUp")
    }

    @Test
    fun `une demande apres la fin de l appel est ignoree`() = runTest {
        val s = setup()
        s.enter(CallState.Connected)
        s.bridge.onTransition(CallState.Connected, CallState.Idle, session)

        s.reporter.incoming.tryEmit(TelecomSystemRequest.Disconnect)
        s.reporter.incoming.tryEmit(TelecomSystemRequest.Answer)

        assertThat(s.commands.log).isEmpty()
    }

    @Test
    fun `la mise en attente coupe le micro et la reprise le retablit`() = runTest {
        val s = setup()
        s.enter(CallState.Connected)
        s.holder.publish(snapshot(muted = false))

        s.reporter.incoming.tryEmit(TelecomSystemRequest.Hold(onHold = true))
        s.holder.publish(snapshot(muted = true))
        s.reporter.incoming.tryEmit(TelecomSystemRequest.Hold(onHold = false))

        assertThat(s.commands.log).containsExactly("toggleMute", "toggleMute").inOrder()
    }

    @Test
    fun `la reprise laisse un micro coupe par l utilisateur`() = runTest {
        val s = setup()
        s.enter(CallState.Connected)
        s.holder.publish(snapshot(muted = true))

        s.reporter.incoming.tryEmit(TelecomSystemRequest.Hold(onHold = true))
        s.reporter.incoming.tryEmit(TelecomSystemRequest.Hold(onHold = false))

        assertThat(s.commands.log).isEmpty()
    }

    @Test
    fun `le micro du systeme suit seulement quand il differe`() = runTest {
        val s = setup()
        s.enter(CallState.Connected)
        s.holder.publish(snapshot(muted = false))

        s.reporter.incoming.tryEmit(TelecomSystemRequest.Mute(muted = false))
        s.reporter.incoming.tryEmit(TelecomSystemRequest.Mute(muted = true))

        assertThat(s.commands.log).containsExactly("toggleMute")
    }
}
