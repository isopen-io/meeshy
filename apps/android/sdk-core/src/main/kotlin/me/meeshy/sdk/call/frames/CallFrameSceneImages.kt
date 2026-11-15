package me.meeshy.sdk.call.frames

import android.content.Context
import android.content.res.AssetManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import me.meeshy.sdk.call.frames.CallFrameRendererKit.rectF
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit
import me.meeshy.sdk.model.call.frames.CallFrameSceneArt
import me.meeshy.sdk.model.call.frames.CallFrameSceneDepth
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * D'où viennent les illustrations d'un cadre (miroir de iOS `CallFrameSceneImageProviding`) : une couche
 * `image` nomme son fichier (`assets/call-frames/<nom>.webp`), décodé à la taille où il se peint. Rien n'est
 * gardé ici : les couches qui les portent sont déjà gardées par le cache du peintre.
 */
fun interface CallFrameSceneImageProviding {
    fun image(src: String, maxPixelSize: Int): Bitmap?

    object None : CallFrameSceneImageProviding {
        override fun image(src: String, maxPixelSize: Int): Bitmap? = null
    }
}

/**
 * Les illustrations EMBARQUÉES : les fichiers de `packages/shared/design/call-capture-frames/assets/`, les
 * mêmes que iOS, versés dans les actifs de l'app par `:sdk-core`. Une vignette ne décode jamais l'image entière
 * (sous-échantillonnage au décodage, puis mise à la taille demandée).
 */
class CallFrameAssetImages(private val assets: AssetManager) : CallFrameSceneImageProviding {
    override fun image(src: String, maxPixelSize: Int): Bitmap? {
        val path = CallFrameSceneArt.assetPath(src)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        runCatching { assets.open(path).use { BitmapFactory.decodeStream(it, null, bounds) } }.getOrNull()
        val longest = max(bounds.outWidth, bounds.outHeight)
        if (longest <= 0) return null
        var sample = 1
        while (longest / (sample * 2) >= maxPixelSize) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        return runCatching { assets.open(path).use { BitmapFactory.decodeStream(it, null, options) } }.getOrNull()
    }
}

/**
 * Le fournisseur des illustrations de cadre du processus — l'équivalent du `Bundle.main` d'iOS : l'app
 * l'INSTALLE au démarrage ([install]) ; avant, ou dans un test qui n'en pose pas, un cadre se peint sans
 * illustration (une image absente ne retire que sa couche).
 */
object CallFrameSceneImages {
    @Volatile
    var installed: CallFrameSceneImageProviding = CallFrameSceneImageProviding.None

    fun install(context: Context) {
        installed = CallFrameAssetImages(context.applicationContext.assets)
    }
}

/**
 * **LES ILLUSTRATIONS D'UN CADRE** (#13695, miroir de iOS `CallFrameSceneImagePainter`) — les couches `image`
 * de sa scène : la MATIÈRE du fond (`back`, posée sur le fond, sous les ornements et les visages) et la MOULURE
 * de bordure (`front`, sur les traits des cases, sous les ornements et les textes), étirée en neuf morceaux
 * quand elle déclare un `slice`. Peintes avec les couches fixes, une fois : le direct ne les recompose qu'avec
 * la vidéo, sans rien redessiner.
 */
internal object CallFrameSceneImagePainter {

    fun paint(canvas: Canvas, stage: CallFrameStage, depth: CallFrameSceneDepth, images: CallFrameSceneImageProviding) {
        val layers = CallFrameSceneArt.images(stage.look, depth)
        if (layers.isEmpty()) return
        val maxPixelSize = max(stage.width, stage.height)
        layers.forEach { layer ->
            val image = layer.src?.let { images.image(it, maxPixelSize) } ?: return@forEach
            val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
                alpha = (CallFrameSceneArt.opacity(layer) * 255).roundToInt()
            }
            val slice = layer.slice
            if (slice != null) {
                CallFrameSceneArt.nineSlicePieces(image.width.toDouble(), image.height.toDouble(), stage.bounds, slice).forEach { piece ->
                    val source = Rect(
                        piece.source.minX.roundToInt(), piece.source.minY.roundToInt(),
                        piece.source.maxX.roundToInt(), piece.source.maxY.roundToInt(),
                    )
                    if (source.width() >= 1 && source.height() >= 1) canvas.drawBitmap(image, source, rectF(piece.target), paint)
                }
            } else {
                val target = CallFrameRenderKit.aspectFill(image.width.toDouble(), image.height.toDouble(), stage.bounds) ?: return@forEach
                canvas.drawBitmap(image, null, rectF(target), paint)
            }
        }
    }
}
