package me.meeshy.sdk.waveform

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import me.meeshy.sdk.model.waveform.WaveformImageLayout
import java.io.ByteArrayOutputStream
import javax.inject.Inject
import javax.inject.Singleton

/**
 * **L'image de forme d'onde d'une vignette audio** (miroir de `renderWaveformImage`, iOS) : un PNG
 * transparent de `width × height` points, rendu à deux fois la taille pour rester net, une barre
 * indigo par échantillon mesuré. La géométrie vit dans [WaveformImageLayout] (pure, testée sur la
 * JVM) ; ici, seul le dessin des rectangles et l'encodage.
 */
@Singleton
class WaveformImageRenderer @Inject constructor() {

    /** Le PNG des barres de [measured] (RMS absolu). Vide si la taille est nulle ou l'encodage échoue. */
    fun render(measured: List<Float>, width: Int, height: Int, color: Int = BRAND_INDIGO): ByteArray {
        if (width <= 0 || height <= 0) return ByteArray(0)
        val pixelWidth = width * WaveformImageLayout.PIXEL_SCALE
        val pixelHeight = height * WaveformImageLayout.PIXEL_SCALE
        val bitmap = Bitmap.createBitmap(pixelWidth, pixelHeight, Bitmap.Config.ARGB_8888)
        try {
            val canvas = Canvas(bitmap)
            val paint = Paint().apply {
                this.color = color
                style = Paint.Style.FILL
                isAntiAlias = false
            }
            WaveformImageLayout.bars(measured, pixelWidth, pixelHeight).forEach { bar ->
                canvas.drawRect(
                    bar.x.toFloat(),
                    bar.y.toFloat(),
                    (bar.x + bar.width).toFloat(),
                    (bar.y + bar.height).toFloat(),
                    paint,
                )
            }
            val output = ByteArrayOutputStream()
            return if (bitmap.compress(Bitmap.CompressFormat.PNG, PNG_QUALITY, output)) output.toByteArray() else ByteArray(0)
        } finally {
            bitmap.recycle()
        }
    }

    companion object {
        /** L'indigo de la marque (`#6366F1`) : la vignette n'a pas de thème, elle part telle quelle vers le serveur. */
        const val BRAND_INDIGO: Int = 0xFF6366F1.toInt()

        private const val PNG_QUALITY = 100
    }
}
