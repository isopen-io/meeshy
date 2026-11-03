package me.meeshy.sdk.model.camera

/**
 * Le temps de l'armement à la première trame, mesuré (miroir de `ComposerCameraFirstFrameClock` iOS, #10307).
 * Relevé dans le journal avec ce qui l'explique : une session préchauffée à l'ouverture du composeur, ou
 * configurée à froid au toucher. Thread-safe : démarrée sur le fil principal, arrêtée sur celui des trames.
 */
class CameraFirstFrameClock {
    data class Report(val elapsedMs: Long, val prewarmed: Boolean) {
        val kind: String get() = if (prewarmed) PREWARMED else COLD

        /** `camera first frame: 180 ms (prewarmed)`. */
        val logLine: String get() = "camera first frame: $elapsedMs ms ($kind)"
    }

    private data class Armed(val startedAtMs: Long, val prewarmed: Boolean)

    private val lock = Any()
    private var armed: Armed? = null

    fun start(prewarmed: Boolean, atMs: Long) {
        synchronized(lock) { armed = Armed(atMs, prewarmed) }
    }

    /** La première trame depuis [start] ; `null` pour toutes les suivantes. */
    fun report(atMs: Long): Report? {
        val started = synchronized(lock) { armed.also { armed = null } } ?: return null
        return Report((atMs - started.startedAtMs).coerceAtLeast(0), started.prewarmed)
    }

    companion object {
        const val PREWARMED = "prewarmed"
        const val COLD = "cold"
    }
}
