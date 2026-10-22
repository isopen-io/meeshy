package me.meeshy.sdk.model.analytics.v2

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ScrollListingSessionTest {

    @Test
    fun `un segment part quand le passage depasse 60 s puis la numerotation continue`() {
        val s = ScrollListingSession("l1", startedAtMs = 0)
        assertThat(s.sample(0.0, 0)).isNull()
        val segment = s.sample(100.0, 60_000)!!
        assertThat(segment.segment).isEqualTo(0)
        assertThat(segment.durationMs).isEqualTo(60_000)
        s.sample(150.0, 60_200)
        assertThat(s.finish(61_000)!!.segment).isEqualTo(1)
    }

    @Test
    fun `la fin d'un passage immobile apres un segment n'emet rien`() {
        val s = ScrollListingSession("l1", startedAtMs = 0)
        s.sample(0.0, 0)
        s.sample(100.0, 60_000)
        assertThat(s.finish(60_000)).isNull()
    }

    @Test
    fun `le premier segment est emis meme sans mouvement`() {
        assertThat(ScrollListingSession("l1", 0).finish(500)!!.durationMs).isEqualTo(500)
    }

    @Test
    fun `le segment suivant repart de la position atteinte`() {
        val s = ScrollListingSession("l1", 0)
        s.noteRendered(7)
        s.sample(0.0, 0)
        s.sample(10.0, 60_000)
        s.noteViewable()
        val next = s.finish(61_000)!!
        assertThat(next.maxPosition).isEqualTo(7)
        assertThat(next.itemsViewable).isEqualTo(1)
        assertThat(next.distancePt).isEqualTo(0)
    }

    @Test
    fun `30 s sans defilement suivies d'une reprise ferment le passage et en ouvrent un nouveau`() {
        var n = 0
        val p = ScrollListingPassages { "id-${n++}" }
        assertThat(p.noteOffset(0.0, 0)).isEmpty()
        assertThat(p.noteOffset(80.0, 1_000)).isEmpty()
        val out = p.noteOffset(90.0, 32_000)
        assertThat(out.map { it.listingSessionId }).containsExactly("id-0")
        val last = p.finish(33_000)!!
        assertThat(last.listingSessionId).isEqualTo("id-1")
    }

    @Test
    fun `exactement 30 s d'ecart ne coupe pas le passage`() {
        val p = ScrollListingPassages { "id" }
        p.noteOffset(0.0, 0)
        assertThat(p.noteOffset(10.0, 30_000)).isEmpty()
    }

    @Test
    fun `l'arriere-plan sans passage ouvert n'emet rien`() {
        assertThat(ScrollListingPassages().finish(1_000)).isNull()
    }

    @Test
    fun `un segment de 60 s sort pendant le passage`() {
        val p = ScrollListingPassages { "id" }
        p.noteOffset(0.0, 0)
        (1..5).forEach { p.noteOffset(it * 10.0, it * 10_000) }
        val out = p.noteOffset(60.0, 60_000)
        assertThat(out).hasSize(1)
        assertThat(out.single().segment).isEqualTo(0)
    }
}
