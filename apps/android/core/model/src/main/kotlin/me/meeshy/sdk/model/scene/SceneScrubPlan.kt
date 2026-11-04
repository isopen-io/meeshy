package me.meeshy.sdk.model.scene

/**
 * **Parcourir une scène au doigt** — port de iOS `StoryCanvasUIView.readerScrubSeconds`,
 * `StoryBackgroundLayer.loopedScrubTarget` et `SceneScrubState.adjusted`.
 *
 * Pure. Le playhead est la seule horloge : l'instant pointé se déduit de la fraction et de la durée de la scène.
 */
public object SceneScrubPlan {
    /** Le pas d'un réglage d'accessibilité (TalkBack : valeur ajustable). */
    public const val ACCESSIBILITY_STEP: Double = 0.1

    /** Tolérance du seek des vidéos en pause : un seek exact à la cadence du doigt gèlerait sur le GOP. */
    public const val SEEK_TOLERANCE_MS: Long = 50

    /** L'instant, en secondes, que pointe [fraction] de [durationSeconds]. Borné à la scène ; une fraction non finie vaut le début. */
    public fun seconds(fraction: Double, durationSeconds: Double): Double {
        if (!fraction.isFinite() || !durationSeconds.isFinite() || durationSeconds <= 0.0) return 0.0
        return fraction.coerceIn(0.0, 1.0) * durationSeconds
    }

    /** Idem, en millisecondes entières. */
    public fun millis(fraction: Double, durationMs: Long): Long =
        (seconds(fraction, durationMs.toDouble() / 1000.0) * 1000.0).toLong()

    /**
     * La position, dans l'item d'un fond BOUCLÉ, que montre la scène à [playheadSeconds] : le tour en cours, à sa phase.
     * `null` tant que la durée de l'item est inconnue.
     */
    public fun loopedTarget(playheadSeconds: Double, itemDurationSeconds: Double): Double? {
        if (!itemDurationSeconds.isFinite() || itemDurationSeconds <= 0.0 || !playheadSeconds.isFinite()) return null
        return playheadSeconds.coerceAtLeast(0.0) % itemDurationSeconds
    }

    /**
     * Où caler la vidéo de fond (ms) pour l'instant [playheadSeconds] : le tour en cours quand elle boucle, sinon l'instant
     * lui-même borné à sa durée. `null` quand sa durée n'est pas connue.
     */
    public fun backgroundSeekMs(playheadSeconds: Double, itemDurationMs: Long, loops: Boolean): Long? {
        val duration = itemDurationMs / 1000.0
        if (loops) return loopedTarget(playheadSeconds, duration)?.let { (it * 1000.0).toLong() }
        if (itemDurationMs <= 0 || !playheadSeconds.isFinite()) return null
        return (playheadSeconds.coerceAtLeast(0.0) * 1000.0).toLong().coerceAtMost(itemDurationMs)
    }

    /** Un réglage d'accessibilité : +10 % ou −10 %, borné à 0..1. */
    public fun adjusted(fraction: Double, increment: Boolean): Double {
        val base = if (fraction.isFinite()) fraction.coerceIn(0.0, 1.0) else 0.0
        return if (increment) (base + ACCESSIBILITY_STEP).coerceAtMost(1.0) else (base - ACCESSIBILITY_STEP).coerceAtLeast(0.0)
    }

    /** La fraction qu'un doigt à [x] pointe sur une barre de [width] px ; une largeur nulle ou une position non finie vaut le début. */
    public fun fraction(x: Float, width: Float): Float {
        if (width <= 0f || !x.isFinite()) return 0f
        return (x / width).coerceIn(0f, 1f)
    }
}
