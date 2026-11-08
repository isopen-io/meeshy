package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.PlaybackStretch
import me.meeshy.sdk.model.media.StretchEnd
import org.junit.Test

class ListenSegmentTrackerTest {

    private fun report(tracker: ListenSegmentTracker, at: Long = 0L, total: Long = 10_000L) =
        tracker.drainReport(at, total)

    @Test
    fun `une ecoute continue donne une plage fermee par la pause`() {
        val (body, _) = report(ListenSegmentTracker().begin(0).pause(4_000L), at = 4_000L)

        assertThat(body!!.stretches).containsExactly(PlaybackStretch(0, 4_000, StretchEnd.PAUSE))
        assertThat(body.complete).isFalse()
        assertThat(body.action).isEqualTo("listened")
    }

    @Test
    fun `un saut de curseur coupe la plage en cours et en ouvre une autre`() {
        val tracker = ListenSegmentTracker().begin(0).seek(2_000L, 7_000L).pause(9_000L)

        val (body, _) = report(tracker, at = 9_000L)

        assertThat(body!!.stretches).containsExactly(
            PlaybackStretch(0, 2_000, StretchEnd.SEEK),
            PlaybackStretch(7_000, 9_000, StretchEnd.PAUSE),
        ).inOrder()
    }

    @Test
    fun `parcourir la barre a l'arret ne fabrique aucune ecoute`() {
        val (body, _) = report(ListenSegmentTracker().seek(0L, 5_000L))

        assertThat(body).isNull()
    }

    @Test
    fun `la fin naturelle est comptee une seule fois`() {
        val tracker = ListenSegmentTracker().begin(0).completed(10_000L).completed(10_000L)

        val (body, drained) = report(tracker, at = 10_000L)

        assertThat(body!!.complete).isTrue()
        assertThat(body.stretches).hasSize(1)
        assertThat(drained.completed(10_000L).drainReport(10_000L, 10_000L).first).isNull()
    }

    @Test
    fun `une nouvelle ecoute rearme la completion`() {
        val first = ListenSegmentTracker().begin(0).completed(10_000L).drainReport(10_000L, 10_000L).second

        val (body, _) = first.begin(0).completed(10_000L).drainReport(10_000L, 10_000L)

        assertThat(body!!.complete).isTrue()
    }

    @Test
    fun `lacher un vocal en cours cloture sans le terminer`() {
        val (body, _) = report(ListenSegmentTracker().begin(1_000L).dismissed(3_000L), at = 3_000L)

        assertThat(body!!.stretches).containsExactly(PlaybackStretch(1_000, 3_000, StretchEnd.DISMISSED))
        assertThat(body.complete).isFalse()
    }

    @Test
    fun `vider ne perd pas la plage encore ouverte`() {
        val (_, drained) = report(ListenSegmentTracker().begin(0).seek(1_000L, 2_000L))

        assertThat(drained.hasOpenSegment).isTrue()
    }

    @Test
    fun `rien a dire sans plage ni completion`() {
        assertThat(report(ListenSegmentTracker()).first).isNull()
    }
}
