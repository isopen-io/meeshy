package me.meeshy.sdk.model.waveform

import kotlin.math.max

/** Un rectangle plein, en pixels, d'une barre de l'image de forme d'onde. */
data class WaveformBar(val x: Int, val y: Int, val width: Int, val height: Int)

/**
 * **La géométrie de l'image de forme d'onde** d'une vignette audio (miroir de
 * `WaveformCache.renderWaveformImage`, iOS) : une barre par échantillon, centrée verticalement,
 * hauteur en échelle décibel ([WaveformScale.displayHeight]) sur 90 % de la hauteur. Pure, donc
 * testable sans bitmap ; le dessin des rectangles vit dans `WaveformImageRenderer`.
 */
object WaveformImageLayout {

    /** L'image se rend à deux fois la taille demandée, pour rester nette sur un écran dense. */
    const val PIXEL_SCALE: Int = 2

    private const val FILL_RATIO = 0.9

    fun bars(measured: List<Float>, pixelWidth: Int, pixelHeight: Int): List<WaveformBar> {
        if (measured.isEmpty() || pixelWidth <= 0 || pixelHeight <= 0) return emptyList()
        val barWidth = max(1, pixelWidth / measured.size)
        val gap = max(0, (pixelWidth - barWidth * measured.size) / measured.size)
        return measured.mapIndexed { index, rms ->
            val height = max(1, (WaveformScale.displayHeight(rms).toDouble() * pixelHeight * FILL_RATIO).toInt())
            WaveformBar(
                x = index * (barWidth + gap),
                y = (pixelHeight - height) / 2,
                width = max(1, barWidth - 1),
                height = height,
            )
        }
    }
}
