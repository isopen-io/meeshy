package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.roundToInt
import me.meeshy.sdk.model.composer.look.CallFaceEffectBudget
import me.meeshy.sdk.model.composer.look.CallFaceEffectGeometry
import me.meeshy.sdk.model.composer.look.CallFaceLandmarks
import me.meeshy.sdk.model.composer.look.FaceBox
import me.meeshy.sdk.model.composer.look.FacePoint
import me.meeshy.ui.component.retouch.RetouchFaceEffects.blendedInEllipse
import me.meeshy.ui.component.retouch.RetouchFaceEffects.blurred
import me.meeshy.ui.component.retouch.RetouchFaceEffects.graded
import me.meeshy.ui.component.retouch.RetouchFaceEffects.monochrome
import me.meeshy.ui.component.retouch.RetouchFaceEffects.mutableCopy
import me.meeshy.ui.component.retouch.RetouchFaceEffects.rgba
import me.meeshy.ui.component.retouch.RetouchFaceEffects.spot

/**
 * Les cinq effets — mêmes ingrédients que `CallFaceEffectsRenderer` (iOS), une photo à la fois (instant 0 de
 * l'animation de l'appel : le halo à son éclat de repos, la lave à sa hauteur moyenne, les braises en vol).
 */
internal object RetouchFaceEffectStyles {
    private const val SMOOTHING_INTENSITY = 0.4f

    fun smoothing(image: Bitmap, face: CallFaceLandmarks?): Bitmap {
        face ?: return image
        return blendedInEllipse(image, blurred(image, 0.12f), face.bounds, SMOOTHING_INTENSITY * 1.5f)
    }

    fun toad(image: Bitmap, face: CallFaceLandmarks?): Bitmap {
        if (face == null) return graded(image, monochrome(0.36f, 0.78f, 0.24f, 0.22f))
        val bounds = face.bounds
        val bumps = CallFaceEffectGeometry.cheekCenters(bounds).map { Bump(it, bounds.width * 0.2f, 0.45f) } +
            CallFaceEffectGeometry.eyeCenters(face).map { Bump(it, bounds.width * 0.11f, 0.55f) }
        val bumped = bulged(image, bumps)
        val skin = blendedInEllipse(bumped, graded(bumped, monochrome(0.36f, 0.78f, 0.24f, 0.65f)), bounds, 1f)
        val canvas = Canvas(skin)
        val radius = CallFaceEffectGeometry.wartRadius(bounds)
        CallFaceEffectGeometry.wartCenters(bounds, CallFaceEffectBudget.WART_COUNT, CallFaceEffectBudget.SEED)
            .forEach { spot(canvas, it, radius, rgba(0.22f, 0.38f, 0.12f, 0.9f)) }
        return skin
    }

