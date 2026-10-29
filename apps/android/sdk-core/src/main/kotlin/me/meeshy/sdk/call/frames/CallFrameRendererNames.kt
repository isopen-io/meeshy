package me.meeshy.sdk.call.frames

import android.graphics.Canvas
import android.graphics.Path
import android.graphics.RectF
import me.meeshy.sdk.call.frames.CallFrameOrnamentPieces.fill
import me.meeshy.sdk.call.frames.CallFrameOrnamentPieces.stroke
import me.meeshy.sdk.call.frames.CallFrameRendererKit.fillPaint
import me.meeshy.sdk.call.frames.CallFrameRendererKit.rectF
import me.meeshy.sdk.call.frames.CallFrameRendererKit.toPath
import me.meeshy.sdk.call.frames.CallFrameRendererKit.withShadow
import me.meeshy.sdk.model.call.frames.CallFrameBubbleCorner
import me.meeshy.sdk.model.call.frames.CallFrameColor
import me.meeshy.sdk.model.call.frames.CallFrameNameItem
import me.meeshy.sdk.model.call.frames.CallFrameNameLayout
import me.meeshy.sdk.model.call.frames.CallFrameNamePlacement
import me.meeshy.sdk.model.call.frames.CallFrameNameStyle
import me.meeshy.sdk.model.call.frames.CallFrameNames
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit
import me.meeshy.sdk.model.call.frames.CallFrameShapeGeometry
import me.meeshy.sdk.model.call.frames.CallFrameText
import me.meeshy.sdk.model.call.frames.CallFrameTextPlan
import kotlin.math.max
import kotlin.math.min

private fun Double.f(): Float = toFloat()

/**
 * **LES NOMS D'UN CADRE** (#13694) — le port de `paintNames` du web et de `CallFrameRenderer+Names.swift` :
 * sous la case (légende, banderole, étiquette), dans le pied d'une carte, DANS la case sur un fond propre
 * (plaque, pastille, bulle), ou en liste dans la réserve basse. Où et comment se décide dans `:core:model`
 * ([CallFrameNameLayout]) ; ici, seul le tracé.
 */
internal object CallFrameRendererNames {

    private fun gray(white: Double, alpha: Double) = CallFrameColor(white, white, white, alpha)

    fun paint(canvas: Canvas, stage: CallFrameStage, plan: CallFrameTextPlan, fonts: CallFrameFontBook) {
        val scene = stage.textScene
        if (scene.look.names.style == CallFrameNameStyle.LIST) {
            paintList(canvas, stage, plan, fonts)
            return
        }
        CallFrameNameLayout.placements(scene, plan).forEach { (item, placement) ->
            val px = CallFrameNameLayout.namePx(scene, item.box)
            when (placement) {
                CallFrameNamePlacement.FOOT -> paintFoot(canvas, stage, item, px, fonts)
                CallFrameNamePlacement.BELOW -> paintBelow(canvas, stage, item, px, fonts)
                CallFrameNamePlacement.SCRIM -> paintPlate(canvas, stage, item, px, scrim = true, fonts)
                CallFrameNamePlacement.PLATE -> paintPlate(canvas, stage, item, px, scrim = false, fonts)
                CallFrameNamePlacement.BADGE -> paintBadge(canvas, stage, item, px, fonts)
                CallFrameNamePlacement.BUBBLE -> paintBubble(canvas, stage, item, px, fonts)
            }
        }
    }

    /** Les lignes d'un nom, empilées et centrées sur ([cx], [cy]), chacune ajustée à [maxWidth]. */
    private fun nameLines(
        canvas: Canvas,
        names: CallFrameNames,
        lines: List<String>,
        cx: Double,
        cy: Double,
        px: Double,
        maxWidth: Double,
        fonts: CallFrameFontBook,
    ) {
        val heights = lines.indices.map { CallFrameNameLayout.lineSize(it, px) * 1.2 }
        val total = heights.sum()
        lines.forEachIndexed { index, line ->
            val size = CallFrameNameLayout.lineSize(index, px)
            val fitted = CallFrameText.fit(line, maxWidth, size) { value, at -> fonts.width(value, names.font, at) }
            val y = cy - total / 2 + heights.take(index).sum() + heights[index] / 2
            val ink = if (index == 0) CallFrameRenderKit.color(names.color) else CallFrameRenderKit.tint(names.color, 0.82)
            CallFrameRendererText.inkText(canvas, fitted.text, cx, y, names.font, fitted.size, names.color, fonts, ink = ink)
        }
    }

    private fun paintFoot(canvas: Canvas, stage: CallFrameStage, item: CallFrameNameItem, px: Double, fonts: CallFrameFontBook) {
        val card = stage.look.slot.card ?: return
        val photo = CallFrameRenderKit.photoRect(item.box.rect, card)
        val footTop = photo.maxY
        val footHeight = item.box.rect.maxY - footTop
        CallFrameRendererShapes.inBox(canvas, item.box) {
            nameLines(
                canvas, stage.look.names, item.lines, photo.midX, footTop + footHeight / 2,
                min(px * 1.1, footHeight / (item.lines.size + 0.6)), photo.width * 0.92, fonts,
            )
        }
    }

