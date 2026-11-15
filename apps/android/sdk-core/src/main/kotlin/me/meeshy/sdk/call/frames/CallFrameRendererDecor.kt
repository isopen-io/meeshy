package me.meeshy.sdk.call.frames

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import me.meeshy.sdk.call.frames.CallFrameRendererKit.argb
import me.meeshy.sdk.call.frames.CallFrameRendererKit.fillPaint
import me.meeshy.sdk.call.frames.CallFrameRendererKit.strokePaint
import me.meeshy.sdk.call.frames.CallFrameRendererKit.toPath
import me.meeshy.sdk.call.frames.CallFrameRendererKit.withDash
import me.meeshy.sdk.call.frames.CallFrameRendererKit.withShadow
import me.meeshy.sdk.model.call.frames.CallFrameBackdropGeometry
import me.meeshy.sdk.model.call.frames.CallFrameBorderGeometry
import me.meeshy.sdk.model.call.frames.CallFrameBorderStep
import me.meeshy.sdk.model.call.frames.CallFramePaintStyle
import me.meeshy.sdk.model.call.frames.CallFramePatternGeometry
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit

/**
 * Le fond, les quatorze motifs et les quatorze bordures (§ 4.3) — le port de `frame-paint-decor.ts` et de
 * `CallFrameRenderer+Decor.swift`. Tout se mesure en `unit` : une vignette de 108 × 192 et une capture de
 * 1080 × 1920 montrent le même dessin.
 */
internal object CallFrameRendererDecor {

    /** Le noir opaque d'abord : un dégradé qui ne couvre pas tout ne laisse jamais de transparent. */
    fun paintBackground(canvas: Canvas, stage: CallFrameStage) {
        canvas.drawColor(Color.BLACK)
        val plan = CallFrameBackdropGeometry.plan(stage.look.background, stage.texts.accentHex, stage.width.toDouble(), stage.height.toDouble())
        CallFrameRendererKit.paintBackdrop(canvas, plan, stage.bounds)
    }

    fun paintPattern(canvas: Canvas, stage: CallFrameStage) {
        val pattern = stage.look.pattern ?: return
        val plan = CallFramePatternGeometry.plan(pattern.kind, stage.width.toDouble(), stage.height.toDouble(), stage.unit)
        val ink = CallFrameRenderKit.color(pattern.color)
        if (plan.fill.isNotEmpty()) canvas.drawPath(toPath(plan.fill), fillPaint(ink, pattern.opacity))
        if (plan.stroke.isNotEmpty()) canvas.drawPath(toPath(plan.stroke), strokePaint(ink, plan.lineWidth, pattern.opacity))
    }

    fun paintBorder(canvas: Canvas, stage: CallFrameStage) {
        val border = stage.look.border ?: return
        CallFrameBorderGeometry.plan(border, stage.width.toDouble(), stage.height.toDouble(), stage.unit).forEach { step ->
            when (step) {
                is CallFrameBorderStep.Shape -> paintShape(canvas, step)
                is CallFrameBorderStep.Glow -> CallFrameRendererKit.glow(canvas, step.cx, step.cy, step.radius, step.color)
                is CallFrameBorderStep.Bulb -> paintBulb(canvas, step)
            }
        }
    }

    private fun paintShape(canvas: Canvas, step: CallFrameBorderStep.Shape) {
        val evenOdd = step.style == CallFramePaintStyle.FILL_EVEN_ODD
        val path = toPath(step.ops, evenOdd)
        val paint = if (step.style == CallFramePaintStyle.STROKE) {
            strokePaint(step.color, step.width).withDash(step.dash)
        } else {
            fillPaint(step.color)
        }
        canvas.drawPath(path, paint.withShadow(step.shadow))
    }

    /** Une ampoule : blanc au point de lumière (en haut à gauche), la couleur de la bordure sur le pourtour. */
    private fun paintBulb(canvas: Canvas, step: CallFrameBorderStep.Bulb) {
        val r = step.radius.toFloat()
        val cx = step.cx.toFloat()
        val cy = step.cy.toFloat()
        val shader = RadialGradient(
            cx - r * 0.3f, cy - r * 0.3f, r * 1.42f,
            intArrayOf(Color.WHITE, argb(step.color)), floatArrayOf(0f, 1f), Shader.TileMode.CLAMP,
        )
        canvas.drawCircle(cx, cy, r, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.shader = shader })
    }
}
