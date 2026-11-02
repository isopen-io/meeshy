package me.meeshy.sdk.model.composer.capture

/**
 * La bascule d'objectif ne fige rien à l'écran : dès le toucher, la scène se voile (flou, fondu, léger recul)
 * et se dévoile sur la première trame neuve (miroir de `ComposerCameraSwitchVeil`).
 */
object CameraSwitchVeil {
    const val BLUR_RADIUS_DP: Float = 24f
    const val VEILED_OPACITY: Float = 0.7f
    const val VEILED_SCALE: Float = 0.96f
    const val FADE_IN_MS: Long = 120
    const val FADE_OUT_MS: Long = 250

    fun blurRadiusDp(switching: Boolean): Float = if (switching) BLUR_RADIUS_DP else 0f
    fun opacity(switching: Boolean): Float = if (switching) VEILED_OPACITY else 1f
    fun scale(switching: Boolean, reduceMotion: Boolean): Float = if (switching && !reduceMotion) VEILED_SCALE else 1f

    /** Le voile se pose vite et se lève en douceur. */
    fun durationMs(switching: Boolean): Long = if (switching) FADE_IN_MS else FADE_OUT_MS
}
