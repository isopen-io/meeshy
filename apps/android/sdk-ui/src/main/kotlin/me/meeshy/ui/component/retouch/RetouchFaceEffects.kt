package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PointF
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Shader
import android.media.FaceDetector
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import me.meeshy.sdk.model.composer.look.CallFaceEffect
import me.meeshy.sdk.model.composer.look.CallFaceLandmarks
import me.meeshy.sdk.model.composer.look.FaceBox
import me.meeshy.sdk.model.composer.look.FacePoint

/**
 * **LE VISAGE D'UNE PHOTO** (#12733) — miroir de `ComposerFaceEffects.still` (iOS) : le visage se cherche UNE fois
 * sur une petite sonde debout de la prise, jamais sur l'image entière, puis se garde en proportions pour l'aperçu,
 * la bande et ce qui part. Le détecteur de la plateforme (`android.media.FaceDetector`) ne rend que le milieu des
 * yeux et leur écart ; la boîte s'en déduit ([CallFaceLandmarks.fromEyes]).
 */
internal object RetouchFaceDetector {
    private const val PROBE_WIDTH = 360
    private const val MAX_FACES = 4
    private const val MIN_CONFIDENCE = 0.3f

    /** Le visage le plus grand, en proportions de [source] ; `null` sans visage ou sans détecteur. */
    fun detect(source: Bitmap): CallFaceLandmarks? = runCatching {
        val scale = min(1f, PROBE_WIDTH.toFloat() / source.width)
        val width = max(2, (source.width * scale).roundToInt() and 1.inv())
        val height = max(2, (source.height * scale).roundToInt())
        val probe = Bitmap.createScaledBitmap(source, width, height, true).copy(Bitmap.Config.RGB_565, false)
        val faces = arrayOfNulls<FaceDetector.Face>(MAX_FACES)
        val found = FaceDetector(width, height, MAX_FACES).findFaces(probe, faces)
        faces.take(found).filterNotNull().filter { it.confidence() >= MIN_CONFIDENCE }.maxByOrNull { it.eyesDistance() }?.let { face ->
            val middle = PointF().also(face::getMidPoint)
            CallFaceLandmarks.fromEyes(FacePoint(middle.x, middle.y), face.eyesDistance()).normalized(width.toFloat(), height.toFloat())
        }
    }.getOrNull()
}

/**
 * **LES EFFETS DE VISAGE SUR UNE PRISE** (#12733) — miroir de `CallFaceEffectsRenderer.render(_:upright:face:)` (iOS) :
 * Lissage de peau, Crapaud, Ange, Démon, Éruption, peints sur le canevas Android. [face] est en pixels de [image] ;
 * sans visage, un effet qui en demande un garde ce qu'il sait peindre sans lui (la teinte, la lueur), comme sur iOS.
 */
internal object RetouchFaceEffects {

    /** Une nouvelle image ; [image] elle-même pour « Aucun ». */
    fun apply(effect: CallFaceEffect, image: Bitmap, face: CallFaceLandmarks?): Bitmap = when (effect) {
        CallFaceEffect.NONE -> image
        CallFaceEffect.SMOOTHING -> RetouchFaceEffectStyles.smoothing(image, face)
        CallFaceEffect.TOAD -> RetouchFaceEffectStyles.toad(image, face)
        CallFaceEffect.ANGEL -> RetouchFaceEffectStyles.angel(image, face)
        CallFaceEffect.DEMON -> RetouchFaceEffectStyles.demon(image, face)
        CallFaceEffect.VOLCANO -> RetouchFaceEffectStyles.volcano(image)
    }

    internal fun mutableCopy(image: Bitmap): Bitmap = image.copy(Bitmap.Config.ARGB_8888, true)

    /** L'image passée par une matrice de couleur 4 × 5 (décalages sur 0…255). */
    internal fun graded(image: Bitmap, matrix: ColorMatrix): Bitmap {
        val out = Bitmap.createBitmap(image.width, image.height, Bitmap.Config.ARGB_8888)
        Canvas(out).drawBitmap(image, 0f, 0f, Paint(Paint.FILTER_BITMAP_FLAG).apply { colorFilter = ColorMatrixColorFilter(matrix) })
        return out
    }

    /** Un flou bon marché : l'image réduite de [reduction], puis rendue à sa taille en filtrant. */
    internal fun blurred(image: Bitmap, reduction: Float): Bitmap {
        val small = Bitmap.createScaledBitmap(image, max(1, (image.width * reduction).roundToInt()), max(1, (image.height * reduction).roundToInt()), true)
        return Bitmap.createScaledBitmap(small, image.width, image.height, true)
    }

    /** `CIColorMonochrome` : vers la luminance teintée de [color], à [intensity]. */
    internal fun monochrome(red: Float, green: Float, blue: Float, intensity: Float): ColorMatrix {
        val keep = 1f - intensity
        fun row(channel: Float, own: Int) = FloatArray(5) { column ->
            val luma = when (column) { 0 -> 0.2125f; 1 -> 0.7154f; 2 -> 0.0721f; else -> 0f }
            (if (column == own) keep else 0f) + intensity * channel * luma
        }
        return ColorMatrix(row(red, 0) + row(green, 1) + row(blue, 2) + floatArrayOf(0f, 0f, 0f, 1f, 0f))
    }

    /** [top] posé sur [base] au travers d'une ellipse douce autour du visage, à [strength]. */
    internal fun blendedInEllipse(base: Bitmap, top: Bitmap, face: FaceBox, strength: Float): Bitmap {
        val out = mutableCopy(base)
        val canvas = Canvas(out)
        val layer = canvas.saveLayer(0f, 0f, out.width.toFloat(), out.height.toFloat(), null)
        canvas.drawBitmap(top, 0f, 0f, null)
        val radius = max(1f, face.width * 0.5f * 1.05f)
        val mask = RadialGradient(0f, 0f, radius, intArrayOf(Color.argb((strength * 255).roundToInt(), 0, 0, 0), Color.argb((strength * 255).roundToInt(), 0, 0, 0), Color.TRANSPARENT), floatArrayOf(0f, 0.52f, 1f), Shader.TileMode.CLAMP)
        mask.setLocalMatrix(Matrix().apply { setScale(1f, face.height / max(1f, face.width)); postTranslate(face.midX, face.midY) })
        canvas.drawRect(0f, 0f, out.width.toFloat(), out.height.toFloat(), Paint().apply { shader = mask; xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) })
        canvas.restoreToCount(layer)
        return out
    }

    /** Une tache douce (`spot` d'iOS) : pleine au quart du rayon, transparente au bord. */
    internal fun spot(canvas: Canvas, center: FacePoint, radius: Float, color: Int, mode: PorterDuff.Mode? = null) {
        val r = max(1f, radius)
        val clear = Color.argb(0, Color.red(color), Color.green(color), Color.blue(color))
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = RadialGradient(center.x, center.y, r, intArrayOf(color, color, clear), floatArrayOf(0f, 0.25f, 1f), Shader.TileMode.CLAMP)
            mode?.let { xfermode = PorterDuffXfermode(it) }
        }
        canvas.drawCircle(center.x, center.y, r, paint)
    }

    internal fun rgba(red: Float, green: Float, blue: Float, alpha: Float = 1f): Int =
        Color.argb((alpha * 255).roundToInt(), (red * 255).roundToInt(), (green * 255).roundToInt(), (blue * 255).roundToInt())
}
