package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallCaptureKind
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallMediaTogglePayload
import me.meeshy.sdk.model.call.CallParticipantLeftPayload
import me.meeshy.sdk.model.call.CallQualityAlertPayload
import me.meeshy.sdk.model.call.CallScreenCaptureAlertPayload
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.Test

/**
 * #17963 (R1.8, loi 13) — ma capture d'écran pendant l'appel : le fil prévient les autres, MON journal vivant garde la ligne
 * aussitôt (iOS `CallAppStateObserver.report` → `captureJournal.record(.local)`), et je ne vois jamais ma propre puce
 * (iOS `CallCaptureLedger`, `!signal.isLocal`). La passerelle ne me renvoie pas l'alerte (`socket.to`) : sans cette ligne
 * locale, ma capture n'entrait au journal qu'après l'appel.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallSelfCaptureJournalTest {

    private class FakeHost(override val scope: CoroutineScope) : CallSessionHost {
        override val config = CallConfig.EMPTY
        override val callId = "call-9"
        override val selfId = "me"
        override val callState: CallState = CallState.Connected
        override val elapsedSeconds = 760L
        var publishes = 0
        override fun dispatch(event: CallEvent) = Unit
        override fun endMedia() = Unit
        override fun restartMediaIce() = Unit
        override fun publish() { publishes++ }
    }

    private class Rig(scope: TestScope) {
        val signals: CallSignalManager = mockk(relaxed = true)
        val recording = MutableSharedFlow<Boolean>(extraBufferCapacity = 8)
        val screenshots = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
        val host = FakeHost(scope.backgroundScope)
        val controller: CallPeerIndicatorsController

        init {
            every { signals.qualityAlerts } returns MutableSharedFlow<CallQualityAlertPayload>()
            every { signals.screenCaptureAlerts } returns MutableSharedFlow<CallScreenCaptureAlertPayload>()
            every { signals.participantLeft } returns MutableSharedFlow<CallParticipantLeftPayload>()
            every { signals.mediaToggles } returns MutableSharedFlow<CallMediaTogglePayload>()
            controller = CallPeerIndicatorsController(
                signals = signals,
                qualityResetTimer = object : CallQualityResetTimer {
                    override fun countdown(): Flow<Unit> = emptyFlow()
                },
                screenRecordingDetector = object : ScreenRecordingDetector {
                    override val states: Flow<Boolean> = recording
                },
                screenshotResetTimer = { emptyFlow() },
                screenshotSignals = object : CallScreenshotSignals {
                    override val captures: Flow<Unit> = screenshots
                },
            ).also {
                it.attach(host)
                it.onTransition(CallState.Connected)
            }
        }
    }

    @Test
    fun `my screenshot enters my live journal at once, as mine, and never shows me the chip`() = runTest(StandardTestDispatcher()) {
        val r = Rig(this)
        runCurrent()

        r.screenshots.emit(Unit); runCurrent()

        verify(exactly = 1) { r.signals.emitScreenCaptureDetected("call-9", "me", true, CallCaptureKind.SCREENSHOT) }
        val line = r.controller.indicators.liveCaptures.single()
        assertThat(line.kind).isEqualTo(CallCaptureKind.SCREENSHOT)
        assertThat(line.userId).isEqualTo("me")
        assertThat(line.isLocal).isTrue()
        assertThat(line.elapsedLabel).isEqualTo("12:40")
        assertThat(r.controller.indicators.screenCapture.isShown).isFalse()
        assertThat(r.host.publishes).isAtLeast(1)
    }

    @Test
    fun `two screenshots within the window write one line, like the gateway`() = runTest(StandardTestDispatcher()) {
        val r = Rig(this)
        runCurrent()

        r.screenshots.emit(Unit); runCurrent()
        r.screenshots.emit(Unit); runCurrent()

        verify(exactly = 2) { r.signals.emitScreenCaptureDetected("call-9", "me", true, CallCaptureKind.SCREENSHOT) }
        assertThat(r.controller.indicators.liveCaptures).hasSize(1)
    }

    @Test
    fun `my screen recording notes its start, never its end, and never shows me the chip`() = runTest(StandardTestDispatcher()) {
        val r = Rig(this)
        runCurrent()

        r.recording.emit(true); runCurrent()
        r.recording.emit(false); runCurrent()

        val line = r.controller.indicators.liveCaptures.single()
        assertThat(line.kind).isEqualTo(CallCaptureKind.RECORDING)
        assertThat(line.isLocal).isTrue()
        assertThat(r.controller.indicators.screenCapture.isShown).isFalse()
    }

    @Test
    fun `a repeated recording state writes nothing more`() = runTest(StandardTestDispatcher()) {
        val r = Rig(this)
        runCurrent()

        r.recording.emit(false); runCurrent()
        r.recording.emit(true); runCurrent()
        r.recording.emit(true); runCurrent()

        assertThat(r.controller.indicators.liveCaptures).hasSize(1)
    }
}
