package me.meeshy.sdk.model.composer.capture

import kotlin.math.pow

/** Le doigt qui FILME : le cadenas à droite, le zoom à la verticale (miroir de `ComposerCaptureHold`). */
object CaptureHold {
    enum class Phase { HOLDING, LOCKED }
    enum class Release { KEEP_FILMING, CLOSE_TAKE, CANCEL_PENDING }
    enum class VerticalDrag { ZOOM, DISMISS }

    /** Le verrou ne se défait pas en revenant. */
    fun phase(translationXDp: Float, wasLocked: Boolean): Phase =
        if (wasLocked || ShutterGesture.locks(translationXDp)) Phase.LOCKED else Phase.HOLDING

    fun release(isRecording: Boolean, phase: Phase): Release = when {
        phase == Phase.LOCKED -> Release.KEEP_FILMING
        isRecording -> Release.CLOSE_TAKE
        else -> Release.CANCEL_PENDING
    }

    /** Le cadenas paraît dès que le doigt tient pour filmer, pas seulement une fois la prise partie. */
    fun showsLock(stage: CaptureStage, holding: Boolean, locked: Boolean): Boolean {
        if (locked || stage == CaptureStage.OFF) return false
        return holding || stage == CaptureStage.RECORDING
    }

    fun verticalDrag(stage: CaptureStage): VerticalDrag =
        if (stage == CaptureStage.RECORDING) VerticalDrag.ZOOM else VerticalDrag.DISMISS
}

/** Le zoom : exponentiel au glisser, multiplicatif au pincement, par crans à l'accessibilité. */
object CaptureZoom {
    const val DP_PER_DOUBLING: Float = 160f
    const val CEILING: Float = 10f
    const val ACCESSIBILITY_STEP: Float = 1.25f
    const val PINCH_GRACE_MS: Long = 400

    /** [translationYDp] est NÉGATIVE vers le haut (repère écran) : monter zoome. */
    fun factor(start: Float, translationYDp: Float, range: ClosedFloatingPointRange<Float>): Float =
        (start * 2f.pow(-translationYDp / DP_PER_DOUBLING)).coerceIn(range)

    fun pinched(start: Float, scale: Float, range: ClosedFloatingPointRange<Float>): Float =
        (start * scale).coerceIn(range)

    fun stepped(factor: Float, up: Boolean, range: ClosedFloatingPointRange<Float>): Float =
        (if (up) factor * ACCESSIBILITY_STEP else factor / ACCESSIBILITY_STEP).coerceIn(range)

    fun showsBadge(factor: Float): Boolean = kotlin.math.abs(factor - 1f) > 0.01f

    /** Un pincement ne range jamais le viseur, ne photographie pas et ne vise pas. */
    fun pinchSpoilsGestures(isPinching: Boolean, pinchEndedAtMs: Long?, nowMs: Long): Boolean =
        isPinching || (pinchEndedAtMs != null && nowMs - pinchEndedAtMs < PINCH_GRACE_MS)
}

/** Le facteur LU n'est pas celui de l'appareil : une caméra virtuelle compte son ×1 sur l'ultra grand-angle. */
data class CaptureZoomScale(val base: Float) {
    fun displayed(deviceFactor: Float): Float = deviceFactor / base
    fun device(displayedFactor: Float): Float = displayedFactor * base
    val opening: Float get() = base

    fun displayedRange(deviceMin: Float, deviceMax: Float): ClosedFloatingPointRange<Float> {
        val low = deviceMin / base
        val high = minOf(deviceMax / base, CaptureZoom.CEILING)
        return low..maxOf(low, high)
    }

    companion object {
        fun base(switchOvers: List<Float>, hasUltraWide: Boolean): Float {
            val first = switchOvers.firstOrNull() ?: return 1f
            return if (hasUltraWide && first > 0f) first else 1f
        }

        /** Les crans que l'objectif sert vraiment. */
        fun presets(range: ClosedFloatingPointRange<Float>): List<Float> =
            if (range.endInclusive <= range.start) emptyList() else listOf(0.5f, 1f, 2f).filter { it in range }
    }
}
