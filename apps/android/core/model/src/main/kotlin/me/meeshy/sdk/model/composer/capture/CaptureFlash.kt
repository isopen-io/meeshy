package me.meeshy.sdk.model.composer.capture

enum class CaptureFlashMode { OFF, ON, AUTO }

enum class CaptureLensFacing { BACK, FRONT }

enum class CaptureTorchMode { OFF, ON, AUTO }

/** Le flash tri-état et l'écran blanc en selfie (miroir de `ComposerCameraFlash` / `ComposerFrontFlash`). */
object CaptureFlash {
    const val BRIGHTNESS_RAMP_MS: Long = 250
    const val PHOTO_HOLD_MS: Long = 450
    val INTENSITY_RANGE: ClosedFloatingPointRange<Double> = 0.3..1.0
    const val DEFAULT_INTENSITY: Double = 1.0
    const val INTENSITY_STEP: Double = 0.1

    /** off -> on -> auto -> off. */
    fun next(mode: CaptureFlashMode): CaptureFlashMode = when (mode) {
        CaptureFlashMode.OFF -> CaptureFlashMode.ON
        CaptureFlashMode.ON -> CaptureFlashMode.AUTO
        CaptureFlashMode.AUTO -> CaptureFlashMode.OFF
    }

    /** À l'avant, l'ÉCRAN est le flash : « auto » se lit « oui », l'écran ne mesure pas la lumière. */
    fun lightsFloor(flash: CaptureFlashMode, facing: CaptureLensFacing, stage: CaptureStage): Boolean =
        flash != CaptureFlashMode.OFF && facing == CaptureLensFacing.FRONT && stage != CaptureStage.OFF

    /** La torche d'une VIDÉO à l'arrière ; jamais à l'avant. */
    fun torch(flash: CaptureFlashMode, facing: CaptureLensFacing): CaptureTorchMode {
        if (facing != CaptureLensFacing.BACK) return CaptureTorchMode.OFF
        return when (flash) {
            CaptureFlashMode.ON -> CaptureTorchMode.ON
            CaptureFlashMode.AUTO -> CaptureTorchMode.AUTO
            CaptureFlashMode.OFF -> CaptureTorchMode.OFF
        }
    }

    fun showsSlider(flash: CaptureFlashMode): Boolean = flash != CaptureFlashMode.OFF

    fun clamped(level: Double): Double =
        if (!level.isFinite()) DEFAULT_INTENSITY else level.coerceIn(INTENSITY_RANGE)

    /** Piste verticale : en haut le plein, en bas le plancher. */
    fun level(atY: Float, height: Float): Double {
        if (height <= 0f) return DEFAULT_INTENSITY
        val part = (atY / height).coerceIn(0f, 1f).toDouble()
        return INTENSITY_RANGE.endInclusive - part * (INTENSITY_RANGE.endInclusive - INTENSITY_RANGE.start)
    }

    fun thumbPosition(level: Double): Float =
        ((INTENSITY_RANGE.endInclusive - clamped(level)) / (INTENSITY_RANGE.endInclusive - INTENSITY_RANGE.start)).toFloat()

    fun stepped(level: Double, up: Boolean): Double = clamped(level + if (up) INTENSITY_STEP else -INTENSITY_STEP)

    fun percent(level: Double): Int = Math.round(clamped(level) * 100).toInt()
}

/** La barre des zooms se resserre en capsule pendant la bascule d'objectif (miroir de `ComposerZoomBarMorph`). */
object CaptureZoomBarMorph {
    sealed interface Phase {
        data object Hidden : Phase
        data class Presets(val presets: List<Float>) : Phase
        data object Chip : Phase
        data object Morphing : Phase
    }

    fun phase(switching: Boolean, presets: List<Float>, factor: Float): Phase = when {
        switching -> Phase.Morphing
        presets.size > 1 -> Phase.Presets(presets)
        CaptureZoom.showsBadge(factor) -> Phase.Chip
        else -> Phase.Hidden
    }
}
