package me.meeshy.ui.sticker

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import com.airbnb.lottie.LottieCompositionFactory
import com.airbnb.lottie.LottieDrawable
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.ui.component.game.MeeFilmCatalog

/**
 * L'image FIXE d'un film de Mee ou de Meo, en PNG transparent — ce qu'un sticker Mee téléverse quand il se pose (iOS le
 * pose en image, `provider = mee`). La même image que la feuille montre (première image du film). `null` pour un film
 * inconnu ou illisible ; jamais sur le fil principal.
 */
public object MeeStickerStill {
    public const val DEFAULT_SIDE: Int = 512

    public suspend fun png(context: Context, stickerId: String, side: Int = DEFAULT_SIDE): ByteArray? = withContext(Dispatchers.Default) {
        val path = MeeFilmCatalog.assetPath(stickerId) ?: return@withContext null
        val composition = runCatching { LottieCompositionFactory.fromAssetSync(context.applicationContext, path).value }.getOrNull()
            ?: return@withContext null
        runCatching {
            val bitmap = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)
            LottieDrawable().apply {
                setComposition(composition)
                progress = 0f
                setBounds(0, 0, side, side)
                draw(Canvas(bitmap))
            }
            ByteArrayOutputStream().use { out ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                bitmap.recycle()
                out.toByteArray()
            }
        }.getOrNull()
    }
}
