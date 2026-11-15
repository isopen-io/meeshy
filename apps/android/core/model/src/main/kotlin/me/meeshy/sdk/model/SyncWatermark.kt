package me.meeshy.sdk.model

/** Un message tel que [SyncWatermark] en a besoin : son horodatage et sa provenance. */
data class WatermarkCandidate(
    val createdAtMillis: Long,
    val isOwn: Boolean,
    /** Vrai quand le serveur a confirmé le message (accusé reçu) : son `createdAt` est alors un instant serveur. */
    val isServerConfirmed: Boolean,
) {
    /** Un message d'autrui vient toujours du serveur ; un message propre n'y est qu'une fois confirmé. */
    val isServerTimestamped: Boolean get() = !isOwn || isServerConfirmed
}

/**
 * Le repère de rattrapage de la fenêtre manquée (miroir de `SyncWatermark.newest(among:)` iOS) : le plus
 * récent `createdAt` d'ORIGINE SERVEUR. Un message optimiste ou en échec porte l'horloge de l'appareil ;
 * s'il servait de repère, une horloge en avance sauterait de vrais messages. `null` ⇒ chargement complet.
 */
object SyncWatermark {
    fun newest(among: List<WatermarkCandidate>): Long? =
        among.filter { it.isServerTimestamped }.maxOfOrNull { it.createdAtMillis }
}