    fun angel(image: Bitmap, face: CallFaceLandmarks?): Bitmap {
        val out = mutableCopy(image)
        val canvas = Canvas(out)
        val glow = graded(blurred(image, CallFaceEffectBudget.GLOW_REDUCTION * 0.5f), ColorMatrix().apply { setScale(0.55f, 0.55f, 0.55f, 1f) })
        canvas.drawBitmap(glow, 0f, 0f, Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.SCREEN) })
        val warm = graded(out, colorControls(brightness = 0.03f, saturation = 1.05f))
        face ?: return warm
        halo(Canvas(warm), CallFaceEffectGeometry.haloRect(face.bounds), CallFaceEffectGeometry.shimmer(0.0))
        return warm
    }

    fun demon(image: Bitmap, face: CallFaceLandmarks?): Bitmap {
        val red = graded(image, ColorMatrix(floatArrayOf(1.18f, 0f, 0f, 0f, 0.02f * 255, 0f, 0.8f, 0f, 0f, 0f, 0f, 0f, 0.78f, 0f, 0f, 0f, 0f, 0f, 1f, 0f)))
        val canvas = Canvas(red)
        vignette(canvas, red.width.toFloat(), red.height.toFloat())
        face ?: return red
        CallFaceEffectGeometry.hornRects(face.bounds).forEachIndexed { index, rect -> horn(canvas, rect, mirrored = index == 1) }
        val radius = CallFaceEffectGeometry.eyeGlowRadius(face.bounds, 0.0)
        CallFaceEffectGeometry.eyeCenters(face).forEach { spot(canvas, it, radius, rgba(1f, 0.12f, 0.04f, 0.95f), PorterDuff.Mode.ADD) }
        return red
    }

    fun volcano(image: Bitmap): Bitmap {
        val graded = graded(image, ColorMatrix(floatArrayOf(1.12f, 0f, 0f, 0f, 0.03f * 255, 0f, 0.9f, 0f, 0f, 0.01f * 255, 0f, 0f, 0.72f, 0f, 0f, 0f, 0f, 0f, 1f, 0f)))
        val canvas = Canvas(graded)
        val width = graded.width.toFloat()
        val height = graded.height.toFloat()
        val lava = CallFaceEffectGeometry.lavaHeight(0.0, height)
        val paint = Paint().apply {
            shader = LinearGradient(0f, height, 0f, height - lava, rgba(1f, 0.32f, 0.02f, 0.75f), rgba(1f, 0.55f, 0.05f, 0f), Shader.TileMode.CLAMP)
        }
        canvas.drawRect(0f, height - lava, width, height, paint)
        CallFaceEffectGeometry.embers(CallFaceEffectBudget.EMBER_COUNT, 0.0, width, height, CallFaceEffectBudget.SEED)
            .filter { it.opacity > 0f }
            .forEach { spot(canvas, it.center, it.radius, rgba(1f, 0.6f, 0.15f, it.opacity), PorterDuff.Mode.ADD) }
        return graded
    }

    private data class Bump(val center: FacePoint, val radius: Float, val scale: Float)

    /** `CIBumpDistortion` : chaque bosse grossit ce qui est sous elle, en douceur jusqu'à son bord. */
    private fun bulged(image: Bitmap, bumps: List<Bump>): Bitmap {
        val columns = MESH
        val rows = MESH
        val vertices = FloatArray((columns + 1) * (rows + 1) * 2)
        for (row in 0..rows) {
            for (column in 0..columns) {
                val x = image.width * column / columns.toFloat()
                val y = image.height * row / rows.toFloat()
                val pushed = bumps.fold(FacePoint(x, y)) { point, bump -> pushed(point, bump) }
                val at = (row * (columns + 1) + column) * 2
                vertices[at] = pushed.x
                vertices[at + 1] = pushed.y
            }
        }
        val out = Bitmap.createBitmap(image.width, image.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        canvas.drawBitmap(image, 0f, 0f, null)
        canvas.drawBitmapMesh(image, columns, rows, vertices, 0, null, 0, Paint(Paint.FILTER_BITMAP_FLAG))
        return out
    }

    private fun pushed(point: FacePoint, bump: Bump): FacePoint {
        val dx = point.x - bump.center.x
        val dy = point.y - bump.center.y
        val distance = hypot(dx, dy)
        if (distance >= bump.radius || bump.radius <= 0f) return point
        val falloff = 1f - distance / bump.radius
        val gain = 1f + bump.scale * falloff * falloff
        return FacePoint(bump.center.x + dx * gain, bump.center.y + dy * gain)
    }

    /** Le halo de l'ange : un anneau doré qui rayonne, à l'éclat du scintillement. */
    private fun halo(canvas: Canvas, rect: FaceBox, shimmer: Float) {
        val lineWidth = rect.height * 0.16f
        val inset = rect.height * 0.24f
        val ring = RectF(rect.left + inset, rect.top + inset, rect.right - inset, rect.bottom - inset)
        val alpha = shimmer.coerceIn(0f, 1f)
        val glow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = lineWidth
            color = rgba(1f, 0.8f, 0.28f, alpha)
            maskFilter = BlurMaskFilter(max(1f, rect.height * 0.22f), BlurMaskFilter.Blur.NORMAL)
        }
        canvas.drawOval(ring, glow)
        canvas.drawOval(ring, Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = lineWidth; color = rgba(1f, 0.8f, 0.28f, alpha) })
        canvas.drawOval(ring, Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = lineWidth * 0.35f; color = rgba(1f, 0.97f, 0.78f, 0.9f * alpha) })
    }

    /** Une corne du démon, sa pointe en haut ; la droite est le miroir de la gauche. */
    private fun horn(canvas: Canvas, rect: FaceBox, mirrored: Boolean) {
        val w = rect.width
        val h = rect.height
        val path = Path().apply {
            moveTo(0.22f * w, h)
            quadTo(0.02f * w, 0.5f * h, 0.04f * w, 0.02f * h)
            quadTo(0.62f * w, 0.58f * h, 0.92f * w, h)
            close()
        }
        canvas.save()
        canvas.translate(rect.left, rect.top)
        if (mirrored) canvas.scale(-1f, 1f, w / 2f, h / 2f)
        val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = LinearGradient(0.5f * w, h, 0.1f * w, 0f, intArrayOf(rgba(0.42f, 0.02f, 0.03f), rgba(0.86f, 0.1f, 0.08f), rgba(1f, 0.45f, 0.3f)), floatArrayOf(0f, 0.65f, 1f), Shader.TileMode.CLAMP)
        }
        canvas.drawPath(path, fill)
        canvas.drawPath(path, Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = max(1f, w * 0.03f); color = rgba(0.2f, 0f, 0f, 0.85f) })
        canvas.restore()
    }

    /** `CIVignette` : les bords s'assombrissent, le centre reste. */
    private fun vignette(canvas: Canvas, width: Float, height: Float) {
        val radius = max(1f, hypot(width, height) / 2f)
        val paint = Paint().apply {
            shader = RadialGradient(width / 2f, height / 2f, radius, intArrayOf(Color.TRANSPARENT, Color.TRANSPARENT, Color.argb(150, 0, 0, 0)), floatArrayOf(0f, 0.55f, 1f), Shader.TileMode.CLAMP)
        }
        canvas.drawRect(0f, 0f, width, height, paint)
    }

    /** `CIColorControls` : une luminosité ajoutée et une saturation autour de la luminance. */
    private fun colorControls(brightness: Float, saturation: Float): ColorMatrix =
        ColorMatrix().apply { setSaturation(saturation) }.also { matrix ->
            val offset = (brightness * 255).roundToInt().toFloat()
            matrix.postConcat(ColorMatrix(floatArrayOf(1f, 0f, 0f, 0f, offset, 0f, 1f, 0f, 0f, offset, 0f, 0f, 1f, 0f, offset, 0f, 0f, 0f, 1f, 0f)))
        }

    private const val MESH = 40
}
