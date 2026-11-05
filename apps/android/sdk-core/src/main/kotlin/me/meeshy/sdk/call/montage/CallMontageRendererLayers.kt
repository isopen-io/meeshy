package me.meeshy.sdk.call.montage

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorSpace
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.os.Build
import me.meeshy.sdk.model.call.frames.CallFramePerson
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.frames.CallFrameTone
import me.meeshy.sdk.model.call.montage.CallMontageCanvas
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.call.montage.CallMontageStyle

/**
 * **Là où le portrait d'un classique se pose**, relevé PENDANT que le peintre le peint (#9348, miroir de
 * `CallMontageHole` iOS) : le chemin de la case et la transformation exacte du canevas à cet instant — la
 * rotation d'une polaroïd autour de sa carte comprise. Le premier relevé gagne.
 */
class CallMontageHole {
    var path: Path? = null
        private set
    var frame: CallFrameRect = CallFrameRect(0.0, 0.0, 0.0, 0.0)
        private set
    var toCanvas: Matrix = Matrix()
        private set

    fun record(path: Path, frame: CallFrameRect, toCanvas: Matrix) {
        if (this.path != null) return
        this.path = Path(path)
        this.frame = frame
        this.toCanvas = Matrix(toCanvas)
    }
}

/** Le trou d'un classique, posé : son chemin dans la toile, sa découpe et la photo qu'il attend. */
class CallMontageLayerHole(
    /** Le chemin de la case dans le repère de la toile (rotation comprise). */
    val path: Path,
    /** Le cadre de la photo avant rotation. */
    val photoFrame: CallFrameRect,
    /** Sa transformation vers la toile. */
    val toCanvas: Matrix,
    /** La découpe blanche du trou (débordant de [CallMontageRendererLayers.MASK_BLEED]), bornée au trou. */
    val mask: Bitmap,
    /** L'origine de [mask] sur la toile. */
    val maskOriginX: Int,
    val maskOriginY: Int,
)

/**
 * Un classique en deux couches (#9348, spec § 4.2) : le DESSUS peint une fois avec un trou transparent ;
 * la carte graphique pose la vidéo dans [hole] à chaque image, sous le dessus.
 */
class CallMontageLayerScene(
    val frameId: String,
    val person: CallFramePerson,
    val width: Int,
    val height: Int,
    val overlay: Bitmap,
    val hole: CallMontageLayerHole,
    val tone: CallFrameTone,
)

/** Le moteur du Montage : rendu plein, sRGB ou Display P3, et rendu en couches pour la vidéo en direct. */
object CallMontageRenderer {

    /** Le montage complet ; [colorSpace] `Display P3` pour les photos du composer, sinon le sRGB de l'appareil. */
    fun render(
        style: CallMontageStyle,
        photos: List<CallMontagePhoto>,
        width: Int,
        height: Int,
        caption: CallMontageCaption,
        colorSpace: ColorSpace? = null,
    ): Bitmap? {
        if (width < 1 || height < 1) return null
        val bitmap = createBitmap(width, height, colorSpace) ?: return null
        CallMontagePainter.paint(Canvas(bitmap), style, photos, CallMontageCanvas(width.toDouble(), height.toDouble()), caption)
        return bitmap
    }

    /** Display P3 si la plateforme le sait, sinon `null` (le sRGB de la toile). */
    fun displayP3(): ColorSpace? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ColorSpace.get(ColorSpace.Named.DISPLAY_P3) else null

    fun layers(style: CallMontageStyle, person: CallFramePerson, caption: CallMontageCaption, width: Int, height: Int): CallMontageLayerScene? =
        CallMontageRendererLayers.layers(style, person, caption, width, height)

    /** Le ton de la case : `noir` réduit sa photo à sa luminance seule, les autres la laissent en couleur. */
    fun tone(style: CallMontageStyle): CallFrameTone =
        if (style == CallMontageStyle.NOIR) CallFrameTone.LUMINOSITY else CallFrameTone.COLOR

    private fun createBitmap(width: Int, height: Int, colorSpace: ColorSpace?): Bitmap? = runCatching {
        if (colorSpace != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888, true, colorSpace)
        } else {
            Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        }
    }.getOrNull()
}

internal object CallMontageRendererLayers {
    /** La découpe déborde le trou de deux pixels : aucun liseré translucide au bord antialiasé. */
    const val MASK_BLEED = 2f

    fun layers(style: CallMontageStyle, person: CallFramePerson, caption: CallMontageCaption, width: Int, height: Int): CallMontageLayerScene? {
        if (width < 1 || height < 1) return null
        val hole = CallMontageHole()
        val overlay = CallMontageRenderer.render(style, listOf(CallMontagePhoto(person.id, person.name, null, hole)), width, height, caption)
            ?: return null
        val path = hole.path ?: return null
        val toCanvas = hole.toCanvas
        val placed = Path().also { path.transform(toCanvas, it) }
        val mask = holeMask(placed, width, height) ?: return null
        val layerHole = CallMontageLayerHole(placed, hole.frame, toCanvas, mask.first, mask.second, mask.third)
        return CallMontageLayerScene("classic-${style.raw}", person, width, height, overlay, layerHole, CallMontageRenderer.tone(style))
    }

    /** Le chemin posé, rempli en blanc dans un fragment borné au trou : jamais un masque de toute la toile. */
    private fun holeMask(placed: Path, width: Int, height: Int): Triple<Bitmap, Int, Int>? {
        val bounds = android.graphics.RectF().also { placed.computeBounds(it, true) }
        val margin = MASK_BLEED * 2
        val left = maxOf(0, Math.floor((bounds.left - margin).toDouble()).toInt())
        val top = maxOf(0, Math.floor((bounds.top - margin).toDouble()).toInt())
        val right = minOf(width, Math.ceil((bounds.right + margin).toDouble()).toInt())
        val bottom = minOf(height, Math.ceil((bounds.bottom + margin).toDouble()).toInt())
        if (right - left < 1 || bottom - top < 1) return null
        val patch = runCatching { Bitmap.createBitmap(right - left, bottom - top, Bitmap.Config.ARGB_8888) }.getOrNull() ?: return null
        val canvas = Canvas(patch)
        canvas.translate(-left.toFloat(), -top.toFloat())
        val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.WHITE }
        canvas.drawPath(placed, fill)
        val edge = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.WHITE
            style = Paint.Style.STROKE
            strokeWidth = MASK_BLEED * 2
        }
        canvas.drawPath(placed, edge)
        return Triple(patch, left, top)
    }
}
