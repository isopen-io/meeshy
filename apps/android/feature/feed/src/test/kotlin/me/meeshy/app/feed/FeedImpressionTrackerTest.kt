package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FeedImpressionTrackerTest {

    private class Sink {
        val recorded = mutableListOf<Pair<String, Boolean>>()
        var flushes = 0
        val tracker = FeedImpressionTracker(
            record = { id, isVideo -> recorded += id to isVideo },
            flush = { flushes += 1 },
        )
    }

    private fun sink() = Sink()

    @Test
    fun `a card that leaves and comes back counts twice`() {
        val s = sink()
        val post = feedPostPresentation(id = "p1")
        s.tracker.appeared(post)
        s.tracker.appeared(post)
        assertThat(s.recorded.map { it.first }).containsExactly("p1", "p1").inOrder()
        assertThat(s.tracker.counted).isEqualTo(2)
    }

    @Test
    fun `the kind of the card travels with its impression`() {
        val s = sink()
        s.tracker.appeared(feedPostPresentation(id = "p1"))
        s.tracker.appeared(feedPostPresentation(id = "r1").copy(isReel = true))
        assertThat(s.recorded).containsExactly("p1" to false, "r1" to true).inOrder()
    }

    @Test
    fun `an empty id is not a card`() {
        val s = sink()
        s.tracker.appeared(feedPostPresentation(id = ""))
        assertThat(s.recorded).isEmpty()
    }

    @Test
    fun `leaving the screen flushes the pending batch instead of dropping it`() {
        val s = sink()
        s.tracker.appeared(feedPostPresentation(id = "p1"))
        s.tracker.exited()
        assertThat(s.flushes).isEqualTo(1)
    }
}
