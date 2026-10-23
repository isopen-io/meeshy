package me.meeshy.sdk.call.frames

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import me.meeshy.sdk.model.call.frames.CallFrameBackdropGeometry
import me.meeshy.sdk.model.call.frames.CallFrameBackdropPlan
import me.meeshy.sdk.model.call.frames.CallFrameColor
import me.meeshy.sdk.model.call.frames.CallFramePathOp
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.frames.CallFrameShadow
import kotlin.math.roundToInt

/**
 * Les outils communs du canevas Android — le pendant, côté plateforme, de `CallFrameRenderer+Kit.swift` :
 * conversion des tracés et des couleurs, dégradés, halos, peintures. Les formules (formes, motifs, bordures)
 * vivent dans `:core:model` ; ici, seul le dessin.
 */
internal object CallFrameRendererKit {

    fun argb(color: CallFrameColor, alphaScale: Double = 1.0): Int {
        fun channel(value: Double) = (value.coerceIn(0.0, 1.0) * 255).roundToInt()
        return Color.argb(channel(color.alpha * alphaScale), channel(color.red), channel(color.green), channel(color.blue))
    }

    fun rectF(rect: CallFrameRect): RectF =
        RectF(rect.minX.toFloat(), rect.minY.toFloat(), rect.maxX.toFloat(), rect.maxY.toFloat())

    /** Rejoue un tracé du modèle sur un `Path` ; [evenOdd] pour les anneaux (deux rectangles emboîtés). */
    fun toPath(ops: List<CallFramePathOp>, evenOdd: Boolean = false): Path {
        val path = Path()
        path.fillType = if (evenOdd) Path.FillType.EVEN_ODD else Path.FillType.WINDING
        ops.forEach { op ->
            when (op) {
                is CallFramePathOp.MoveTo -> path.moveTo(op.x.toFloat(), op.y.toFloat())
                is CallFramePathOp.LineTo -> path.lineTo(op.x.toFloat(), op.y.toFloat())
                is CallFramePathOp.QuadTo -> path.quadTo(op.cx.toFloat(), op.cy.toFloat(), op.x.toFloat(), op.y.toFloat())
                is CallFramePathOp.CubicTo -> path.cubicTo(
                    op.c1x.toFloat(), op.c1y.toFloat(), op.c2x.toFloat(), op.c2y.toFloat(), op.x.toFloat(), op.y.toFloat(),
                )
                is CallFramePathOp.Arc -> {
                    val r = op.radius.toFloat()
                    val oval = RectF((op.cx - r).toFloat(), (op.cy - r).toFloat(), (op.cx + r).toFloat(), (op.cy + r).toFloat())
                    path.arcTo(oval, Math.toDegrees(op.start).toFloat(), Math.toDegrees(op.sweep).toFloat(), false)
                }
                is CallFramePathOp.AddRect -> path.addRect(rectF(op.rect), Path.Direction.CW)
                is CallFramePathOp.AddRoundRect ->
                    path.addRoundRect(rectF(op.rect), op.radius.toFloat(), op.radius.toFloat(), Path.Direction.CW)
                is CallFramePathOp.AddOval -> path.addOval(rectF(op.rect), Path.Direction.CW)
                CallFramePathOp.Close -> path.close()
            }
        }
        return path
    }

    fun fillPaint(color: CallFrameColor, alphaScale: Double = 1.0): Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        this.color = argb(color, alphaScale)
    }

    /** Un trait à bouts et jointures arrondis, comme tous ceux des cadres. */
    fun strokePaint(color: CallFrameColor, width: Double, alphaScale: Double = 1.0): Paint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = width.toFloat()
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            this.color = argb(color, alphaScale)
        }

    /** Le flou d'une ombre CoreGraphics (`blur` ≈ 2 σ) rendu en rayon Android (σ ≈ 0,577 r + 0,5). */
    fun shadowRadius(blur: Double): Float = (((blur / 2) - 0.5) / 0.57735).coerceAtLeast(0.1).toFloat()

    fun Paint.withShadow(shadow: CallFrameShadow?, dy: Float = 0f): Paint = apply {
        if (shadow != null) setShadowLayer(shadowRadius(shadow.blur), 0f, dy, argb(shadow.color))
    }

    fun Paint.withShadow(blur: Double, color: CallFrameColor, dy: Double = 0.0): Paint = apply {
        setShadowLayer(shadowRadius(blur), 0f, dy.toFloat(), argb(color))
    }

    fun Paint.withDash(dash: List<Double>?): Paint = apply {
        if (dash != null && dash.size >= 2) pathEffect = DashPathEffect(dash.map { it.toFloat() }.toFloatArray(), 0f)
    }

    fun linearShader(colors: List<CallFrameColor>, x0: Double, y0: Double, x1: Double, y1: Double): Shader? {
        if (colors.isEmpty()) return null
        val served = if (colors.size == 1) listOf(colors[0], colors[0]) else colors
        return LinearGradient(
            x0.toFloat(), y0.toFloat(), x1.toFloat(), y1.toFloat(),
            served.map { argb(it) }.toIntArray(),
            CallFrameBackdropGeometry.stops(served.size).map { it.toFloat() }.toFloatArray(),
            Shader.TileMode.CLAMP,
        )
    }

    fun radialShader(colors: List<CallFrameColor>, cx: Double, cy: Double, radius: Double): Shader? {
        if (colors.isEmpty() || radius <= 0) return null
        val served = if (colors.size == 1) listOf(colors[0], colors[0]) else colors
        return RadialGradient(
            cx.toFloat(), cy.toFloat(), radius.toFloat(),
            served.map { argb(it) }.toIntArray(),
            CallFrameBackdropGeometry.stops(served.size).map { it.toFloat() }.toFloatArray(),
            Shader.TileMode.CLAMP,
        )
    }

    fun fillRect(canvas: Canvas, rect: CallFrameRect, shader: Shader?) {
        shader ?: return
        canvas.drawRect(rectF(rect), Paint().apply { this.shader = shader })
    }

    fun paintBackdrop(canvas: Canvas, plan: CallFrameBackdropPlan, bounds: CallFrameRect) {
        when (plan) {
            is CallFrameBackdropPlan.Solid -> canvas.drawRect(rectF(bounds), fillPaint(plan.color))
            is CallFrameBackdropPlan.Linear -> fillRect(canvas, bounds, linearShader(plan.colors, plan.ends.x0, plan.ends.y0, plan.ends.x1, plan.ends.y1))
            is CallFrameBackdropPlan.Radial -> fillRect(canvas, bounds, radialShader(plan.colors, plan.cx, plan.cy, plan.radius))
            is CallFrameBackdropPlan.Accent -> {
                paintBackdrop(canvas, plan.gradient, bounds)
                paintBackdrop(canvas, plan.light, bounds)
            }
        }
    }

    /** Un halo qui s'éteint à [radius] : [color] au centre, transparent au bord. */
    fun glow(canvas: Canvas, cx: Double, cy: Double, radius: Double, color: CallFrameColor) {
        if (radius <= 0) return
        val shader = radialShader(listOf(color, color.copy(alpha = 0.0)), cx, cy, radius) ?: return
        canvas.drawCircle(cx.toFloat(), cy.toFloat(), radius.toFloat(), Paint(Paint.ANTI_ALIAS_FLAG).apply { this.shader = shader })
    }
}
