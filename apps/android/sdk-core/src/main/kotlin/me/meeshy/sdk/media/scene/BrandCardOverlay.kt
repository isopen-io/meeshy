package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.media3.common.VideoFrameProcessingException
import androidx.media3.effect.BitmapOverlay
import androidx.media3.effect.OverlaySettings
import java.io.File

/**
 * Une carte de marque (intro, fin, auteur) posée sur toute la composition : l'image est décodée une fois, son opacité suit
 * [alphaAt] à chaque image rendue (en millisecondes de la timeline commune) — c'est ainsi que l'intro se fond vers la story et
 * que la carte de fin la recouvre. Appelé sur le fil GL de Media3.
 */
internal class BrandCardOverlay(private val file: File, private val alphaAt: (Long) -> Float) : BitmapOverlay() {

    private var card: Bitmap? = null

    override fun getBitmap(presentationTimeUs: Long): Bitmap {
        card?.let { return it }
        val decoded = BitmapFactory.decodeFile(file.absolutePath) ?: throw VideoFrameProcessingException("carte de marque illisible")
        card = decoded
        return decoded
    }

    override fun getOverlaySettings(presentationTimeUs: Long): OverlaySettings =
        OverlaySettings.Builder().setAlphaScale(alphaAt(presentationTimeUs / MICROS_PER_MILLI).coerceIn(0f, 1f)).build()

    override fun release() {
        super.release()
        card?.recycle()
        card = null
    }

    private companion object {
        const val MICROS_PER_MILLI = 1000L
    }
}
