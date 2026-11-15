package me.meeshy.sdk.model.presence

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ViewingReporterLawTest {

    private fun idle() = ViewingReporterState()

    private fun run(
        vararg steps: ViewingInput,
        from: ViewingReporterState = idle(),
        at: Long = 0L,
    ): Pair<ViewingReporterState, List<ViewingCommand>> {
        var state = from
        val emitted = mutableListOf<ViewingCommand>()
        steps.forEach { input ->
            val step = ViewingReporterLaw.reduce(state, input, at)
            state = step.state
            emitted += step.commands
        }
        return state to emitted
    }

    private fun at(state: ViewingReporterState, input: ViewingInput, nowMillis: Long) =
        ViewingReporterLaw.reduce(state, input, nowMillis)

    @Test
    fun `opening a conversation in the foreground announces it`() {
        val (_, commands) = run(ViewingInput.Opened("c1"))
        assertThat(commands).containsExactly(ViewingCommand.Start("c1"))
    }

    @Test
    fun `opening in the background announces nothing until the app returns to the foreground`() {
        val (state, commands) = run(ViewingInput.Foreground(false), ViewingInput.Opened("c1"))
        assertThat(commands).isEmpty()
        val back = ViewingReporterLaw.reduce(state, ViewingInput.Foreground(true), 0L)
        assertThat(back.commands).containsExactly(ViewingCommand.Start("c1"))
    }

    @Test
    fun `going to the background stops the announced conversation`() {
        val (_, commands) = run(ViewingInput.Opened("c1"), ViewingInput.Foreground(false))
        assertThat(commands).containsExactly(ViewingCommand.Start("c1"), ViewingCommand.Stop("c1")).inOrder()
    }

    @Test
    fun `a screen pushed above the conversation stops it and its return restarts it`() {
        val (_, commands) = run(
            ViewingInput.Opened("c1"),
            ViewingInput.ScreenAppeared("c1"),
            ViewingInput.ScreenDisappeared("c1"),
            ViewingInput.ScreenAppeared("c1"),
        )
        assertThat(commands).containsExactly(
            ViewingCommand.Start("c1"),
            ViewingCommand.Stop("c1"),
            ViewingCommand.Start("c1"),
        ).inOrder()
    }

    @Test
    fun `a conversation whose screen reported nothing counts as visible`() {
        val (state, _) = run(ViewingInput.Opened("c1"))
        assertThat(state.announced).isEqualTo("c1")
    }

    @Test
    fun `the call screen stops the conversation and its end restarts it`() {
        val (_, commands) = run(
            ViewingInput.Opened("c1"),
            ViewingInput.CallScreen(true),
            ViewingInput.CallScreen(false),
        )
        assertThat(commands).containsExactly(
            ViewingCommand.Start("c1"),
            ViewingCommand.Stop("c1"),
            ViewingCommand.Start("c1"),
        ).inOrder()
    }

    @Test
    fun `closing the last screen of a conversation stops it and reports it was the last`() {
        val (state, _) = run(ViewingInput.Opened("c1"))
        val step = ViewingReporterLaw.reduce(state, ViewingInput.Closed("c1"), 0L)
        assertThat(step.commands).containsExactly(ViewingCommand.Stop("c1"))
        assertThat(step.wasLastScreen).isTrue()
        assertThat(step.state.announced).isNull()
    }

    @Test
    fun `a late close of a replaced screen keeps the conversation announced`() {
        val (state, _) = run(ViewingInput.Opened("c1"), ViewingInput.Opened("c1"))
        val step = ViewingReporterLaw.reduce(state, ViewingInput.Closed("c1"), 0L)
        assertThat(step.commands).isEmpty()
        assertThat(step.wasLastScreen).isFalse()
        assertThat(step.state.announced).isEqualTo("c1")
    }

    @Test
    fun `reopening the same conversation re-announces it`() {
        val (_, commands) = run(ViewingInput.Opened("c1"), ViewingInput.Opened("c1"))
        assertThat(commands).containsExactly(ViewingCommand.Start("c1"), ViewingCommand.Start("c1"))
    }

    @Test
    fun `opening another conversation moves the announcement`() {
        val (_, commands) = run(ViewingInput.Opened("c1"), ViewingInput.Opened("c2"))
        assertThat(commands).containsExactly(
            ViewingCommand.Start("c1"),
            ViewingCommand.Stop("c1"),
            ViewingCommand.Start("c2"),
        ).inOrder()
    }

    @Test
    fun `reconnection re-announces the current conversation and nothing when none is shown`() {
        assertThat(run(ViewingInput.Reconnected).second).isEmpty()
        val (state, _) = run(ViewingInput.Opened("c1"))
        val step = ViewingReporterLaw.reduce(state, ViewingInput.Reconnected, 0L)
        assertThat(step.commands).containsExactly(ViewingCommand.Start("c1"))
    }

    @Test
    fun `reconnection in the background announces nothing`() {
        val (state, _) = run(ViewingInput.Opened("c1"), ViewingInput.Foreground(false))
        assertThat(ViewingReporterLaw.reduce(state, ViewingInput.Reconnected, 0L).commands).isEmpty()
    }

    @Test
    fun `activity is throttled to one event every two seconds`() {
        val (opened, _) = run(ViewingInput.Opened("c1"))
        val first = at(opened, ViewingInput.Activity("c1"), 10_000L)
        assertThat(first.commands).containsExactly(ViewingCommand.Activity("c1", focus = false))
        val tooSoon = at(first.state, ViewingInput.Activity("c1"), 11_999L)
        assertThat(tooSoon.commands).isEmpty()
        val later = at(tooSoon.state, ViewingInput.Activity("c1"), 12_000L)
        assertThat(later.commands).containsExactly(ViewingCommand.Activity("c1", focus = false))
    }

    @Test
    fun `activity for a conversation that is not announced is dropped`() {
        val (opened, _) = run(ViewingInput.Opened("c1"))
        assertThat(at(opened, ViewingInput.Activity("c2"), 0L).commands).isEmpty()
        val hidden = run(ViewingInput.Foreground(false), from = opened).first
        assertThat(at(hidden, ViewingInput.Activity("c1"), 0L).commands).isEmpty()
    }

    @Test
    fun `a cover makes activity carry focus and its start signals at once`() {
        val (opened, _) = run(ViewingInput.Opened("c1"))
        val begun = at(opened, ViewingInput.CoverBegan, 5_000L)
        assertThat(begun.commands).containsExactly(ViewingCommand.Activity("c1", focus = true))
        assertThat(begun.state.isCovered).isTrue()
    }

    @Test
    fun `nested covers signal only for the first and the last`() {
        val (opened, _) = run(ViewingInput.Opened("c1"))
        val first = at(opened, ViewingInput.CoverBegan, 0L)
        val second = at(first.state, ViewingInput.CoverBegan, 100L)
        assertThat(second.commands).isEmpty()
        val oneEnded = at(second.state, ViewingInput.CoverEnded, 200L)
        assertThat(oneEnded.commands).isEmpty()
        val lastEnded = at(oneEnded.state, ViewingInput.CoverEnded, 300L)
        assertThat(lastEnded.commands).containsExactly(ViewingCommand.Activity("c1", focus = false))
    }

    @Test
    fun `closing every conversation clears stuck covers`() {
        val (state, _) = run(ViewingInput.Opened("c1"), ViewingInput.CoverBegan, ViewingInput.Closed("c1"))
        assertThat(state.isCovered).isFalse()
    }

    @Test
    fun `scrolling signals at the first movement and the heartbeat sustains it`() {
        val (opened, _) = run(ViewingInput.Opened("c1"))
        val scrolling = at(opened, ViewingInput.Scrolling(true), 1_000L)
        assertThat(scrolling.commands).containsExactly(ViewingCommand.Activity("c1", focus = false))
        val beat = at(scrolling.state, ViewingInput.Heartbeat(isBusy = false), 3_000L)
        assertThat(beat.commands).containsExactly(ViewingCommand.Activity("c1", focus = false))
        val stopped = at(beat.state, ViewingInput.Scrolling(false), 3_100L)
        assertThat(at(stopped.state, ViewingInput.Heartbeat(isBusy = false), 9_000L).commands).isEmpty()
    }

    @Test
    fun `the heartbeat is sustained by a busy media or a cover and silent otherwise`() {
        val (opened, _) = run(ViewingInput.Opened("c1"))
        assertThat(at(opened, ViewingInput.Heartbeat(isBusy = false), 0L).commands).isEmpty()
        assertThat(at(opened, ViewingInput.Heartbeat(isBusy = true), 0L).commands)
            .containsExactly(ViewingCommand.Activity("c1", focus = false))
    }

    @Test
    fun `a touch in the thread signals activity`() {
        val (opened, _) = run(ViewingInput.Opened("c1"))
        assertThat(at(opened, ViewingInput.Touched, 0L).commands)
            .containsExactly(ViewingCommand.Activity("c1", focus = false))
    }
}
