package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryDrawingStrokePoint

/** Un échantillon brut du doigt ou du stylet, en pixels écran ; [force] est la pression rapportée par l'appareil. */
data class StrokeCaptureSample(val x: Double, val y: Double, val tMillis: Long, val force: Double = 1.0)

/**
 * Projette les échantillons captés en points de trait de l'espace design (1080x1920) avec la pression qui pilote la
 * largeur — miroir de `StrokeCaptureLayer.makeStroke` (iOS). Stylet : la force pilote la largeur quand elle VARIE ;
 * doigt : la vitesse locale lissée (lent = épais). L'échelle écran vers design est non uniforme, comme au rendu.
 */
object StrokeCapture {
    /** `captureVersion >= 1` : chaque point porte un vrai pilote de largeur (rendu à largeur variable). */
    const val CAPTURE_VERSION: Int = 1

    fun points(
        samples: List<StrokeCaptureSample>,
        canvasWidthPx: Double,
        canvasHeightPx: Double,
        isStylus: Boolean,
        designWidth: Double = DESIGN_WIDTH,
        designHeight: Double = DESIGN_HEIGHT,
    ): List<StoryDrawingStrokePoint> {
        if (samples.isEmpty() || canvasWidthPx <= 0.0 || canvasHeightPx <= 0.0) return emptyList()
        val design = samples.map {
            StrokePoint(it.x / canvasWidthPx * designWidth, it.y / canvasHeightPx * designHeight)
        }
        val dts = (1 until samples.size).map { (samples[it].tMillis - samples[it - 1].tMillis) / 1000.0 }
        val pressures = if (isStylus) {
            StrokeWidthDriver.pressures(design, dts, samples.map { it.force })
        } else {
            StrokeWidthDriver.fingerPressures(design, dts)
        }
        return design.indices.map { StoryDrawingStrokePoint(design[it].x, design[it].y, pressures[it]) }
    }

    private const val DESIGN_WIDTH = 1080.0
    private const val DESIGN_HEIGHT = 1920.0
}
