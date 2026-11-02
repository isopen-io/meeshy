package me.meeshy.sdk.model.reading.river

import kotlin.math.abs

/**
 * Lectures de la géométrie et navigation à deux axes — miroir de `resolveRiverLivingLanes`,
 * `resolveRiverLaneAt` et `resolveRiverStep` (`river-lanes.ts`).
 */
object RiverLaneQueries {

    private fun spanCovering(lane: RiverLane, rank: Int): RiverLaneSpan? =
        lane.spans.firstOrNull { it.startRank <= rank && rank <= it.endRank }

    /**
     * Les branches VIVANTES à ce rang, par colonne croissante : la largeur réelle de l'axe horizontal
     * à cette hauteur. Sérialisée : `[0]` sur tout rang de la fenêtre, rien en dehors.
     */
    fun resolveRiverLivingLanes(geometry: RiverGeometry, rank: Int): List<Int> {
        if (geometry.layout == RiverLayout.SERIALIZED) {
            return if (rank in 0 until geometry.rankCount) listOf(0) else emptyList()
        }
        return geometry.lanes.filter { spanCovering(it, rank) != null }.map { it.laneIndex }.sorted()
    }

    /**
     * QUI occupe cette colonne à cette hauteur — `null` si elle est éteinte là, ou n'existe pas.
     * Sérialisée, la colonne appartient à l'auteur du message de ce rang, sauf au rang d'un avis
     * système (il n'occupe la colonne de personne).
     */
    fun resolveRiverLaneAt(geometry: RiverGeometry, laneIndex: Int, rank: Int): RiverLane? {
        if (geometry.layout == RiverLayout.SERIALIZED) {
            val bubble = geometry.bubbles.firstOrNull { it.rank == rank }
            if (laneIndex != 0 || bubble == null || bubble.isSystem) return null
            return geometry.lanes.firstOrNull { it.laneId == bubble.laneId }
        }
        return geometry.lanes.firstOrNull { it.laneIndex == laneIndex && spanCovering(it, rank) != null }
    }

    private fun bubbleRanksOf(lane: RiverLane): List<Int> =
        lane.spans.flatMap { it.nodes }.filter { it.kind == RiverNodeKind.BUBBLE }.map { it.rank }.sorted()

    /**
     * Où atterrir en changeant de couloir : la bulle la PLUS PROCHE du segment vivant à cette
     * hauteur, la plus ANCIENNE à égalité. Un segment sans bulle garde la hauteur d'où l'on vient.
     */
    private fun landingRank(lane: RiverLane, rank: Int): Int {
        val ranks = spanCovering(lane, rank)?.nodes.orEmpty().filter { it.kind == RiverNodeKind.BUBBLE }.map { it.rank }
        return ranks.drop(1).fold(ranks.firstOrNull() ?: rank) { best, candidate ->
            if (abs(candidate - rank) < abs(best - rank)) candidate else best
        }
    }

    private fun stepSerialized(geometry: RiverGeometry, cursor: RiverCursor, direction: RiverStepDirection): RiverStep {
        if (geometry.rankCount == 0 || cursor.laneIndex != 0) return RiverStep(cursor, RiverStepReason.EMPTY)
        if (direction == RiverStepDirection.LEFT || direction == RiverStepDirection.RIGHT) {
            return RiverStep(cursor, RiverStepReason.EDGE)
        }
        val next = if (direction == RiverStepDirection.DOWN) cursor.rank + 1 else cursor.rank - 1
        return if (next < 0 || next >= geometry.rankCount) {
            RiverStep(cursor, RiverStepReason.EDGE)
        } else {
            RiverStep(RiverCursor(0, next), RiverStepReason.MOVED)
        }
    }

    private fun stepSideways(geometry: RiverGeometry, cursor: RiverCursor, direction: RiverStepDirection): RiverStep {
        val living = resolveRiverLivingLanes(geometry, cursor.rank)
        val reachable = if (direction == RiverStepDirection.RIGHT) {
            living.filter { it > cursor.laneIndex }
        } else {
            living.filter { it < cursor.laneIndex }.reversed()
        }
        val nextLane = reachable.firstOrNull()?.let { resolveRiverLaneAt(geometry, it, cursor.rank) }
            ?: return RiverStep(cursor, RiverStepReason.EDGE)
        return RiverStep(RiverCursor(nextLane.laneIndex, landingRank(nextLane, cursor.rank)), RiverStepReason.MOVED)
    }

    /**
     * Un pas sur l'un des deux axes. Horizontal : la branche vivante suivante, les mortes enjambées.
     * Vertical : la bulle suivante DE LA MÊME PERSONNE (« Suivre Mia »). Sérialisée, la rivière EST
     * le fil : plus d'axe horizontal, et l'axe vertical redevient le temps.
     */
    fun resolveRiverStep(input: ResolveRiverStepInput): RiverStep {
        val (geometry, cursor, direction) = input
        if (geometry.layout == RiverLayout.SERIALIZED) return stepSerialized(geometry, cursor, direction)

        val lane = resolveRiverLaneAt(geometry, cursor.laneIndex, cursor.rank)
            ?: return RiverStep(cursor, RiverStepReason.EMPTY)
        if (direction == RiverStepDirection.LEFT || direction == RiverStepDirection.RIGHT) {
            return stepSideways(geometry, cursor, direction)
        }
        val ranks = bubbleRanksOf(lane)
        val next = if (direction == RiverStepDirection.DOWN) {
            ranks.firstOrNull { it > cursor.rank }
        } else {
            ranks.lastOrNull { it < cursor.rank }
        }
        return if (next == null) {
            RiverStep(cursor, RiverStepReason.EDGE)
        } else {
            RiverStep(RiverCursor(cursor.laneIndex, next), RiverStepReason.MOVED)
        }
    }
}
