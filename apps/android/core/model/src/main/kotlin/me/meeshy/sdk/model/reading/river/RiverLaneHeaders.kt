package me.meeshy.sdk.model.reading.river

import kotlin.math.max
import kotlin.math.min

/**
 * Le nom en tête d'une colonne et son opacité — miroir de `resolveRiverLaneHeaders`
 * (`river-lanes.ts`, amendement R3). Une colonne porte le nom de la voix qui l'occupe À LA HAUTEUR
 * OÙ L'ON LIT ; il s'allume à la naissance et s'éteint à la mort sur `fadeRanks` rangs. Les entrées
 * d'opacité nulle ne sont pas servies : un nom éteint ne se rend pas.
 */
object RiverLaneHeaders {

    /** Intervalle d'occupation d'une voix dans une colonne : un segment, ou un groupe en mode sérialisé. */
    private data class Occupancy(val laneId: String, val laneIndex: Int, val startRank: Int, val endRank: Int, val isOpen: Boolean)

    /**
     * Rampe symétrique mesurée depuis le VIDE qui borde l'occupation. Une occupation encore ouverte
     * emprunte sa borne de mort à la fenêtre, décalée de la largeur du fondu.
     */
    private fun alpha(occupancy: Occupancy, focusRank: Double, fadeRanks: Int, lastRank: Int): Double {
        val deathRank = if (occupancy.isOpen) lastRank + fadeRanks else occupancy.endRank
        val margin = min(focusRank - (occupancy.startRank - 1), deathRank + 1 - focusRank)
        if (margin <= 0) return 0.0
        return if (fadeRanks == 0) 1.0 else (margin / fadeRanks).coerceIn(0.0, 1.0)
    }

    /**
     * Sérialisé : les GROUPES de bulles consécutives d'un même auteur ; un avis système n'occupe rien.
     * Un groupe court de sa tête jusqu'à la bulle qui précède la tête suivante : une passe LINÉAIRE,
     * car la peau rappelle cette loi à chaque image de défilement.
     */
    private fun serializedOccupancies(geometry: RiverGeometry): List<Occupancy> {
        val voices = geometry.bubbles.filter { !it.isSystem }
        val heads = voices.indices.filter { it == 0 || voices[it].isFirstInGroup }
        return heads.mapIndexed { order, headIndex ->
            val lastIndex = heads.getOrNull(order + 1)?.minus(1) ?: voices.lastIndex
            Occupancy(voices[headIndex].laneId, 0, voices[headIndex].rank, voices[lastIndex].rank, false)
        }
    }

    private fun laneOccupancies(geometry: RiverGeometry): List<Occupancy> =
        geometry.lanes.flatMap { lane ->
            lane.spans.map { Occupancy(lane.laneId, lane.laneIndex, it.startRank, it.endRank, it.isOpen) }
        }

    fun resolveRiverLaneHeaders(input: ResolveRiverLaneHeadersInput): List<RiverLaneHeader> {
        val geometry = input.geometry
        val fadeRanks = max(0, input.fadeRanks ?: RiverLawConstants.HEADER_FADE_RANKS)
        val laneById = geometry.lanes.associateBy { it.laneId }
        val occupancies = if (geometry.layout == RiverLayout.SERIALIZED) serializedOccupancies(geometry) else laneOccupancies(geometry)

        return occupancies
            .mapNotNull { occupancy ->
                val lane = laneById[occupancy.laneId] ?: return@mapNotNull null
                val opacity = alpha(occupancy, input.focusRank, fadeRanks, geometry.rankCount - 1)
                if (opacity <= 0) null else RiverLaneHeader(occupancy.laneIndex, lane.laneId, lane.colorSeed, lane.isViewer, opacity)
            }
            .sortedWith(compareBy<RiverLaneHeader> { it.laneIndex }.thenByDescending { it.alpha }.thenBy { it.laneId })
    }
}
