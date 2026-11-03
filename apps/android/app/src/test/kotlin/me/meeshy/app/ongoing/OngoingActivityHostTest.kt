package me.meeshy.app.ongoing

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import me.meeshy.sdk.model.ongoing.LiveActivityPlan
import me.meeshy.sdk.model.ongoing.OngoingActivityKind
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OngoingActivityHostTest {

    private class RecordingSurface : OngoingSurface {
        val calls = mutableListOf<String>()
        override fun show(plan: LiveActivityPlan) { calls += "show:${plan.kind}:${plan.title}" }
        override fun conclude(plan: LiveActivityPlan, dismissAfterMs: Long) { calls += "conclude:${plan.kind}:$dismissAfterMs" }
        override fun cancel(kind: OngoingActivityKind) { calls += "cancel:$kind" }
        override fun cancelUnknown(keep: Set<OngoingActivityKind>) { calls += "orphans:${keep.sorted()}" }
    }

    private fun plan(title: String, kind: OngoingActivityKind = OngoingActivityKind.Outbox) = LiveActivityPlan(kind, title)

    private fun host(surface: RecordingSurface) =
        OngoingActivityHost(surface, CoroutineScope(UnconfinedTestDispatcher()))

    @Test
    fun `isRunning is a local read that follows start and end`() {
        val host = host(RecordingSurface())
        assertThat(host.isRunning(OngoingActivityKind.Outbox)).isFalse()
        host.start(plan("a"))
        assertThat(host.isRunning(OngoingActivityKind.Outbox)).isTrue()
        host.end(OngoingActivityKind.Outbox)
        assertThat(host.isRunning(OngoingActivityKind.Outbox)).isFalse()
    }

    @Test
    fun `effects run in the order of the requests`() {
        val surface = RecordingSurface()
        val host = host(surface)
        host.start(plan("a"))
        host.update(plan("b"))
        host.end(OngoingActivityKind.Outbox, plan("done"), 3_000L)
        assertThat(surface.calls).containsExactly("show:Outbox:a", "show:Outbox:b", "conclude:Outbox:3000").inOrder()
    }

    @Test
    fun `an update after the end does not bring the notification back`() {
        val surface = RecordingSurface()
        val host = host(surface)
        host.start(plan("a"))
        host.end(OngoingActivityKind.Outbox)
        host.update(plan("late"))
        assertThat(surface.calls).containsExactly("show:Outbox:a", "cancel:Outbox").inOrder()
    }

    @Test
    fun `orphans are ended without touching what the host runs`() {
        val surface = RecordingSurface()
        val host = host(surface)
        host.start(plan("call", OngoingActivityKind.Call))
        host.endOrphans()
        assertThat(surface.calls.last()).isEqualTo("orphans:[Call]")
    }

    @Test
    fun `a failing surface does not stop later effects`() {
        val calls = mutableListOf<String>()
        val surface = object : OngoingSurface {
            override fun show(plan: LiveActivityPlan) {
                if (plan.title == "boom") error("boom")
                calls += plan.title
            }
            override fun conclude(plan: LiveActivityPlan, dismissAfterMs: Long) = Unit
            override fun cancel(kind: OngoingActivityKind) = Unit
            override fun cancelUnknown(keep: Set<OngoingActivityKind>) = Unit
        }
        val host = OngoingActivityHost(surface, CoroutineScope(UnconfinedTestDispatcher()))
        host.start(plan("boom"))
        host.update(plan("after"))
        assertThat(calls).containsExactly("after")
    }
}
