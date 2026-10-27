package me.meeshy.sdk.model.reading.river

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Un long fil se résout en temps LINÉAIRE : les en-têtes se recalculent à chaque image de
 * défilement, la géométrie à chaque message reçu. Une réduction qui recopie sa liste à chaque pas
 * (`groups.dropLast(1) + …`) rend ces deux chemins quadratiques — invisible à 50 messages, une
 * seconde perdue à 30 000.
 */
class RiverVolumeTest {

    private fun alternating(count: Int, voices: Int, silenceWindowMs: Double? = null): ResolveRiverLanesInput = ResolveRiverLanesInput(
        messages = (0 until count).map {
            RiverMessageInput(id = "m%06d".format(it), senderId = "u${it % voices}", createdAtMs = 1.7e12 + it * 20_000.0)
        },
        participants = (0 until voices).map { RiverParticipantInput("u$it", "Voix $it") },
        viewerId = "u0",
        silenceWindowMs = silenceWindowMs,
    )

    private fun millis(block: () -> Unit): Long {
        val start = System.nanoTime()
        block()
        return (System.nanoTime() - start) / 1_000_000
    }

    @Test
    fun `une voix qui ne se tait jamais garde un segment unique, resolu sans recopie quadratique`() {
        val input = alternating(count = 60_000, voices = 1)
        RiverLaneResolver.resolveRiverLanes(alternating(count = 200, voices = 1))

        lateinit var geometry: RiverGeometry
        val elapsed = millis { geometry = RiverLaneResolver.resolveRiverLanes(input) }

        assertThat(geometry.rankCount).isEqualTo(60_000)
        assertThat(geometry.lanes.single().spans.single().nodes).hasSize(60_000)
        assertThat(elapsed).isLessThan(500L)
    }

    @Test
    fun `une fenetre de silence serree fait autant de segments que de messages, bornes sans balayer tout le fil`() {
        val input = alternating(count = 60_000, voices = 1, silenceWindowMs = 1_000.0)
        RiverLaneResolver.resolveRiverLanes(alternating(count = 200, voices = 1, silenceWindowMs = 1_000.0))

        lateinit var geometry: RiverGeometry
        val elapsed = millis { geometry = RiverLaneResolver.resolveRiverLanes(input) }

        val spans = geometry.lanes.single().spans
        assertThat(spans).hasSize(60_000)
        assertThat(spans.all { it.startRank == it.endRank }).isTrue()
        assertThat(spans.last().isOpen).isTrue()
        assertThat(elapsed).isLessThan(500L)
    }

    @Test
    fun `les en-tetes d un fil serialise de 40 000 bulles se calculent dans le budget d une image`() {
        val geometry = RiverLaneResolver.resolveRiverLanes(alternating(count = 40_000, voices = 2))
        assertThat(geometry.layout).isEqualTo(RiverLayout.SERIALIZED)
        val focus = ResolveRiverLaneHeadersInput(geometry, focusRank = 20_000.0)
        RiverLaneHeaders.resolveRiverLaneHeaders(focus)

        lateinit var headers: List<RiverLaneHeader>
        val elapsed = millis { repeat(10) { headers = RiverLaneHeaders.resolveRiverLaneHeaders(focus) } } / 10

        assertThat(headers.map { it.laneId }).containsExactly("u0")
        assertThat(elapsed).isLessThan(16L)
    }
}
