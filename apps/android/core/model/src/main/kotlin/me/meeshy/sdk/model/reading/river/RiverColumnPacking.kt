package me.meeshy.sdk.model.reading.river

/**
 * Partage des colonnes entre voix — miroir de `columnAccepts` / `packColumns` / `assignColumns`
 * de `river-lanes.ts` (`RiverColumnPacking.swift`). Pure : elle ne lit que ses entrées.
 */
internal object RiverColumnPacking {

    data class Seed(val laneId: String, val isViewer: Boolean, val spans: List<RiverLaneSpan>)

    data class Assignment(val indexByLaneId: Map<String, Int>, val overflowed: Boolean)

    private data class Packing(
        val columns: List<List<RiverLaneSpan>> = emptyList(),
        val indexByLaneId: List<Pair<String, Int>> = emptyList(),
        val overflowed: Boolean = false,
    )

    private fun overlap(a: RiverLaneSpan, b: RiverLaneSpan): Boolean =
        a.startRank <= b.endRank && b.startRank <= a.endRank

    /** Une colonne accueille une voix de plus si aucun de ses segments ne croise les siens. */
    private fun columnAccepts(held: List<RiverLaneSpan>, spans: List<RiverLaneSpan>): Boolean =
        held.none { occupied -> spans.any { overlap(occupied, it) } }

    /**
     * Coloration gloutonne d'intervalles : chaque voix prend la colonne libre la plus à gauche. La
     * rive (colonne 0) reste au lecteur SEUL quand il a une branche.
     */
    private fun pack(lanes: List<Seed>, maxLanes: Int): Packing {
        val shoreIsTaken = lanes.firstOrNull()?.isViewer == true
        return lanes.fold(Packing()) { packing, lane ->
            if (packing.overflowed) return@fold packing
            val firstShareable = if (lane.isViewer || !shoreIsTaken) 0 else 1
            val reused = packing.columns.indices
                .firstOrNull { it >= firstShareable && columnAccepts(packing.columns[it], lane.spans) }
            val target = reused ?: packing.columns.size
            if (target >= maxLanes) return@fold packing.copy(overflowed = true)
            val columns = if (target < packing.columns.size) {
                packing.columns.mapIndexed { index, held -> if (index == target) held + lane.spans else held }
            } else {
                packing.columns + listOf(lane.spans)
            }
            Packing(columns, packing.indexByLaneId + (lane.laneId to target), false)
        }
    }

    /**
     * Colonne de chaque voix. Tant que la rivière tient dans sa largeur, une voix garde SA colonne
     * pour elle seule et à vie : le partage est le recours quand il y a plus de voix que de couloirs.
     */
    fun assign(lanes: List<Seed>, maxLanes: Int): Assignment {
        if (lanes.size <= maxLanes) {
            return Assignment(lanes.withIndex().associate { (index, lane) -> lane.laneId to index }, false)
        }
        val packing = pack(lanes, maxLanes)
        return Assignment(packing.indexByLaneId.toMap(), packing.overflowed)
    }
}
