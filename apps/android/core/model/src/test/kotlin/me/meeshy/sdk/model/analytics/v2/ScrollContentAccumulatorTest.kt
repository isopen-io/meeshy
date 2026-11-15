package me.meeshy.sdk.model.analytics.v2

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.analytics.v2.ScrollContentSummary.ContentKind
import org.junit.Test

class ScrollContentAccumulatorTest {

    @Test
    fun `un carrousel garde l'index maximal et compte les glissements`() {
        val a = ScrollContentAccumulator(ContentKind.CAROUSEL, itemsTotal = 5, startedAtMs = 1_000)
        a.noteIndex(0); a.noteIndex(1); a.noteIndex(3); a.noteIndex(2)
        val s = a.finish(4_000)!!
        assertThat(s.maxIndexReached).isEqualTo(3)
        assertThat(s.swipes).isEqualTo(3)
        assertThat(s.itemsTotal).isEqualTo(5)
        assertThat(s.durationMs).isEqualTo(3_000)
    }

    @Test
    fun `un texte long garde la fraction parcourue et le lu jusqu'au bout`() {
        val a = ScrollContentAccumulator(ContentKind.LONG_TEXT, startedAtMs = 0)
        a.noteScroll(0.4, readThrough = 0.2)
        a.noteScroll(0.9, readThrough = 0.7)
        a.noteScroll(0.5)
        val s = a.finish(10)!!
        assertThat(s.maxScrollFraction).isEqualTo(0.9)
        assertThat(s.readThroughFraction).isEqualTo(0.7)
    }

    @Test
    fun `sans lu jusqu'au bout declare, il suit la fraction parcourue`() {
        val a = ScrollContentAccumulator(ContentKind.COMMENTS, startedAtMs = 0)
        a.noteScroll(0.6)
        assertThat(a.finish(1)!!.readThroughFraction).isEqualTo(0.6)
    }

    @Test
    fun `un lecteur qui n'a pas bouge n'emet rien`() {
        assertThat(ScrollContentAccumulator(ContentKind.CAROUSEL, 3, 0).finish(5_000)).isNull()
        assertThat(ScrollContentAccumulator(ContentKind.LONG_TEXT, null, 0).finish(5_000)).isNull()
    }

    @Test
    fun `l'index zero seul n'est pas un glissement`() {
        val a = ScrollContentAccumulator(ContentKind.CAROUSEL, 3, 0)
        a.noteIndex(0)
        val s = a.finish(1)!!
        assertThat(s.swipes).isEqualTo(0)
        assertThat(s.maxIndexReached).isEqualTo(0)
    }
}
