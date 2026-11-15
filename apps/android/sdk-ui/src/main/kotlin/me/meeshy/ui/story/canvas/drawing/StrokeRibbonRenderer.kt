package me.meeshy.ui.story.canvas.drawing

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import androidx.compose.ui.graphics.toArgb
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StrokeTool
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.hexColor

/** Une opération de peinture en espace design (1080×1920) : un halo de sélection ou un ruban rempli. */
public sealed interface StrokeOp {
    public val path: Path
    public val argb: Int

    /** Ligne centrale épaissie, bouts ronds, indigo translucide : le repère du trait sélectionné. */
    public class Halo(override val path: Path, override val argb: Int, public val widthDesign: Float) : StrokeOp

    /** Polygone rempli (ruban à largeur variable + bouchons ronds). */
    public class Ribbon(override val path: Path, override val argb: Int) : StrokeOp
}

/**
 * Rendu des traits par la géométrie pure de `:core:model` — miroir de `MeeshyStrokeCanvas` / `StoryStrokeRasterizer`.
 * Un seul producteur d'opérations sert l'aperçu, le lecteur et l'export : même épaisseur, même lissage, même
 * marqueur à 45 %. Les traits d'outil gomme et les traits vides ne sont jamais rendus.
 */
public object StrokeRibbonRenderer {
    public const val MARKER_ALPHA: Float = 0.45f
    public const val HALO_ALPHA: Float = 0.55f
    public const val HALO_EXTRA_DESIGN: Float = 14f

    public fun isPaintable(stroke: StoryDrawingStroke): Boolean =
        stroke.tool != StrokeTool.ERASER && stroke.points.isNotEmpty()

    public fun plan(
        strokes: List<StoryDrawingStroke>,
        selectedId: String? = null,
        cache: StrokeGeometryCache = StrokeGeometryCache(),
    ): List<StrokeOp> = strokes.filter(::isPaintable).flatMap { opsFor(it, it.id == selectedId, cache) }

    private fun opsFor(stroke: StoryDrawingStroke, selected: Boolean, cache: StrokeGeometryCache): List<StrokeOp> {
        val shape = cache.shapeOf(stroke)
        if (shape.widthPoints.isEmpty()) return emptyList()
        val isMarker = stroke.tool == StrokeTool.MARKER
        val ops = ArrayList<StrokeOp>(2)
        if (selected) {
            val haloWidth = maxOf(1.0, stroke.width * (if (isMarker) 2 else 1)).toFloat() + HALO_EXTRA_DESIGN
            ops += StrokeOp.Halo(centerline(shape), withAlpha(MeeshyPalette.Indigo400.toArgb(), HALO_ALPHA), haloWidth)
        }
        val base = hexColor(stroke.colorHex).takeIf { it != androidx.compose.ui.graphics.Color.Unspecified }?.toArgb()
            ?: android.graphics.Color.BLACK
        ops += StrokeOp.Ribbon(ribbon(shape), withAlpha(base, if (isMarker) MARKER_ALPHA else 1f))
        return ops
    }

    private fun withAlpha(argb: Int, factor: Float): Int {
        val alpha = ((argb ushr 24) * factor).toInt().coerceIn(0, 255)
        return (alpha shl 24) or (argb and 0x00FFFFFF)
    }

    private fun centerline(shape: StrokeShape): Path = Path().apply {
        shape.widthPoints.forEachIndexed { i, wp ->
            if (i == 0) moveTo(wp.point.x.toFloat(), wp.point.y.toFloat()) else lineTo(wp.point.x.toFloat(), wp.point.y.toFloat())
        }
    }

    /** Sommets gauche en avant (0,2,4…) puis droite en arrière (…,5,3,1), fermés, plus les bouchons ronds. */
    private fun ribbon(shape: StrokeShape): Path = Path().apply {
        val v = shape.geometry.vertices
        if (v.isNotEmpty()) {
            moveTo(v[0].x.toFloat(), v[0].y.toFloat())
            for (i in 2 until v.size step 2) lineTo(v[i].x.toFloat(), v[i].y.toFloat())
            for (i in v.size - 1 downTo 1 step 2) lineTo(v[i].x.toFloat(), v[i].y.toFloat())
            close()
        }
        shape.geometry.caps.forEach {
            addCircle(it.center.x.toFloat(), it.center.y.toFloat(), it.radius.toFloat(), Path.Direction.CW)
        }
    }

    /** Peint les opérations sur [canvas] déjà mis à l'échelle design → écran (étirement non uniforme). */
    public fun draw(canvas: Canvas, ops: List<StrokeOp>) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        ops.forEach { op ->
            paint.reset()
            paint.isAntiAlias = true
            paint.color = op.argb
            when (op) {
                is StrokeOp.Halo -> {
                    paint.style = Paint.Style.STROKE
                    paint.strokeWidth = op.widthDesign
                    paint.strokeCap = Paint.Cap.ROUND
                    paint.strokeJoin = Paint.Join.ROUND
                }
                is StrokeOp.Ribbon -> paint.style = Paint.Style.FILL
            }
            canvas.drawPath(op.path, paint)
        }
    }
}
