package me.meeshy.sdk.model.composer.capture

data class CapturePoint(val x: Float, val y: Float)

data class CaptureRect(val left: Float, val top: Float, val width: Float, val height: Float) {
    val right: Float get() = left + width
    val bottom: Float get() = top + height
    val midX: Float get() = left + width / 2f
    val midY: Float get() = top + height / 2f
}

/** Mise au point et exposition : continues au centre, ou réglées une fois sur un point (miroir de `ComposerCaptureFocus`). */
object CaptureFocus {
    data class Capabilities(
        val focusPointOfInterest: Boolean = false,
        val autoFocus: Boolean = false,
        val continuousAutoFocus: Boolean = false,
        val exposurePointOfInterest: Boolean = false,
        val autoExpose: Boolean = false,
        val continuousAutoExposure: Boolean = false,
    )

    sealed interface Mode {
        data object Continuous : Mode
        data class Once(val at: CapturePoint) : Mode
    }

    /** `null` pour un mode = l'objectif ne sait pas faire, on n'y touche pas. */
    data class Plan(
        val focus: Mode?,
        val exposure: Mode?,
        val watchesSubjectArea: Boolean,
        val smoothFocus: Boolean = false,
    )

    val CENTER = CapturePoint(0.5f, 0.5f)
    const val MARK_LIFETIME_MS: Long = 900

    val NONE = Capabilities()

    fun continuous(lens: Capabilities, smooth: Boolean = false): Plan = Plan(
        focus = if (lens.continuousAutoFocus) Mode.Continuous else null,
        exposure = if (lens.continuousAutoExposure) Mode.Continuous else null,
        watchesSubjectArea = false,
        smoothFocus = smooth,
    )

    /** Le toucher fixe mise au point ET exposition sur le point, puis surveille la scène. */
    fun focusing(at: CapturePoint, lens: Capabilities, smooth: Boolean = false): Plan {
        val point = clamped(at)
        val focus: Mode? = when {
            lens.focusPointOfInterest && lens.autoFocus -> Mode.Once(point)
            lens.continuousAutoFocus -> Mode.Continuous
            else -> null
        }
        val exposure: Mode? = when {
            lens.exposurePointOfInterest && lens.autoExpose -> Mode.Once(point)
            lens.continuousAutoExposure -> Mode.Continuous
            else -> null
        }
        return Plan(focus, exposure, isOnce(focus) || isOnce(exposure), smooth)
    }

    /** Faux => ni anneau ni vibration : l'objectif ne règle rien sur un point. */
    fun aims(plan: Plan): Boolean = isOnce(plan.focus) || isOnce(plan.exposure)

    fun clamped(p: CapturePoint): CapturePoint = CapturePoint(p.x.coerceIn(0f, 1f), p.y.coerceIn(0f, 1f))

    fun focusesOnTap(stage: CaptureStage): Boolean = stage != CaptureStage.OFF

    private fun isOnce(m: Mode?): Boolean = m is Mode.Once
}

/** Le point visé se lit sur l'image RÉELLEMENT affichée, miroir compris (miroir de `ComposerCaptureFocusGeometry`). */
object CaptureFocusGeometry {
    fun filled(sourceWidth: Float, sourceHeight: Float, target: CaptureRect): CaptureRect {
        if (sourceWidth <= 0f || sourceHeight <= 0f) return target
        val scale = maxOf(target.width / sourceWidth, target.height / sourceHeight)
        val w = sourceWidth * scale
        val h = sourceHeight * scale
        return CaptureRect(target.midX - w / 2f, target.midY - h / 2f, w, h)
    }

    fun slotInView(slot: CaptureRect, canvasWidth: Float, canvasHeight: Float, viewWidth: Float, viewHeight: Float): CaptureRect {
        if (canvasWidth <= 0f || canvasHeight <= 0f) return slot
        val scale = minOf(viewWidth / canvasWidth, viewHeight / canvasHeight)
        val ox = (viewWidth - canvasWidth * scale) / 2f
        val oy = (viewHeight - canvasHeight * scale) / 2f
        return CaptureRect(ox + slot.left * scale, oy + slot.top * scale, slot.width * scale, slot.height * scale)
    }

    /** Point d'intérêt du capteur (0..1, capteur couché), nul hors de l'image. */
    fun devicePoint(viewX: Float, viewY: Float, imageRect: CaptureRect, mirrored: Boolean): CapturePoint? {
        if (imageRect.width <= 0f || imageRect.height <= 0f) return null
        val u = (viewX - imageRect.left) / imageRect.width
        val v = (viewY - imageRect.top) / imageRect.height
        if (u !in 0f..1f || v !in 0f..1f) return null
        return CapturePoint(v, if (mirrored) u else 1f - u)
    }
}
