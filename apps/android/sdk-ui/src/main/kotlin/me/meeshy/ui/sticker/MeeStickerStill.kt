package me.meeshy.ui.sticker

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.util.LruCache
import com.airbnb.lottie.LottieCompositionFactory
import com.airbnb.lottie.LottieDrawable
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.ui.component.game.MeeFilmCatalog

/**
 * L'image FIXE d'un film de Mee ou de Meo — la première image du film, rendue hors du fil principal et gardée en
 * mémoire bornée (iOS `MeeStickerCatalog.still(at:maxPixelSize:)`). La feuille de stickers et les figures fixes du
 * jeu la montrent ; un sticker Mee la téléverse en PNG quand il se pose (`provider = mee`). `null` pour un film
 * inconnu ou illisible.
 */
public object MeeStickerStill {
    public const val DEFAULT_SIDE: Int = 512
    private const val CACHE_BYTES: Int = 12 * 1024 * 1024

    private val stills = object : LruCache<String, Bitmap>(CACHE_BYTES) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }

    private fun key(stickerId: String, side: Int) = "$stickerId|$side"

    /** L'image déjà rendue à cette définition, sans rien calculer — de quoi peindre la case dès sa première image. */
    public fun cached(stickerId: String, side: Int): Bitmap? = stills.get(key(stickerId, side))

    /** L'image fixe en [side] × [side] pixels, rendue une fois puis servie depuis la mémoire. */
    public suspend fun bitmap(context: Context, stickerId: String, side: Int): Bitmap? {
        cached(stickerId, side)?.let { return it }
        val rendered = withContext(Dispatchers.Default) { render(context.applicationContext, stickerId, side) } ?: return null
        stills.put(key(stickerId, side), rendered)
        return rendered
    }

    public suspend fun png(context: Context, stickerId: String, side: Int = DEFAULT_SIDE): ByteArray? {
        val bitmap = bitmap(context, stickerId, side) ?: return null
        return withContext(Dispatchers.Default) {
            runCatching {
                ByteArrayOutputStream().use { out ->
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                    out.toByteArray()
                }
            }.getOrNull()
        }
    }

    private fun render(context: Context, stickerId: String, side: Int): Bitmap? {
        if (side <= 0) return null
        val path = MeeFilmCatalog.assetPath(stickerId) ?: return null
        val composition = runCatching { LottieCompositionFactory.fromAssetSync(context, path).value }.getOrNull() ?: return null
        return runCatching {
            Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888).also { bitmap ->
                LottieDrawable().apply {
                    setComposition(composition)
                    progress = 0f
                    setBounds(0, 0, side, side)
                    draw(Canvas(bitmap))
                }
            }
        }.getOrNull()
    }
}
