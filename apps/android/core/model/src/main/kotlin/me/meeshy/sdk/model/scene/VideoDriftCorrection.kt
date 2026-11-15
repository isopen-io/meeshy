package me.meeshy.sdk.model.scene

/**
 * Correction de dérive d'une vidéo de scène en lecture — miroir de `VideoDriftCorrection.swift` (#9702).
 *
 * Toutes les ~0,5 s ([PlayheadTickClock.DRIFT_CHECK_INTERVAL_SECONDS]) la position de chaque vidéo qui joue dans sa
 * fenêtre est comparée à la cible de la timeline ; on ne recale que PASSÉ le seuil, par un seek tolérant (±[SEEK_TOLERANCE_MS])
 * qui garde le son continu. Un seul recalage en vol à la fois par lecteur ([DriftSeekGate]).
 */
public object VideoDriftCorrection {

    /** Tolérance d'un recalage en lecture, sous la moitié du seuil : le point d'arrivée ne redéclenche jamais un recalage. */
    public const val SEEK_TOLERANCE_MS: Long = 100L

    /** Seuil de dérive par défaut (secondes) au-delà duquel un recalage vaut mieux qu'un hoquet. */
    public const val DEFAULT_THRESHOLD_SECONDS: Double = 0.5

    /**
     * Cible de recalage en millisecondes de la SOURCE, ou `null` si la vidéo est assez proche de la timeline
     * (ou hors de sa fenêtre : [inWindow] faux).
     */
    public fun driftCorrectionMs(
        expectedSeconds: Double,
        actualSeconds: Double,
        thresholdSeconds: Double = DEFAULT_THRESHOLD_SECONDS,
        inWindow: Boolean = true,
    ): Long? {
        if (!inWindow) return null
        if (!expectedSeconds.isFinite() || !actualSeconds.isFinite() || !thresholdSeconds.isFinite()) return null
        if (kotlin.math.abs(actualSeconds - expectedSeconds) <= thresholdSeconds) return null
        return (maxOf(0.0, expectedSeconds) * 1000.0).toLong()
    }
}

/** Un recalage de dérive à la fois, par lecteur : un seek lent ne s'empile pas sur le contrôle suivant. */
public class DriftSeekGate {
    private var inFlight = false

    /** Vrai : la place était libre et elle est prise jusqu'à [release]. */
    public fun claim(): Boolean {
        if (inFlight) return false
        inFlight = true
        return true
    }

    public fun release() {
        inFlight = false
    }
}
