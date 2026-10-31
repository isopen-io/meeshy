package me.meeshy.app.calls

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PointF
import android.graphics.Rect
import android.media.FaceDetector
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.montage.CallFaceCrop
import me.meeshy.sdk.model.call.montage.CallMontageCanvas
import me.meeshy.sdk.model.composer.look.CallFaceLandmarks
import me.meeshy.sdk.model.composer.look.FacePoint

/** Le portrait carré d'une image de l'appel, de [side] pixels de côté ; `null` s'il ne se peint pas. */
fun interface CallFacePortraiting {
    fun portrait(image: Bitmap, side: Int): Bitmap?
}

/** Le visage le plus grand d'une image, en pixels (origine en haut à gauche) ; `null` sans visage (iOS `CallFaceLocating`). */
fun interface CallFaceLocating {
    fun faceRect(image: Bitmap): CallFrameRect?
}

/** Un carré entier, en pixels de l'image. */
data class CallFaceSquare(val x: Int, val y: Int, val side: Int)

/** Où se pose le carré d'un portrait : la loi de `CallMontageRenderer.faceSquare` (iOS), en pixels entiers. */
internal object CallFacePortraitGeometry {
    const val MARGIN = 0.45

    /** Le carré autour de [face] (marge 45 % par côté, légèrement remonté), sinon le plus grand carré centré ; gardé dans l'image. */
    fun square(face: CallFrameRect?, width: Int, height: Int): CallFaceSquare? {
        if (width <= 0 || height <= 0) return null
        val crop = CallFaceCrop.square(face, CallMontageCanvas(width.toDouble(), height.toDouble()), MARGIN)
        val x = floor(crop.minX).toInt().coerceIn(0, width - 1)
        val y = floor(crop.minY).toInt().coerceIn(0, height - 1)
        val side = minOf(ceil(crop.maxX).toInt() - x, ceil(crop.maxY).toInt() - y, width - x, height - y)
        return if (side > 0) CallFaceSquare(x, y, side) else null
    }

    /** Le visage qu'un détecteur rend par le milieu des yeux et leur écart sur une sonde réduite de [scaleX] × [scaleY], en pixels de l'image. */
    fun faceFromEyes(midX: Float, midY: Float, eyesDistance: Float, scaleX: Float, scaleY: Float): CallFrameRect {
        val box = CallFaceLandmarks.fromEyes(FacePoint(midX, midY), eyesDistance).bounds
        return CallFrameRect(
            box.left.toDouble() / scaleX,
            box.top.toDouble() / scaleY,
            box.width.toDouble() / scaleX,
            box.height.toDouble() / scaleY,
        )
    }
}

/**
 * Le détecteur de la plateforme (`android.media.FaceDetector`, iOS `VisionFaceLocator`) sur une petite sonde
 * de l'image, jamais sur l'image entière : il ne rend que le milieu des yeux et leur écart, la boîte s'en déduit.
 */
object PlatformCallFaceLocator : CallFaceLocating {
    private const val PROBE_WIDTH = 360
    private const val MAX_FACES = 4
    private const val MIN_CONFIDENCE = 0.3f

    override fun faceRect(image: Bitmap): CallFrameRect? = runCatching {
        val scale = min(1f, PROBE_WIDTH.toFloat() / image.width)
        val width = max(2, (image.width * scale).roundToInt() and 1.inv())
        val height = max(2, (image.height * scale).roundToInt())
        val scaled = Bitmap.createScaledBitmap(image, width, height, true)
        val probe = scaled.copy(Bitmap.Config.RGB_565, false)
        if (scaled !== image) scaled.recycle()
        val faces = arrayOfNulls<FaceDetector.Face>(MAX_FACES)
        val found = try {
            FaceDetector(width, height, MAX_FACES).findFaces(probe, faces)
        } finally {
            probe.recycle()
        }
        faces.take(found).filterNotNull().filter { it.confidence() >= MIN_CONFIDENCE }.maxByOrNull { it.eyesDistance() }?.let { face ->
            val middle = PointF().also(face::getMidPoint)
            CallFacePortraitGeometry.faceFromEyes(
                middle.x,
                middle.y,
                face.eyesDistance(),
                width.toFloat() / image.width,
                height.toFloat() / image.height,
            )
        }
    }.getOrNull()
}

/** Le portrait d'une personne (iOS `CallMontageRenderer.faceSquare`) : toujours une image neuve, l'image source reste à son propriétaire. */
class CallFacePortraitPainter(private val locator: CallFaceLocating = PlatformCallFaceLocator) : CallFacePortraiting {
    override fun portrait(image: Bitmap, side: Int): Bitmap? = runCatching {
        val square = CallFacePortraitGeometry.square(locator.faceRect(image), image.width, image.height) ?: return null
        val out = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)
        Canvas(out).drawBitmap(
            image,
            Rect(square.x, square.y, square.x + square.side, square.y + square.side),
            Rect(0, 0, side, side),
            Paint(Paint.FILTER_BITMAP_FLAG),
        )
        out
    }.getOrNull()
}
