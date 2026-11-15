package me.meeshy.sdk.model.composer.capture

/**
 * Le cadenas se FERME, élastique, avant de partir (miroir de `ComposerLockSeal`) : ouvert sous le
 * glissé, SCELLÉ le temps de [holdMs], puis parti. Seul le verrou qui s'active sous les yeux se scelle.
 */
data class CaptureLockSeal(val sealing: Boolean = false, val generation: Int = 0) {

    fun lockChanged(from: Boolean, to: Boolean, wasShowing: Boolean): CaptureLockSeal = when {
        !to -> copy(sealing = false)
        from || !wasShowing -> this
        else -> CaptureLockSeal(sealing = true, generation = generation + 1)
    }

    fun finish(generation: Int): CaptureLockSeal =
        if (generation == this.generation) copy(sealing = false) else this

    companion object {
        const val HOLD_MS: Long = 600
        const val REDUCED_HOLD_MS: Long = 350
        const val SEALED_SCALE: Float = 1.3f

        fun showsTrack(showsLock: Boolean, seal: CaptureLockSeal): Boolean = showsLock || seal.sealing

        fun holdDurationMs(reduceMotion: Boolean): Long = if (reduceMotion) REDUCED_HOLD_MS else HOLD_MS

        fun glyphScale(progress: Float, sealed: Boolean, reduceMotion: Boolean): Float = when {
            reduceMotion -> 1f
            sealed -> SEALED_SCALE
            else -> 1f + 0.15f * progress.coerceIn(0f, 1f)
        }
    }
}
