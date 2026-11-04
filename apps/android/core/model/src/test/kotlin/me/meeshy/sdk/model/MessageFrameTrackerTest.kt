package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageFrameTrackerTest {
    @Test fun `le plafond par defaut est de deux cents`() {
        assertThat(MessageFrameTracker<String>().maxEntries).isEqualTo(200)
    }

    @Test fun `un cadre publie se relit`() {
        val tracker = MessageFrameTracker<String>()
        tracker.update("m1", "a")
        assertThat(tracker.frame("m1")).isEqualTo("a")
        assertThat(tracker.frame("absent")).isNull()
    }

    @Test fun `au dela du plafond le moins recent est evince`() {
        val tracker = MessageFrameTracker<Int>(maxEntries = 3)
        (1..4).forEach { tracker.update("m$it", it) }
        assertThat(tracker.size).isEqualTo(3)
        assertThat(tracker.frame("m1")).isNull()
        assertThat(tracker.ids()).containsExactly("m2", "m3", "m4").inOrder()
    }

    @Test fun `republier un cadre le promeut au plus recent`() {
        val tracker = MessageFrameTracker<Int>(maxEntries = 3)
        (1..3).forEach { tracker.update("m$it", it) }
        tracker.update("m1", 10)
        tracker.update("m4", 4)
        assertThat(tracker.frame("m1")).isEqualTo(10)
        assertThat(tracker.frame("m2")).isNull()
    }

    @Test fun `un lot de cadres respecte le plafond`() {
        val tracker = MessageFrameTracker<Int>()
        tracker.update((1..250).associate { "m$it" to it })
        assertThat(tracker.size).isEqualTo(200)
        assertThat(tracker.frame("m50")).isNull()
        assertThat(tracker.frame("m51")).isEqualTo(51)
    }

    @Test fun `retirer un cadre le supprime de l ordre`() {
        val tracker = MessageFrameTracker<Int>(maxEntries = 3)
        tracker.update("m1", 1)
        tracker.update("m2", 2)
        tracker.removeFrame("m1")
        assertThat(tracker.ids()).containsExactly("m2")
    }
}