    private fun paintPlate(canvas: Canvas, stage: CallFrameStage, item: CallFrameNameItem, px: Double, scrim: Boolean, fonts: CallFrameFontBook) {
        val names = stage.look.names
        val slot = stage.look.slot
        val photo = CallFrameRenderKit.photoRect(item.box.rect, slot.card)
        val inner = CallFrameShapeGeometry.shapeInnerRect(item.box.shape, photo)
        val band = CallFrameNameLayout.blockHeight(item.lines.size, px) + px * 0.7
        val atTop = CallFrameNameLayout.freeBandIsTop(stage.textScene, item.box)
        val top = if (atTop) inner.minY else inner.maxY - band
        val shade = if (CallFrameRenderKit.perceived(names.color) > 0.5) gray(0.0, 0.62) else gray(1.0, 0.72)
        CallFrameRendererShapes.inBox(canvas, item.box) {
            canvas.save()
            canvas.clipPath(toPath(CallFrameShapeGeometry.slotPath(item.box, photo, slot)))
            if (scrim) {
                val from = if (atTop) photo.minY else top - band * 0.6
                val to = if (atTop) top + band * 1.6 else photo.maxY
                val clear = gray(0.0, 0.0)
                canvas.save()
                canvas.clipRect(photo.minX.f(), from.f(), photo.maxX.f(), to.f())
                CallFrameOrnamentPieces.linear(canvas, if (atTop) listOf(shade, clear) else listOf(clear, shade), 0.0, from, 0.0, to)
                canvas.restore()
            } else {
                val area = if (atTop) {
                    CallFrameRect(photo.minX, photo.minY, photo.width, top + band - photo.minY)
                } else {
                    CallFrameRect(photo.minX, top, photo.width, photo.maxY - top)
                }
                canvas.drawRect(rectF(area), fillPaint(CallFrameNameLayout.defaultFill(names)))
            }
            nameLines(canvas, names, item.lines, inner.midX, top + band / 2, px, inner.width * 0.9, fonts)
            canvas.restore()
        }
    }

    private fun roundRect(rect: CallFrameRect, radius: Double): Path = Path().apply {
        addRoundRect(RectF(rect.minX.f(), rect.minY.f(), rect.maxX.f(), rect.maxY.f()), radius.f(), radius.f(), Path.Direction.CW)
    }

    private fun paintBadge(canvas: Canvas, stage: CallFrameStage, item: CallFrameNameItem, px: Double, fonts: CallFrameFontBook) {
        val names = stage.look.names
        val photo = CallFrameRenderKit.photoRect(item.box.rect, stage.look.slot.card)
        val inner = CallFrameShapeGeometry.shapeInnerRect(item.box.shape, photo)
        val small = px * 0.82
        val width = min(inner.width * 0.86, CallFrameNameLayout.widestLine(item.lines, small, names, fonts) + small * 1.3)
        val height = CallFrameNameLayout.blockHeight(item.lines.size, small) + small * 0.55
        val y = if (CallFrameNameLayout.freeBandIsTop(stage.textScene, item.box)) inner.minY + small * 0.5 else inner.maxY - height - small * 0.5
        val pill = CallFrameRect(inner.minX + small * 0.5, y, width, height)
        CallFrameRendererShapes.inBox(canvas, item.box) {
            canvas.drawPath(roundRect(pill, min(height / 2, small)), fillPaint(CallFrameNameLayout.defaultFill(names)).withShadow(small * 0.4, gray(0.0, 0.25)))
            nameLines(canvas, names, item.lines, pill.midX, pill.midY, small, width - small, fonts)
        }
    }

