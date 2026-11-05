package me.meeshy.sdk.call.capture

import kotlin.math.abs
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * **L'HORLOGE COMMUNE DU FILM** (iOS : `CMClockGetHostTimeClock`) : images et son sont datés sur la MÊME horloge
 * hôte monotone ([monotonicNanos], `System.nanoTime` en production — celle que la surface de l'encodeur donne
 * aux images). Le film publie aussi l'instant de son départ en temps civil ([startedAtMillis]) : l'anneau de
 * progression de l'écran (la durée écoulée) le lit, il ne compte pas de son côté.
 */
public class CallMontageClock(
    private val monotonicNanos: () -> Long = System::nanoTime,
    private val wallMillis: () -> Long = System::currentTimeMillis,
) {
    private val _startedAtMillis = MutableStateFlow<Long?>(null)

    /** L'instant (ms, temps civil) où le film a démarré ; `null` hors film. */
    public val startedAtMillis: StateFlow<Long?> = _startedAtMillis.asStateFlow()

    /** Maintenant, en microsecondes, sur l'horloge hôte. */
    public fun nowUs(): Long = monotonicNanos() / NANOS_PER_MICRO

    /** Le film démarre : l'instant est publié, et rendu. */
    public fun markStart(): Long = wallMillis().also { _startedAtMillis.value = it }

    /** Le film est fini ou abandonné. */
    public fun markEnd() {
        _startedAtMillis.value = null
    }

    private companion object {
        const val NANOS_PER_MICRO = 1_000L
    }
}

/**
 * Date les tampons du micro sur l'horloge hôte : le premier commence à son arrivée moins sa durée, les suivants
 * se datent au compte des échantillons (aucune gigue d'arrivée dans le film) ; un écart de plus de
 * [RESYNC_US] avec l'horloge recale. `null` : tampon vide ou paramètres invalides.
 */
public class CallMontageAudioStamper {
    private var sampleRate = 0
    private var anchorUs = 0L
    private var framesSinceAnchor = 0L

    public fun stamp(frames: Int, sampleRate: Int, arrivalUs: Long): Long? {
        if (frames <= 0 || sampleRate <= 0) return null
        val heardFromUs = arrivalUs - frames.toLong() * MICROS_PER_SECOND / sampleRate
        if (this.sampleRate != sampleRate) {
            this.sampleRate = sampleRate
            anchorUs = heardFromUs
            framesSinceAnchor = 0
        }
        val countedUs = anchorUs + framesSinceAnchor * MICROS_PER_SECOND / sampleRate
        val startUs = if (abs(heardFromUs - countedUs) > RESYNC_US) {
            anchorUs = heardFromUs
            framesSinceAnchor = 0
            heardFromUs
        } else {
            countedUs
        }
        framesSinceAnchor += frames
        return startUs
    }

    public companion object {
        public const val RESYNC_US: Long = 150_000L
        private const val MICROS_PER_SECOND = 1_000_000L
    }
}
