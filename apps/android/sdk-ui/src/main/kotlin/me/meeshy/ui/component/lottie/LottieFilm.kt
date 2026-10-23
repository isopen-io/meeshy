package me.meeshy.ui.component.lottie

import android.graphics.Bitmap
import android.graphics.Canvas
import com.airbnb.lottie.LottieComposition
import com.airbnb.lottie.LottieDrawable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.coroutines.yield
import kotlin.coroutines.coroutineContext

/** **Un film Lottie décodé** : modèle immuable une fois lu, partagé entre toutes les couches qui le montrent. */
public class LottieFilm(public val composition: LottieComposition) {
    /** Durée d'une boucle, en secondes. */
    public val durationSeconds: Double get() = composition.duration.toDouble() / 1000.0
}

/**
 * **Le moteur Lottie côté images** — miroir de `LottieFilm` (iOS) : le PNG joint à l'envoi d'un sticker, une vignette,
 * les images d'un canevas de story. Le rendu part hors du fil principal et cède la main toutes les [YIELD_EVERY] images.
 */
public object LottieFilmRaster {
    /** Le rythme des images rasterisées : celui des films WebP qu'elles remplacent. */
    public const val RASTER_FRAMES_PER_SECOND: Double = 15.0

    /** Plafond d'images d'un film : chaque image est un Bitmap en mémoire. */
    public const val MAX_FRAMES: Int = 600

    public const val YIELD_EVERY: Int = 4

    /** Le nombre d'images d'une boucle (au moins une, au plus [MAX_FRAMES]) ; une durée infinie ou NaN donne une image. */
    public fun frameCount(durationSeconds: Double, framesPerSecond: Double): Int {
        val product = durationSeconds * framesPerSecond
        if (!product.isFinite() || product <= 0.0) return 1
        return Math.round(product).coerceIn(1L, MAX_FRAMES.toLong()).toInt()
    }

    /** La progression (0..1) de chaque image : la dernière n'atteint pas 1, la boucle revient à 0. */
    public fun progresses(frameCount: Int): List<Float> =
        List(frameCount.coerceAtLeast(1)) { it.toFloat() / frameCount.coerceAtLeast(1) }

    /** La première image, carrée, de [pixelSize] de côté. */
    public fun still(film: LottieFilm, pixelSize: Int): Bitmap? {
        if (pixelSize <= 0) return null
        return renderer(film, pixelSize).render(0f)
    }

    /** Toutes les images d'une boucle, annulable entre deux lots ; `null` si la taille est nulle. */
    public suspend fun frames(
        film: LottieFilm,
        pixelSize: Int,
        framesPerSecond: Double = RASTER_FRAMES_PER_SECOND,
    ): List<Bitmap>? = withContext(Dispatchers.Default) {
        if (pixelSize <= 0) return@withContext null
        val renderer = renderer(film, pixelSize)
        val count = frameCount(film.durationSeconds, framesPerSecond)
        val out = ArrayList<Bitmap>(count)
        for ((index, progress) in progresses(count).withIndex()) {
            if (index > 0 && index % YIELD_EVERY == 0) {
                yield()
                coroutineContext.ensureActive()
            }
            out += renderer.render(progress)
        }
        out
    }

    /** Le film en PNG animé (APNG), prêt à publier en `image/png`. */
    public suspend fun apng(
        film: LottieFilm,
        pixelSize: Int,
        framesPerSecond: Double = RASTER_FRAMES_PER_SECOND,
    ): ByteArray? {
        val frames = frames(film, pixelSize, framesPerSecond) ?: return null
        return try {
            withContext(Dispatchers.Default) {
                AnimatedImageEncoder.apng(frames, delayMillis = Math.round(1000.0 / framesPerSecond).toInt())
            }
        } finally {
            frames.forEach { it.recycle() }
        }
    }

    private fun renderer(film: LottieFilm, side: Int) = Renderer(film, side)

    /** Un `LottieDrawable` à la taille de l'image, réutilisé pour toutes les images d'un rendu. */
    private class Renderer(film: LottieFilm, private val side: Int) {
        private val drawable = LottieDrawable().apply {
            setComposition(film.composition)
            setBounds(0, 0, side, side)
        }

        fun render(progress: Float): Bitmap {
            val bitmap = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(0)
            drawable.progress = progress
            drawable.draw(Canvas(bitmap))
            return bitmap
        }
    }
}