    private fun paintBubble(canvas: Canvas, stage: CallFrameStage, item: CallFrameNameItem, px: Double, fonts: CallFrameFontBook) {
        val names = stage.look.names
        val photo = CallFrameRenderKit.photoRect(item.box.rect, stage.look.slot.card)
        val inner = CallFrameShapeGeometry.shapeInnerRect(item.box.shape, photo)
        val small = px * 0.85
        val width = min(inner.width * 0.72, CallFrameNameLayout.widestLine(item.lines, small, names, fonts) + small * 1.6)
        val height = CallFrameNameLayout.blockHeight(item.lines.size, small) + small * 0.9
        val corner = CallFrameNameLayout.freeCorner(stage.textScene, item.box)
        val x = if (corner == CallFrameBubbleCorner.TOP_RIGHT) inner.maxX - width - small * 0.4 else inner.minX + small * 0.4
        val y = if (corner == CallFrameBubbleCorner.BOTTOM_LEFT) inner.maxY - height - small * 1.2 else inner.minY + small * 0.4
        val fillHex = names.fill ?: "#FFFFFF"
        val lineWidth = max(1.0, small * 0.08)
        CallFrameRendererShapes.inBox(canvas, item.box) {
            val shape = roundRect(CallFrameRect(x, y, width, height), height * 0.45).apply {
                addPath(polygon(x + width * 0.3 to y + height - 1, x + width * 0.14 to y + height + small * 0.7, x + width * 0.46 to y + height - 1))
            }
            canvas.drawPath(shape, fillPaint(CallFrameRenderKit.color(fillHex)).withShadow(small * 0.35, gray(0.0, 0.22)))
            stroke(canvas, shape, CallFrameRenderKit.mix(fillHex, "#000000", 0.55), lineWidth)
            canvas.drawRect(
                rectF(CallFrameRect(x + width * 0.3 + lineWidth, y + height - lineWidth * 1.5, width * 0.16 - lineWidth * 2, lineWidth * 2)),
                fillPaint(CallFrameRenderKit.color(fillHex)),
            )
            nameLines(canvas, names, item.lines, x + width / 2, y + height / 2, small, width - small, fonts)
        }
    }

    /** Sous la case : la légende, la banderole à bouts pliés, l'étiquette manuscrite inclinée. */
    private fun paintBelow(canvas: Canvas, stage: CallFrameStage, item: CallFrameNameItem, px: Double, fonts: CallFrameFontBook) {
        val names = stage.look.names
        val own = CallFrameRenderKit.footprint(item.box)
        val cx = own.midX
        val height = CallFrameNameLayout.blockHeight(item.lines.size, px)
        val textWidth = CallFrameNameLayout.widestLine(item.lines, px, names, fonts)
        when (names.style) {
            CallFrameNameStyle.CAPTION ->
                nameLines(canvas, names, item.lines, cx, own.maxY + px * 0.3 + height / 2, px, max(own.width, stage.unit * 0.3), fonts)
            CallFrameNameStyle.RIBBON -> {
                val fillInk = CallFrameNameLayout.defaultFill(names)
                val bandHeight = height + px * 0.55
                val width = min(own.width * 0.96, textWidth + px * 2.2)
                val top = own.maxY + px * 0.3
                val left = cx - width / 2
                val tail = bandHeight * 0.55
                val tails = Path()
                listOf(-1.0, 1.0).forEach { side ->
                    val edge = if (side < 0) left + tail * 0.5 else left + width - tail * 0.5
                    val outer = edge + side * tail
                    tails.addPath(
                        polygon(
                            edge to top + bandHeight * 0.22, outer to top + bandHeight * 0.22,
                            outer - side * tail * 0.4 to top + bandHeight * 0.72, outer to top + bandHeight * 1.22,
                            edge to top + bandHeight * 1.22,
                        ),
                    )
                }
                fill(canvas, tails, mixColors(fillInk, CallFrameColor(0.0, 0.0, 0.0, 1.0), 0.3))
                canvas.drawRect(rectF(CallFrameRect(left, top, width, bandHeight)), fillPaint(fillInk))
                nameLines(canvas, names, item.lines, cx, top + bandHeight / 2, px, width - px, fonts)
            }
            else -> {
                val width = min(own.width * 0.9, textWidth + px * 2)
                val tagHeight = height + px * 0.6
                val top = own.maxY + px * 0.25
                canvas.save()
                canvas.translate(cx.f(), (top + tagHeight / 2).f())
                canvas.rotate(Math.toDegrees(-0.07).f())
                val label = polygon(
                    -width / 2 + tagHeight * 0.35 to -tagHeight / 2, width / 2 to -tagHeight / 2,
                    width / 2 to tagHeight / 2, -width / 2 + tagHeight * 0.35 to tagHeight / 2,
                    -width / 2 to 0.0,
                )
                val paper = fillPaint(CallFrameRenderKit.color(names.fill ?: "#FFF6E0")).withShadow(px * 0.3, gray(0.0, 0.25), px * 0.08)
                canvas.drawPath(label, paper)
                fill(canvas, Path().apply { circle(-width / 2 + tagHeight * 0.3, 0.0, tagHeight * 0.09) }, gray(0.0, 0.25))
                nameLines(canvas, names, item.lines, tagHeight * 0.18, 0.0, px, width - tagHeight * 0.6, fonts)
                canvas.restore()
            }
        }
    }

    private fun paintList(canvas: Canvas, stage: CallFrameStage, plan: CallFrameTextPlan, fonts: CallFrameFontBook) {
        val names = stage.look.names
        CallFrameNameLayout.listLines(stage.textScene, plan, fonts).forEach { line ->
            CallFrameRendererText.inkText(canvas, line.text, line.x, line.y, names.font, line.size, names.color, fonts)
        }
    }
}
