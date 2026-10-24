package me.meeshy.sdk.model.call.montage

import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import me.meeshy.sdk.model.call.frames.CallFrameRect

/** Le glamour (#8580) — portage LITTÉRAL de `CallMontageLayout+Glamour.swift`. */
internal object CallMontageGlamourLayout {

    fun captionBand(style: CallMontageStyle, canvas: CallMontageCanvas): CallFrameRect? = when (style) {
        CallMontageStyle.COVER -> CallFrameRect(0.0, canvas.height * 0.02, canvas.width, canvas.height * 0.12)
        CallMontageStyle.REDCARPET -> CallFrameRect(0.0, canvas.height * 0.07, canvas.width, canvas.height * 0.12)
        CallMontageStyle.NEON -> CallFrameRect(0.0, canvas.height * 0.03, canvas.width, canvas.height * 0.1)
        CallMontageStyle.GOLD, CallMontageStyle.NOIR -> CallFrameRect(0.0, canvas.height * 0.9, canvas.width, canvas.height * 0.07)
        else -> null
    }

    fun cover(count: Int, bounds: CallFrameRect): List<CallMontageSlot> {
        val margin = bounds.width * 0.06
        val gap = bounds.width * 0.03
        val medallions = medallionFrames(count - 1, bounds, margin, gap)
        val heroTop = bounds.height * 0.15
        val heroBottom = (medallions.minOfOrNull { it.minY } ?: (bounds.height * 0.95)) - gap
        val hero = CallFrameRect(margin, heroTop, bounds.width - margin * 2, heroBottom - heroTop)
        return listOf(CallMontageSlot(hero, CallMontageShape.ROUNDED_RECTANGLE, bounds.width * 0.02)) +
            medallions.map { CallMontageSlot(it, CallMontageShape.CIRCLE) }
    }

    fun gold(count: Int, bounds: CallFrameRect): List<CallMontageSlot> {
        val area = CallFrameRect(bounds.width * 0.1, bounds.height * 0.06, bounds.width * 0.8, bounds.height * 0.82)
        return CallMontageLayout.cells(count, area, bounds.width * 0.08).map { cell ->
            val width = min(cell.width, cell.height / CallMontageLayout.GOLD_CAMEO_ASPECT) * 0.9
            val height = width * CallMontageLayout.GOLD_CAMEO_ASPECT
            CallMontageSlot(CallFrameRect(cell.midX - width / 2, cell.midY - height / 2, width, height), CallMontageShape.CIRCLE)
        }
    }

    fun redCarpet(count: Int, bounds: CallFrameRect): List<CallMontageSlot> {
        val area = CallFrameRect(bounds.width * 0.05, bounds.height * 0.24, bounds.width * 0.9, bounds.height * 0.58)
        val rows = if (count <= 4) 1 else if (count <= 8) 2 else 3
        val columns = ceil(count.toDouble() / rows).toInt()
        val gap = bounds.width * 0.03
        val columnWidth = (area.width - gap * (columns - 1)) / columns
        val rowHeight = (area.height - gap * (rows - 1)) / rows
        val width = min(columnWidth, rowHeight / CallMontageLayout.REDCARPET_ASPECT)
        val height = width * CallMontageLayout.REDCARPET_ASPECT
        val blockHeight = rows * height + (rows - 1) * gap
        val bottom = area.maxY - (area.height - blockHeight) / 2
        return (0 until count).map { index ->
            val row = index / columns
            val column = index % columns
            val inRow = min(columns, count - row * columns)
            val rowWidth = inRow * width + (inRow - 1) * gap
            val left = area.midX - rowWidth / 2
            val top = bottom - (rows - row) * height - (rows - row - 1) * gap
            CallMontageSlot(
                CallFrameRect(left + column * (width + gap), top, width, height),
                CallMontageShape.ROUNDED_RECTANGLE,
                bounds.width * 0.015,
            )
        }
    }

    fun filmStrips(count: Int, canvas: CallMontageCanvas): List<CallFrameRect> {
        val served = min(max(count, 0), CallMontageLayout.MAX_PARTICIPANTS)
        if (served == 0 || canvas.width <= 0 || canvas.height <= 0) return emptyList()
        val columns = if (served <= 5) 1 else 2
        val gap = canvas.width * 0.05
        val width = if (columns == 1) canvas.width * 0.62 else (canvas.width * 0.9 - gap) / 2
        val left = (canvas.width - columns * width - (columns - 1) * gap) / 2
        return (0 until columns).map { column -> CallFrameRect(left + column * (width + gap), 0.0, width, canvas.height) }
    }

    fun film(count: Int, bounds: CallFrameRect): List<CallMontageSlot> {
        val strips = filmStrips(count, CallMontageCanvas(bounds.width, bounds.height))
        val first = strips.firstOrNull() ?: return emptyList()
        val rows = ceil(count.toDouble() / strips.size).toInt()
        val gap = bounds.height * 0.02
        val usable = bounds.height * 0.9
        val maxHeight = (usable - gap * (rows - 1)) / rows
        val height = min(first.width * 0.74 * CallMontageLayout.FILM_FRAME_ASPECT, maxHeight)
        val width = height / CallMontageLayout.FILM_FRAME_ASPECT
        val blockHeight = rows * height + (rows - 1) * gap
        val top = (bounds.height - blockHeight) / 2
        return (0 until count).map { index ->
            val strip = strips[index / rows]
            val row = index % rows
            CallMontageSlot(CallFrameRect(strip.midX - width / 2, top + row * (height + gap), width, height), CallMontageShape.RECTANGLE)
        }
    }

    fun neon(count: Int, bounds: CallFrameRect): List<CallMontageSlot> {
        val area = CallFrameRect(bounds.width * 0.08, bounds.height * 0.16, bounds.width * 0.84, bounds.height * 0.78)
        return CallMontageLayout.cells(count, area, bounds.width * 0.07)
            .map { CallMontageSlot(it, CallMontageShape.ROUNDED_RECTANGLE, bounds.width * 0.04) }
    }

    fun noir(count: Int, bounds: CallFrameRect): List<CallMontageSlot> {
        val area = CallFrameRect(bounds.width * 0.05, bounds.height * 0.04, bounds.width * 0.9, bounds.height * 0.84)
        return CallMontageLayout.cells(count, area, bounds.width * 0.015).map { CallMontageSlot(it, CallMontageShape.RECTANGLE) }
    }

    private fun medallionFrames(count: Int, bounds: CallFrameRect, margin: Double, gap: Double): List<CallFrameRect> {
        if (count <= 0) return emptyList()
        val columns = min(count, 5)
        val rows = ceil(count.toDouble() / columns).toInt()
        val diameter = min(bounds.width * 0.2, (bounds.width - margin * 2 - gap * (columns - 1)) / columns)
        val bottom = bounds.height * 0.96
        return (0 until count).map { index ->
            val row = index / columns
            val column = index % columns
            val top = bottom - (rows - row) * diameter - (rows - row - 1) * gap
            CallFrameRect(bounds.width - margin - (column + 1) * diameter - column * gap, top, diameter, diameter)
        }
    }
}
