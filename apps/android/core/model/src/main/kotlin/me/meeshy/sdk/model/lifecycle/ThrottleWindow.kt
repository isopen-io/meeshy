package me.meeshy.sdk.model.lifecycle

/**
 * « Au plus une passe par fenetre » et « jamais deux a la fois ». L'horloge est injectee ;
 * l'instant de depart est pris a l'entree, si bien qu'un echec ne rouvre pas la fenetre.
 */
class ThrottleWindow(
    private val windowMillis: Long = DEFAULT_WINDOW_MILLIS,
    private val clock: () -> Long,
) {
    private var lastStartMillis: Long? = null
    private var running = false

    @Synchronized
    fun tryEnter(): Boolean {
        if (running) return false
        val now = clock()
        val last = lastStartMillis
        if (last != null && now - last in 0 until windowMillis) return false
        lastStartMillis = now
        running = true
        return true
    }

    @Synchronized
    fun exit() {
        running = false
    }

    suspend fun runIfDue(block: suspend () -> Unit): Boolean {
        if (!tryEnter()) return false
        try {
            block()
        } finally {
            exit()
        }
        return true
    }

    companion object {
        const val DEFAULT_WINDOW_MILLIS: Long = 10 * 60 * 1000L
    }
}
