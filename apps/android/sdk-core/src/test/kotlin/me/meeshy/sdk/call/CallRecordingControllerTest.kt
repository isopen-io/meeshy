package me.meeshy.sdk.call

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallRecordingKind
import me.meeshy.sdk.model.call.CallRecordingNotice
import me.meeshy.sdk.model.call.CallRecordingPhase
import me.meeshy.sdk.model.call.CallRecordingRefusal
import me.meeshy.sdk.model.call.CallRecordingRequested
import me.meeshy.sdk.model.call.CallRecordingSocketEvent
import me.meeshy.sdk.model.call.CallRecordingStarted
import me.meeshy.sdk.model.call.CallRecordingStopped
import me.meeshy.sdk.model.call.CallRecordingLink
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CallRecordingApi
import org.junit.Test
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class CallRecordingControllerTest {

    private class FakeHost(
        override var recordingCallId: String? = "c1",
        override var isEstablished: Boolean = true,
        override val conversationId: String? = "conv",
    ) : CallRecordingHost

    private class FakeSignals : CallRecordingSignals {
        val flow = MutableSharedFlow<CallRecordingSocketEvent>(extraBufferCapacity = 16)
        override val events get() = flow
        var requestResult: Result<String> = Result.success("r1")
        val requests = mutableListOf<Pair<String, CallRecordingKind>>()
        val answers = mutableListOf<Triple<String, String, Boolean>>()
        val stops = mutableListOf<Pair<String, String>>()
        override suspend fun request(callId: String, kind: CallRecordingKind): Result<String> {
            requests += callId to kind
            return requestResult
        }
        override suspend fun answer(callId: String, recordingId: String, accepted: Boolean): Result<Unit> {
            answers += Triple(callId, recordingId, accepted)
            return Result.success(Unit)
        }
        override suspend fun stop(callId: String, recordingId: String): Result<Unit> {
            stops += callId to recordingId
            return Result.success(Unit)
        }
    }

    private class FakeCapturer(var starts: Boolean = true, var available: Boolean = true) : CallRecordingCapturer {
        override val isAvailable get() = available
        val started = mutableListOf<File>()
        var stopCount = 0
        val output = File.createTempFile("rec", ".m4a")
        override fun start(file: File, kind: CallRecordingKind): Boolean {
            started += file
            return starts
        }
        override fun stop(): File? {
            stopCount += 1
            return output
        }
    }

    private class FakeUploader(var result: Result<String> = Result.success("att1")) : CallRecordingUploader {
        override suspend fun upload(file: File, mimeType: String): Result<String> = result
    }

    private class Rig(
        val scope: TestScope,
        val host: FakeHost = FakeHost(),
        val signals: FakeSignals = FakeSignals(),
        val capturer: FakeCapturer = FakeCapturer(),
        val uploader: FakeUploader = FakeUploader(),
        val linker: CallRecordingApi = mockk(),
        endToEnd: Boolean = false,
    ) {
        val controller = CallRecordingController(
            signals, capturer, uploader, linker, { "me" },
            object : CallRecordingEncryptionGate {
                override suspend fun isEndToEnd(conversationId: String?): Boolean = endToEnd
            },
            scope.backgroundScope, {}, { File(System.getProperty("java.io.tmpdir")!!) },
        ).also { it.host = host }
    }

    private fun TestScope.rig(endToEnd: Boolean = false, build: Rig.() -> Unit = {}) =
        Rig(scope = this, endToEnd = endToEnd).also { build(it) }

    private val link = CallRecordingLink("r1", "m1", "att1")

    private fun requested(requester: String = "peer") =
        CallRecordingSocketEvent.Requested(CallRecordingRequested("c1", "r1", requester, listOf("me", "peer"), CallRecordingKind.AUDIO, null))

    private fun started(recorder: String) = CallRecordingSocketEvent.Started(CallRecordingStarted("c1", "r1", recorder, CallRecordingKind.AUDIO))

    private fun stopped(reason: String, wasRecording: Boolean = false) =
        CallRecordingSocketEvent.Stopped(CallRecordingStopped("c1", "r1", reason, null, wasRecording))

    @Test
    fun `asking sends the request and waits for everyone`() = runTest(UnconfinedTestDispatcher()) {
        val rig = rig()
        rig.controller.state.test {
            awaitItem()
            rig.controller.request(CallRecordingKind.VIDEO)
            val waiting = expectMostRecentItem().phase as CallRecordingPhase.Pending
            assertThat(waiting.mine).isTrue()
            assertThat(waiting.mustAnswer).isFalse()
        }
        assertThat(rig.signals.requests).containsExactly("c1" to CallRecordingKind.VIDEO)
    }

    @Test
    fun `nothing is requested before the call is established or while unavailable`() = runTest(UnconfinedTestDispatcher()) {
        val rig = rig { host.isEstablished = false }
        assertThat(rig.controller.mayRequest()).isFalse()
        assertThat(rig.controller.request(CallRecordingKind.AUDIO)).isNull()
        assertThat(rig.signals.requests).isEmpty()

        val unavailable = rig { capturer.available = false }
        assertThat(unavailable.controller.mayRequest()).isFalse()
    }

    @Test
    fun `a refused request returns to idle with the unavailable notice`() = runTest(UnconfinedTestDispatcher()) {
        val rig = rig { signals.requestResult = Result.failure(CallRecordingRefusal("NO_PEER_TO_CONSENT")) }
        rig.controller.request(CallRecordingKind.AUDIO)
        assertThat(rig.controller.state.value.phase).isEqualTo(CallRecordingPhase.Idle)
        assertThat(rig.controller.state.value.notice).isEqualTo(CallRecordingNotice.Unavailable("NO_PEER_TO_CONSENT"))
    }

    @Test
    fun `an end to end conversation refuses fail closed and never reaches the gateway`() = runTest(UnconfinedTestDispatcher()) {
        val rig = rig(endToEnd = true)
        rig.controller.request(CallRecordingKind.AUDIO)
        assertThat(rig.controller.state.value.phase).isEqualTo(CallRecordingPhase.Idle)
        assertThat(rig.controller.state.value.notice).isEqualTo(CallRecordingNotice.EndToEndRefused)
        assertThat(rig.signals.requests).isEmpty()
    }

    @Test
    fun `a participant is asked and answering sends the consent once`() = runTest(UnconfinedTestDispatcher()) {
        val rig = rig()
        rig.signals.flow.emit(requested())
        val phase = rig.controller.state.value.phase as CallRecordingPhase.Pending
        assertThat(phase.mustAnswer).isTrue()

        rig.controller.answer(accepted = true)
        rig.controller.answer(accepted = false)

        assertThat(rig.signals.answers).containsExactly(Triple("c1", "r1", true))
    }

    @Test
    fun `declining is sent to the gateway and the stop broadcast clears the card`() = runTest(UnconfinedTestDispatcher()) {
        val rig = rig()
        rig.signals.flow.emit(requested())
        rig.controller.answer(accepted = false)
        rig.signals.flow.emit(stopped("refused"))

        assertThat(rig.signals.answers.single().third).isFalse()
        assertThat(rig.controller.state.value.phase).isEqualTo(CallRecordingPhase.Idle)
        assertThat(rig.controller.state.value.notice).isEqualTo(CallRecordingNotice.Stopped("refused", false))
    }

    @Test
    fun `a started broadcast naming someone else shows the indicator without capturing`() = runTest(UnconfinedTestDispatcher()) {
        val rig = rig()
        rig.signals.flow.emit(requested())
        rig.signals.flow.emit(started("peer"))

        assertThat(rig.controller.state.value.phase.isRecording).isTrue()
        assertThat(rig.capturer.started).isEmpty()
    }

    @Test
    fun `capture starts only on the broadcast naming me and a timeout stops it`() = runTest(UnconfinedTestDispatcher()) {
        val rig = rig { coEvery { linker.link(any(), any(), any(), any()) } returns NetworkResult.Success(link) }
        rig.controller.request(CallRecordingKind.AUDIO)
        assertThat(rig.capturer.started).isEmpty()

        rig.signals.flow.emit(started("me"))
        assertThat(rig.capturer.started).hasSize(1)

        rig.signals.flow.emit(stopped("timeout", wasRecording = true))
        assertThat(rig.capturer.stopCount).isEqualTo(1)
        assertThat(rig.controller.state.value.phase).isEqualTo(CallRecordingPhase.Idle)
    }

    @Test
    fun `a stopped capture is uploaded linked and announced as saved`() = runTest(UnconfinedTestDispatcher()) {
        val rig = rig { coEvery { linker.link("c1", "r1", "att1", any()) } returns NetworkResult.Success(link) }
        rig.controller.request(CallRecordingKind.AUDIO)
        rig.signals.flow.emit(started("me"))
        rig.controller.stop()

        assertThat(rig.signals.stops).containsExactly("c1" to "r1")
        assertThat(rig.controller.state.value.notice).isEqualTo(CallRecordingNotice.Saved)
    }

    @Test
    fun `a failed upload announces the failure`() = runTest(UnconfinedTestDispatcher()) {
        val rig = rig { uploader.result = Result.failure(IllegalStateException("x")) }
        rig.controller.request(CallRecordingKind.AUDIO)
        rig.signals.flow.emit(started("me"))
        rig.controller.stop()

        assertThat(rig.controller.state.value.notice).isEqualTo(CallRecordingNotice.SaveFailed)
    }

    @Test
    fun `a capture that cannot start gives up and tells the gateway`() = runTest(UnconfinedTestDispatcher()) {
        val rig = rig { capturer.starts = false }
        rig.controller.request(CallRecordingKind.AUDIO)
        rig.signals.flow.emit(started("me"))

        assertThat(rig.controller.state.value.phase).isEqualTo(CallRecordingPhase.Idle)
        assertThat(rig.controller.state.value.notice).isEqualTo(CallRecordingNotice.SaveFailed)
        assertThat(rig.signals.stops).containsExactly("c1" to "r1")
    }

    @Test
    fun `broadcasts of another call are ignored`() = runTest(UnconfinedTestDispatcher()) {
        val rig = rig { host.recordingCallId = "other" }
        rig.signals.flow.emit(requested())
        assertThat(rig.controller.state.value.phase).isEqualTo(CallRecordingPhase.Idle)
    }

    @Test
    fun `the end of the call switches the recording off`() = runTest(UnconfinedTestDispatcher()) {
        val rig = rig { coEvery { linker.link(any(), any(), any(), any()) } returns NetworkResult.Success(link) }
        rig.controller.request(CallRecordingKind.AUDIO)
        rig.signals.flow.emit(started("me"))
        rig.controller.callEnded()

        assertThat(rig.controller.state.value.phase).isEqualTo(CallRecordingPhase.Idle)
        assertThat(rig.capturer.stopCount).isEqualTo(1)
    }

    @Test
    fun `dismissing clears the notice`() = runTest(UnconfinedTestDispatcher()) {
        val rig = rig()
        rig.signals.flow.emit(requested())
        rig.signals.flow.emit(stopped("refused"))
        rig.controller.dismissNotice()
        assertThat(rig.controller.state.value.notice).isNull()
    }
}
