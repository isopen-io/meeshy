package me.meeshy.sdk.model.reading.river

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
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

    /**
     * Le MEILLEUR de [runs] passages : une machine chargée (CI, suite parallèle, GC) ne fait
     * qu'AJOUTER du temps, jamais en retirer — le minimum mesure le coût de l'algorithme, pas celui
     * du voisinage. Un chemin quadratique reste hors budget à chaque passage, donc aussi au minimum :
     * le témoin rougit toujours sur l'ancien code (196 ms par appel d'en-têtes, délai dépassé à 60 000).
     */
    private fun fastestMillis(runs: Int, block: () -> Unit): Long =
        (1..runs).minOf {
            val start = System.nanoTime()
            block()
            (System.nanoTime() - start) / 1_000_000
        }

    @Test
    fun `une voix qui ne se tait jamais garde un segment unique, resolu sans recopie quadratique`() {
        val input = alternating(count = 60_000, voices = 1)
        RiverLaneResolver.resolveRiverLanes(alternating(count = 200, voices = 1))

        lateinit var geometry: RiverGeometry
        val elapsed = fastestMillis(runs = 3) { geometry = RiverLaneResolver.resolveRiverLanes(input) }

        assertThat(geometry.rankCount).isEqualTo(60_000)
        assertThat(geometry.lanes.single().spans.single().nodes).hasSize(60_000)
        assertThat(elapsed).isLessThan(500L)
    }

    @Test
    fun `une fenetre de silence serree fait autant de segments que de messages, bornes sans balayer tout le fil`() {
        val input = alternating(count = 60_000, voices = 1, silenceWindowMs = 1_000.0)
        RiverLaneResolver.resolveRiverLanes(alternating(count = 200, voices = 1, silenceWindowMs = 1_000.0))

        lateinit var geometry: RiverGeometry
        val elapsed = fastestMillis(runs = 3) { geometry = RiverLaneResolver.resolveRiverLanes(input) }

        val spans = geometry.lanes.single().spans
        assertThat(spans).hasSize(60_000)
        assertThat(spans.all { it.startRank == it.endRank }).isTrue()
        assertThat(spans.last().isOpen).isTrue()
        assertThat(elapsed).isLessThan(500L)
    }

    private fun serializedFocus(count: Int): ResolveRiverLaneHeadersInput {
        val geometry = RiverLaneResolver.resolveRiverLanes(alternating(count = count, voices = 2))
        assertThat(geometry.layout).isEqualTo(RiverLayout.SERIALIZED)
        return ResolveRiverLaneHeadersInput(geometry, focusRank = count / 2.0)
    }

    private fun fastestNanos(runs: Int, block: () -> Unit): Long =
        (1..runs).minOf {
            val start = System.nanoTime()
            block()
            System.nanoTime() - start
        }

    /**
     * Les en-têtes se rappellent à chaque image de défilement : leur coût doit croître COMME le fil, pas
     * comme son carré. On mesure la PENTE, jamais un seuil en millisecondes — un seuil absolu dépend de la
     * machine (un runner de CI chargé dépassait les 16 ms d'une image sur un code linéaire). Huit fois plus
     * de bulles coûtent 4 à 8× en linéaire, 44× sur l'ancienne recopie quadratique des groupes (196 ms à
     * 40 000) ; la frontière à 24× reste loin de l'une et de l'autre.
     * Chaque taille est préchauffée puis mesurée au MEILLEUR de plusieurs passages : la charge ne fait
     * qu'ajouter du temps, le minimum mesure l'algorithme.
     */
    @Test
    fun `les en-tetes d un fil serialise croissent lineairement avec le nombre de bulles`() {
        val small = serializedFocus(count = 5_000)
        val large = serializedFocus(count = 40_000)
        repeat(10) {
            RiverLaneHeaders.resolveRiverLaneHeaders(small)
            RiverLaneHeaders.resolveRiverLaneHeaders(large)
        }

        lateinit var headers: List<RiverLaneHeader>
        val smallNanos = fastestNanos(runs = 15) { RiverLaneHeaders.resolveRiverLaneHeaders(small) }
        val largeNanos = fastestNanos(runs = 15) { headers = RiverLaneHeaders.resolveRiverLaneHeaders(large) }

        assertThat(headers.map { it.laneId }).containsExactly("u0")
        assertWithMessage("5 000 bulles : %s ns ; 40 000 bulles : %s ns", smallNanos, largeNanos)
            .that(largeNanos)
            .isLessThan(smallNanos * 24)
    }
}
