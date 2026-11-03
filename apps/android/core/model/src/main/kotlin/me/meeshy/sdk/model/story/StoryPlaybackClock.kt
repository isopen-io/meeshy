package me.meeshy.sdk.model.story

/**
 * **L'horloge de lecture d'une story, avec seek** — port de iOS `StoryReaderTimerController`.
 *
 * Pure : aucune horloge système, l'hôte injecte le temps écoulé par [advance]. Cycle d'une slide :
 * [startSlide] (en attente, progression 0) → [markContentReady] (le fond est utilisable, le compte à rebours
 * court) → progression 1 : [Tick.completed] une seule fois. [setPaused], [setStalled] (média qui bufferise) et
 * [setInterrupted] figent SANS perdre la position ; la reprise ne saute pas. [seekToFraction] reprend à une
 * fraction (la boucle repart de 0). Un garde-fou ([contentReadyFailsafeMs]) force l'activation si le fond ne dit
 * jamais qu'il est prêt, pour qu'aucune story ne reste figée à 0.
 */
public class StoryPlaybackClock(private val contentReadyFailsafeMs: Long = DEFAULT_FAILSAFE_MS) {

    public data class Tick(val progress: Float, val completed: Boolean)

    public var progress: Float = 0f
        private set
    public var isActive: Boolean = false
        private set
    public var isPaused: Boolean = false
        private set
    public var isStalled: Boolean = false
        private set
    public var isInterrupted: Boolean = false
        private set

    private var durationMs: Long = 0
    private var elapsedMs: Double = 0.0
    private var pendingMs: Long = 0
    private var completionFired: Boolean = false

    /** Une nouvelle slide repart de zéro, en attente, sans pause ni blocage. */
    public fun startSlide(durationMs: Long) {
        this.durationMs = durationMs.coerceAtLeast(0)
        elapsedMs = 0.0
        progress = 0f
        isActive = false
        isPaused = false
        isStalled = false
        completionFired = false
        pendingMs = 0
    }

    /** Une durée qui change en cours de route (média qui annonce la sienne) garde la FRACTION déjà jouée. */
    public fun updateDuration(durationMs: Long) {
        val fraction = progress
        this.durationMs = durationMs.coerceAtLeast(0)
        elapsedMs = this.durationMs * fraction.toDouble()
    }

    public fun markContentReady() {
        isActive = true
    }

    public fun setPaused(paused: Boolean) {
        isPaused = paused
    }

    public fun setStalled(stalled: Boolean) {
        isStalled = stalled
    }

    public fun setInterrupted(interrupted: Boolean) {
        isInterrupted = interrupted
    }

    /** Reprend à [fraction] (bornée à 0..1). Reculer après la fin réarme l'avance ; pointer la fin la déclenche UNE fois. */
    public fun seekToFraction(fraction: Float): Tick {
        val clamped = if (fraction.isFinite()) fraction.coerceIn(0f, 1f) else 0f
        elapsedMs = durationMs * clamped.toDouble()
        progress = clamped
        if (clamped < 1f) completionFired = false
        return finish()
    }

    /** Intègre [deltaMs] de temps réel. Rien n'avance tant que la slide attend, est figée, bufferise ou est interrompue. */
    public fun advance(deltaMs: Long): Tick {
        val delta = deltaMs.coerceAtLeast(0)
        if (!isActive) {
            if (!isPaused && !isInterrupted && contentReadyFailsafeMs > 0) {
                pendingMs += delta
                if (pendingMs >= contentReadyFailsafeMs) isActive = true
            }
            return Tick(progress, completed = false)
        }
        if (isPaused || isStalled || isInterrupted || durationMs <= 0) return Tick(progress, completed = false)
        elapsedMs = minOf(durationMs.toDouble(), elapsedMs + delta)
        progress = (elapsedMs / durationMs).toFloat()
        return finish()
    }

    private fun finish(): Tick {
        if (progress < 1f || completionFired) return Tick(progress, completed = false)
        completionFired = true
        return Tick(progress, completed = true)
    }

    public companion object {
        public const val DEFAULT_FAILSAFE_MS: Long = 6_000
    }
}
