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

    private class FakeHold : CallHolding {
        val holds = mutableListOf<Boolean>()
        override val isOnHold = kotlinx.coroutines.flow.MutableStateFlow(false)
        override fun attach(host: CallHoldHost) = Unit
        override fun onTelecomHold(onHold: Boolean) { holds += onHold }
        override fun onAudioFocus(hasFocus: Boolean) = Unit
        override fun onSurvivalChanged(suspended: Boolean) = Unit
        override fun refusesCameraActivation(enabling: Boolean) = false
    }

    private class Setup(
        val reporter: FakeReporter,
        val holder: ActiveCallSnapshotHolder,
        val commands: Recorder,
        val bridge: TelecomCallBridge,
        val hold: FakeHold,
        val dtmfSent: MutableList<String>,
    )

    private fun kotlinx.coroutines.test.TestScope.setup(): Setup {
        val reporter = FakeReporter()
        val holder = ActiveCallSnapshotHolder()
        val commands = Recorder().also(holder::attach)
        val hold = FakeHold()
        val dtmfSent = mutableListOf<String>()
        val line = object : me.meeshy.sdk.call.CallDtmfLine {
            override val canInsert = true
            override fun insert(tones: String, durationMs: Int, interToneGapMs: Int): Boolean = dtmfSent.add(tones)
        }
        val bridge = TelecomCallBridge(
            reporter, holder, UnconfinedTestDispatcher(testScheduler), hold, me.meeshy.sdk.call.CallDtmf { line },
        )
        return Setup(reporter, holder, commands, bridge, hold, dtmfSent)
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

    @Test
    fun `la mise en attente du systeme est transmise a l appel actif`() = runTest {
        val s = setup()
        s.enter(CallState.Connected)

        s.reporter.incoming.tryEmit(TelecomSystemRequest.Hold(onHold = true))
        s.reporter.incoming.tryEmit(TelecomSystemRequest.Hold(onHold = false))

        assertThat(s.hold.holds).containsExactly(true, false).inOrder()
    }

    @Test
    fun `une mise en attente hors appel actif n est pas transmise`() = runTest {
        val s = setup()

        s.reporter.incoming.tryEmit(TelecomSystemRequest.Hold(onHold = true))

        assertThat(s.hold.holds).isEmpty()
    }

    @Test
    fun `le clavier d une voiture ou d une montre atteint le pair`() = runTest {
        val s = setup()
        s.enter(CallState.Connected)

        s.reporter.incoming.tryEmit(TelecomSystemRequest.Dtmf("12#"))

        assertThat(s.dtmfSent).containsExactly("12#")
    }

    @Test
    fun `des touches hors appel actif ne partent pas`() = runTest {
        val s = setup()

        s.reporter.incoming.tryEmit(TelecomSystemRequest.Dtmf("1"))

        assertThat(s.dtmfSent).isEmpty()
    }
}
