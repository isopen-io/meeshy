package me.meeshy.sdk.model

/**
 * Traduit un flux d'apparitions et de disparitions de bulles en lots de messages RÉELLEMENT lus
 * (miroir de `SeenMessageAccumulator` iOS). Un message n'est retenu que s'il est resté continûment
 * affiché au moins [dwellMs] ; sans horloge interne : chaque appel reçoit l'instant courant.
 * Non thread-safe : un propriétaire unique (le thread principal) en détient l'instance.
 */
class SeenMessageAccumulator(
    val dwellMs: Long = 300,
    val batchSize: Int = 50,
    val reportedCap: Int = 2000,
) {
    private val visibleSince = LinkedHashMap<String, Long>()
    private val acquired = ArrayList<String>()
    private var reported = HashSet<String>()

    fun appeared(messageId: String, at: Long) {
        if (messageId in reported) return
        // Une réapparition repart de zéro : le temps hors écran ne se cumule pas.
        visibleSince[messageId] = at
    }

    fun disappeared(messageId: String, at: Long) {
        val since = visibleSince.remove(messageId) ?: return
        if (at - since >= dwellMs) acquire(messageId)
    }

    fun isBatchReady(at: Long): Boolean {
        promoteVisible(at, dwellMs)
        return acquired.size >= batchSize
    }

    /** Rend les identifiants acquis (les bulles encore à l'écran ayant franchi le seuil comprises). */
    fun drain(at: Long): List<String> {
        promoteVisible(at, dwellMs)
        return takeAcquired()
    }

    /** Rend TOUT ce qui est en attente, seuil franchi ou non : réservé à l'arrivée en bas, au geste explicite, à la sortie. */
    fun promoteAndDrain(at: Long): List<String> {
        promoteVisible(at, 0)
        return takeAcquired()
    }

    private fun takeAcquired(): List<String> {
        val batch = acquired.toList()
        acquired.clear()
        batch.forEach(::markReported)
        return batch
    }

    private fun promoteVisible(at: Long, minimumDwell: Long) {
        val due = visibleSince.entries
            .filter { at - it.value >= minimumDwell }
            .sortedWith(compareBy({ it.value }, { it.key }))
            .map { it.key }
        due.forEach {
            visibleSince.remove(it)
            acquire(it)
        }
    }

    private fun acquire(messageId: String) {
        if (messageId in reported || messageId in acquired) return
        acquired += messageId
    }

    private fun markReported(messageId: String) {
        if (reported.size >= reportedCap) reported = HashSet()
        reported += messageId
    }
}
