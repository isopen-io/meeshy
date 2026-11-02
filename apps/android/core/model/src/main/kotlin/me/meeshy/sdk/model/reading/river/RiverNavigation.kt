package me.meeshy.sdk.model.reading.river

/**
 * Le curseur de la navigation à deux axes — miroir de `RiverNavigationController` (iOS), exprimé
 * en état IMMUABLE : un écran Compose le porte dans un `StateFlow`, chaque geste en rend un
 * nouveau. Il ne décide RIEN : chaque pas est délégué INTÉGRALEMENT à [RiverLaneQueries.resolveRiverStep].
 *
 * - [lastReason] : verdict du DERNIER pas, `null` avant le premier geste.
 * - [edgeBounceToken] : incrémenté à CHAQUE bord atteint, pour accrocher le rebond de la peau sans
 *   comparer deux curseurs.
 *
 * La géométrie n'est pas dans l'état : le curseur SURVIT à une nouvelle géométrie, et un pas sur un
 * curseur qui n'a plus de branche rend `EMPTY` (le curseur reçu, jamais inventé).
 */
data class RiverNavigation(
    val cursor: RiverCursor,
    val lastReason: RiverStepReason? = null,
    val edgeBounceToken: Int = 0,
) {
    fun step(geometry: RiverGeometry, direction: RiverStepDirection): RiverNavigation {
        val result = RiverLaneQueries.resolveRiverStep(ResolveRiverStepInput(geometry, cursor, direction))
        return copy(
            cursor = result.cursor,
            lastReason = result.reason,
            edgeBounceToken = if (result.reason == RiverStepReason.EDGE) edgeBounceToken + 1 else edgeBounceToken,
        )
    }

    /** Atterrissage direct (tap sur une bulle) : un choix du lecteur, pas un pas de la loi. */
    fun moveTo(target: RiverCursor): RiverNavigation = copy(cursor = target, lastReason = RiverStepReason.MOVED)
}
