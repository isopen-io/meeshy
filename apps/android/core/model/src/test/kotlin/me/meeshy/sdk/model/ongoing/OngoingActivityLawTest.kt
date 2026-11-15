package me.meeshy.sdk.model.ongoing

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ongoing.OngoingActivityLaw.Effect
import me.meeshy.sdk.model.ongoing.OngoingActivityLaw.Request
import me.meeshy.sdk.model.ongoing.OngoingActivityLaw.State
import org.junit.Test

class OngoingActivityLawTest {

    private fun plan(kind: OngoingActivityKind = OngoingActivityKind.Outbox, title: String = "t") =
        LiveActivityPlan(kind = kind, title = title)

    @Test
    fun `starting an activity shows it and marks it running`() {
        val step = OngoingActivityLaw.reduce(State(), Request.Start(plan()))
        assertThat(step.effect).isEqualTo(Effect.Show(plan()))
        assertThat(step.state.isRunning(OngoingActivityKind.Outbox)).isTrue()
    }

    @Test
    fun `an update after the end does not bring the activity back`() {
        val running = OngoingActivityLaw.reduce(State(), Request.Start(plan())).state
        val ended = OngoingActivityLaw.reduce(running, Request.End(OngoingActivityKind.Outbox, null, 0L)).state
        val step = OngoingActivityLaw.reduce(ended, Request.Update(plan(title = "late")))
        assertThat(step.effect).isEqualTo(Effect.None)
        assertThat(step.state.isRunning(OngoingActivityKind.Outbox)).isFalse()
    }

    @Test
    fun `an identical update is a no-op and a changed one shows`() {
        val running = OngoingActivityLaw.reduce(State(), Request.Start(plan())).state
        assertThat(OngoingActivityLaw.reduce(running, Request.Update(plan())).effect).isEqualTo(Effect.None)
        assertThat(OngoingActivityLaw.reduce(running, Request.Update(plan(title = "b"))).effect)
            .isEqualTo(Effect.Show(plan(title = "b")))
    }

    @Test
    fun `starting a running activity updates it instead of opening a second one`() {
        val running = OngoingActivityLaw.reduce(State(), Request.Start(plan())).state
        val step = OngoingActivityLaw.reduce(running, Request.Start(plan(title = "b")))
        assertThat(step.state.running).hasSize(1)
        assertThat(step.effect).isEqualTo(Effect.Show(plan(title = "b")))
    }

    @Test
    fun `ending with an outcome concludes it and stops being running`() {
        val running = OngoingActivityLaw.reduce(State(), Request.Start(plan())).state
        val outcome = plan(title = "sent").copy(isOngoing = false)
        val step = OngoingActivityLaw.reduce(running, Request.End(OngoingActivityKind.Outbox, outcome, 3_000L))
        assertThat(step.effect).isEqualTo(Effect.Conclude(outcome, 3_000L))
        assertThat(step.state.isRunning(OngoingActivityKind.Outbox)).isFalse()
    }

    @Test
    fun `ending without outcome cancels the notification`() {
        val running = OngoingActivityLaw.reduce(State(), Request.Start(plan())).state
        val step = OngoingActivityLaw.reduce(running, Request.End(OngoingActivityKind.Outbox, null, 0L))
        assertThat(step.effect).isEqualTo(Effect.Cancel(OngoingActivityKind.Outbox))
    }

    @Test
    fun `ending an activity that is not running does nothing`() {
        val step = OngoingActivityLaw.reduce(State(), Request.End(OngoingActivityKind.Call, null, 0L))
        assertThat(step.effect).isEqualTo(Effect.None)
    }

    @Test
    fun `orphans are every notification the host does not own`() {
        val running = OngoingActivityLaw.reduce(State(), Request.Start(plan(OngoingActivityKind.Call))).state
        val step = OngoingActivityLaw.reduce(running, Request.EndOrphans)
        assertThat(step.effect).isEqualTo(Effect.CancelUnknown(setOf(OngoingActivityKind.Call)))
    }

    @Test
    fun `each kind has a distinct stable notification id`() {
        val ids = OngoingActivityKind.entries.map { it.notificationId }
        assertThat(ids.toSet()).hasSize(ids.size)
    }
}
