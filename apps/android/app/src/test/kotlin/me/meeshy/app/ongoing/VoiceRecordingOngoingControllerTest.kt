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
    fun `the notification carries the conversation title and wakes for the level at most once a second`() = runTest {
        val started = MutableStateFlow<Long?>(null)
        val title = MutableStateFlow("Famille")
        val levels = MutableStateFlow<List<Float>>(emptyList())
        var now = 0L
        val shown = mutableListOf<VoiceRecordingSnapshot>()
        val sink = object : OngoingNotificationSink<VoiceRecordingSnapshot> {
            override fun show(snapshot: VoiceRecordingSnapshot) { shown += snapshot }
            override fun conclude(snapshot: VoiceRecordingSnapshot, dismissAfterMs: Long) = Unit
            override fun cancel() = Unit
        }
        VoiceRecordingOngoingController(started, sink, title, levels, { now }) { VoiceRecordingActivityLaw.Wording("Recording") }
            .start(backgroundScope)
        runCurrent()

        started.value = 500L
        runCurrent()
        now = 400L
        levels.value = listOf(1f)
        runCurrent()
        now = 1_000L
        levels.value = listOf(1f, 1f)
        runCurrent()

        assertThat(shown.map { it.title }.toSet()).containsExactly("Famille")
        assertThat(shown.map { it.level }).containsExactly(0, 4).inOrder()
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

        bridge.updateTake("Famille", listOf(0.5f))
        assertThat(bridge.title.value).isEqualTo("Famille")
        bridge.retire()
        assertThat(bridge.startedAt.value).isNull()
        assertThat(bridge.title.value).isEmpty()
        assertThat(bridge.levels.value).isEmpty()
    }
}
