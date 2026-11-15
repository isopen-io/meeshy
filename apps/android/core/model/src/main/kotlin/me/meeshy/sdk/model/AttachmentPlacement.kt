package me.meeshy.sdk.model

/**
 * **La place d'une pièce se réserve à la SÉLECTION** — miroir de `PreparationTracking.placed` iOS (#9776).
 * Ce qui est déjà dans la zone, prêt ou en préparation, précède la nouvelle pièce : sélection 3,1,5,2,4 ⇒
 * zone 3,1,5,2,4, même si 4 finit le premier.
 */
object AttachmentPlacement {

    /** Juste après la dernière pièce choisie AVANT elle, sinon en tête. */
    fun indexFor(zoneIds: List<String>, selectedBefore: Set<String>): Int =
        zoneIds.indexOfLast { it in selectedBefore }.let { if (it < 0) 0 else it + 1 }

    fun <T> place(zone: List<T>, ready: T, selectedBefore: Set<String>, idOf: (T) -> String): List<T> {
        val index = indexFor(zone.map(idOf), selectedBefore)
        return zone.toMutableList().apply { add(index, ready) }
    }
}
