package me.meeshy.app.ongoing

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ongoing.OutboxActivityItem
import me.meeshy.sdk.model.ongoing.OutboxActivityKind
import me.meeshy.sdk.model.ongoing.OutboxActivityLaw
import me.meeshy.sdk.model.ongoing.OutboxActivityPhase
import me.meeshy.sdk.model.ongoing.OutboxActivitySnapshot
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OutboxOngoingControllerTest {

    private class RecordingSink : OngoingNotificationSink<OutboxActivitySnapshot> {
        val events = mutableListOf<String>()
        override fun show(snapshot: OutboxActivitySnapshot) { events += "show:${snapshot.phase}:${snapshot.remaining}" }
        override fun conclude(snapshot: OutboxActivitySnapshot, dismissAfterMs: Long) { events += "conclude:${snapshot.phase}:$dismissAfterMs" }
        override fun cancel() { events += "cancel" }
    }

    private val wording = OutboxActivityLaw.Wording("story", "media", "message", "sent", "failed")
    private fun upload(id: String, terminal: Boolean = false) = OutboxActivityItem(id, OutboxActivityKind.Media, terminal)

    private class Fixture {
        val items = MutableStateFlow<List<OutboxActivityItem>>(emptyList())
        val offline = MutableStateFlow(false)
        val foreground = MutableStateFlow(false)
        val sink = RecordingSink()
    }

    private fun Fixture.controller() = OutboxOngoingController(
        items = items, isOffline = offline, isForeground = foreground, sink = sink, wording = { wording },
    )

    @Test
    fun `an upload in the background opens the notification then concludes as sent`() = runTest {
        val f = Fixture()
        val job = f.controller().start(backgroundScope)
        runCurrent()

        f.items.value = listOf(upload("a"))
        advanceTimeBy(1_100)
        f.items.value = emptyList()
        advanceTimeBy(1_100)

        assertThat(f.sink.events).containsExactly("show:Sending:1", "conclude:Sent:3000").inOrder()
        job.cancel()
    }

    @Test
    fun `nothing is posted while the app is in the foreground and the notification arrives on leaving`() = runTest {
        val f = Fixture().also { it.foreground.value = true }
        f.controller().start(backgroundScope)
        runCurrent()

        f.items.value = listOf(upload("a"))
        advanceTimeBy(1_100)
        assertThat(f.sink.events.filter { it.startsWith("show") }).isEmpty()

        f.foreground.value = false
        runCurrent()
        assertThat(f.sink.events.last()).isEqualTo("show:Sending:1")

        f.foreground.value = true
        runCurrent()
        assertThat(f.sink.events.last()).isEqualTo("cancel")
    }

    @Test
    fun `a burst of queue changes wakes the notification at most once a second`() = runTest {
        val f = Fixture()
        f.controller().start(backgroundScope)
        runCurrent()

        f.items.value = listOf(upload("a"))
        runCurrent()
        f.items.value = listOf(upload("a"), upload("b"))
        f.items.value = listOf(upload("a"), upload("b"), upload("c"))
        runCurrent()
        assertThat(f.sink.events).containsExactly("show:Sending:1")

        advanceTimeBy(1_100)
        assertThat(f.sink.events).containsExactly("show:Sending:1", "show:Sending:3").inOrder()
    }

    @Test
    fun `a failed upload concludes as failed and stays longer`() = runTest {
        val f = Fixture()
        f.controller().start(backgroundScope)
        runCurrent()

        f.items.value = listOf(upload("a"))
        advanceTimeBy(1_100)
        f.items.value = listOf(upload("a", terminal = true))
        advanceTimeBy(1_100)

        assertThat(f.sink.events.last()).isEqualTo("conclude:${OutboxActivityPhase.Failed}:8000")
    }
}
