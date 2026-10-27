package me.meeshy.app.ongoing

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ongoing.VoiceRecordingActivityLaw
import me.meeshy.sdk.model.ongoing.VoiceRecordingSnapshot
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class VoiceRecordingOngoingControllerTest {

    private class RecordingSink : OngoingNotificationSink<VoiceRecordingSnapshot> {
        val events = mutableListOf<String>()
        override fun show(snapshot: VoiceRecordingSnapshot) { events += "show:${snapshot.startedAtEpochMs}" }
        override fun conclude(snapshot: VoiceRecordingSnapshot, dismissAfterMs: Long) { events += "conclude" }
        override fun cancel() { events += "cancel" }
    }

    @Test
    fun `the notification lives exactly as long as the take`() = runTest {
        val started = MutableStateFlow<Long?>(null)
        val sink = RecordingSink()
        VoiceRecordingOngoingController(started, sink) { VoiceRecordingActivityLaw.Wording("Recording") }.start(backgroundScope)
        runCurrent()
        assertThat(sink.events).isEmpty()

        started.value = 500L
        runCurrent()
        started.value = null
        runCurrent()

        assertThat(sink.events).containsExactly("show:500", "cancel").inOrder()
    }

    @Test
    fun `a bridge relays the stop button and forgets the take when retired`() = runTest {
        val bridge = VoiceRecordingActivityBridge()
        val stops = mutableListOf<Unit>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { bridge.stopRequests.collect { stops += it } }
        runCurrent()

        bridge.publish(7L)
        bridge.requestStop()
        runCurrent()
        assertThat(bridge.startedAt.value).isEqualTo(7L)
        assertThat(stops).hasSize(1)

        bridge.retire()
        assertThat(bridge.startedAt.value).isNull()
    }
}
