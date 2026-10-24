package me.meeshy.sdk.model.call.montage

import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import me.meeshy.sdk.model.call.frames.CallFrameRect

/**
 * LES CASES DES TREIZE MONTAGES CLASSIQUES — portage LITTÉRAL de `CallMontageLayout.swift`
 * (`apps/ios/Meeshy/Features/Main/Models/`) : mêmes proportions, même ordre des personnes.
 * Tout est en proportion de la toile ; repère : origine en haut à gauche, y vers le bas, degrés.
 * Le glamour (Couverture, Or, Tapis rouge, Pellicule, Néon, Noir) vit dans [CallMontageGlamourLayout].
 */
public object CallMontageLayout {
    public val captureSize: CallMontageCanvas = CallMontageCanvas(1080.0, 1920.0)
    public const val FACE_SIDE: Int = 1080
    public const val MAX_PARTICIPANTS: Int = 12
    public const val FILM_FRAME_ASPECT: Double = 0.75
    public const val GOLD_CAMEO_ASPECT: Double = 1.3
    public const val REDCARPET_ASPECT: Double = 4.0 / 3

    private const val POLAROID_BORDER = 0.068
    private const val POLAROID_FOOTER = 0.24
    private val POLAROID_TILTS = listOf(-6.0, 5.0, -4.0, 7.0, -3.0, 6.0)

    /** Une case par personne (au plus [MAX_PARTICIPANTS]), dans l'ordre des personnes. */
    public fun frames(style: CallMontageStyle, count: Int, canvas: CallMontageCanvas): List<CallMontageSlot> {
        val served = min(max(count, 0), MAX_PARTICIPANTS)
        if (served == 0 || canvas.width <= 0 || canvas.height <= 0) return emptyList()
        val bounds = canvas.bounds
        return when (style) {
            CallMontageStyle.SCREEN -> screen(served, bounds)
            CallMontageStyle.COVER -> CallMontageGlamourLayout.cover(served, bounds)
            CallMontageStyle.GOLD -> CallMontageGlamourLayout.gold(served, bounds)
            CallMontageStyle.REDCARPET -> CallMontageGlamourLayout.redCarpet(served, bounds)
            CallMontageStyle.FILM -> CallMontageGlamourLayout.film(served, bounds)
            CallMontageStyle.NEON -> CallMontageGlamourLayout.neon(served, bounds)
            CallMontageStyle.NOIR -> CallMontageGlamourLayout.noir(served, bounds)
            CallMontageStyle.GRID -> mosaic(served, bounds)
            CallMontageStyle.STRIP -> strip(served, bounds)
            CallMontageStyle.POLAROID -> polaroid(served, bounds)
            CallMontageStyle.MAGAZINE -> magazine(served, bounds)
            CallMontageStyle.COMIC -> comic(served, bounds)
            CallMontageStyle.HEART -> heart(served, bounds)
        }
    }

    /** (colonnes, rangées) de la grille équilibrée d'un groupe. */
    public fun gridDimensions(count: Int): Pair<Int, Int> = when {
        count <= 1 -> 1 to 1
        count == 2 -> 1 to 2
        count == 3 -> 1 to 3
        count == 4 -> 2 to 2
        count <= 6 -> 2 to 3
        count <= 9 -> 3 to 3
        else -> 3 to ceil(count / 3.0).toInt()
    }

    /** Les cellules de la grille dans [rect], la dernière rangée centrée. */
    public fun cells(count: Int, rect: CallFrameRect, gap: Double): List<CallFrameRect> {
        if (count <= 0) return emptyList()
        val (columns, rows) = gridDimensions(count)
        val width = (rect.width - gap * (columns - 1)) / columns
        val height = (rect.height - gap * (rows - 1)) / rows
        return (0 until count).map { index ->
            val row = index / columns
            val column = index % columns
            val inRow = min(columns, count - row * columns)
            val rowWidth = inRow * width + (inRow - 1) * gap
            val offset = (rect.width - rowWidth) / 2
            CallFrameRect(rect.minX + offset + column * (width + gap), rect.minY + row * (height + gap), width, height)
        }
    }

    /** La bande où le style pose son titre ; `null` pour les styles sans titre. */
    public fun captionBand(style: CallMontageStyle, canvas: CallMontageCanvas): CallFrameRect? = when (style) {
        CallMontageStyle.STRIP -> CallFrameRect(0.0, canvas.height * 0.86, canvas.width, canvas.height * 0.14)
        CallMontageStyle.MAGAZINE -> CallFrameRect(0.0, canvas.height * 0.03, canvas.width, canvas.height * 0.13)
        CallMontageStyle.HEART -> CallFrameRect(0.0, canvas.height * 0.9, canvas.width, canvas.height * 0.08)
        CallMontageStyle.COVER, CallMontageStyle.GOLD, CallMontageStyle.REDCARPET,
        CallMontageStyle.FILM, CallMontageStyle.NEON, CallMontageStyle.NOIR,
        -> CallMontageGlamourLayout.captionBand(style, canvas)
        CallMontageStyle.SCREEN, CallMontageStyle.GRID, CallMontageStyle.POLAROID, CallMontageStyle.COMIC -> null
    }

    /** La carte blanche d'un polaroïd autour de sa [photo], au large bord bas. */
    public fun polaroidCard(photo: CallFrameRect): CallFrameRect {
        val border = photo.width * POLAROID_BORDER
        return CallFrameRect(photo.minX - border, photo.minY - border, photo.width + border * 2, photo.height + border + photo.width * POLAROID_FOOTER)
    }

    public fun polaroidTilt(index: Int, count: Int): Double =
        if (count > 1) POLAROID_TILTS[index % POLAROID_TILTS.size] else -3.0

    /** Les bandes verticales de la pellicule : une jusqu'à cinq personnes, deux au-delà. */
    public fun filmStrips(count: Int, canvas: CallMontageCanvas): List<CallFrameRect> =
        CallMontageGlamourLayout.filmStrips(count, canvas)

    private fun screen(count: Int, bounds: CallFrameRect): List<CallMontageSlot> = when (count) {
        1 -> CallMontageSoloLayout.screen(bounds).let {
            listOf(CallMontageSlot(it.screen, CallMontageShape.ROUNDED_RECTANGLE, it.cornerRadius))
        }
        2 -> {
            val width = bounds.width * 0.28
            val height = width * 16 / 9
            val margin = bounds.width * 0.04
            val pip = CallFrameRect(bounds.maxX - margin - width, bounds.maxY - bounds.height * 0.1 - height, width, height)
            listOf(
                CallMontageSlot(bounds, CallMontageShape.RECTANGLE),
                CallMontageSlot(pip, CallMontageShape.ROUNDED_RECTANGLE, bounds.width * 0.035),
            )
        }
        else -> cells(count, bounds, bounds.width * 0.006).map { CallMontageSlot(it, CallMontageShape.RECTANGLE) }
    }

    private fun mosaic(count: Int, bounds: CallFrameRect): List<CallMontageSlot> {
        val radius = bounds.width * 0.03
        if (count == 1) return listOf(CallMontageSlot(CallMontageSoloLayout.mosaic(bounds).slot, CallMontageShape.ROUNDED_RECTANGLE, radius))
        val gap = bounds.width * 0.02
        return cells(count, bounds.insetBy(gap, gap), gap).map { CallMontageSlot(it, CallMontageShape.ROUNDED_RECTANGLE, radius) }
    }

    private fun strip(count: Int, bounds: CallFrameRect): List<CallMontageSlot> {
        val area = CallFrameRect(bounds.width * 0.1, bounds.height * 0.06, bounds.width * 0.8, bounds.height * 0.78)
        val columns = if (count <= 4) 1 else 2
        val rows = ceil(count.toDouble() / columns).toInt()
        val gap = bounds.height * 0.018
        val columnWidth = (area.width - gap * (columns - 1)) / columns
        val rowHeight = (area.height - gap * (rows - 1)) / rows
        val width = min(columnWidth, rowHeight / 0.75)
        val height = width * 0.75
        val blockHeight = rows * height + (rows - 1) * gap
        val top = area.minY + (area.height - blockHeight) / 2
        return (0 until count).map { index ->
            val row = index / columns
            val column = index % columns
            val inRow = min(columns, count - row * columns)
            val rowWidth = inRow * width + (inRow - 1) * gap
            val left = area.minX + (area.width - rowWidth) / 2
            CallMontageSlot(CallFrameRect(left + column * (width + gap), top + row * (height + gap), width, height), CallMontageShape.RECTANGLE)
        }
    }

    private fun polaroid(count: Int, bounds: CallFrameRect): List<CallMontageSlot> {
        val inset = bounds.width * 0.08
        val cardWidthRatio = 1 + POLAROID_BORDER * 2
        val cardHeightRatio = 1 + POLAROID_BORDER + POLAROID_FOOTER
        return cells(count, bounds.insetBy(inset, inset), bounds.width * 0.05).mapIndexed { index, cell ->
            val side = min(cell.width / cardWidthRatio, cell.height / cardHeightRatio) * 0.9
            val border = side * POLAROID_BORDER
            val photo = CallFrameRect(
                cell.midX - side * cardWidthRatio / 2 + border,
                cell.midY - side * cardHeightRatio / 2 + border,
                side,
                side,
            )
            CallMontageSlot(photo, CallMontageShape.RECTANGLE, rotation = polaroidTilt(index, count))
        }
    }

    private fun magazine(count: Int, bounds: CallFrameRect): List<CallMontageSlot> {
        val cover = CallMontageSlot(bounds, CallMontageShape.RECTANGLE)
        val insets = count - 1
        if (insets <= 0) return listOf(cover)
        val margin = bounds.width * 0.06
        val gap = bounds.width * 0.03
        val diameter = min(bounds.width * 0.26, (bounds.width - margin * 2 - gap * (insets - 1)) / insets)
        val top = bounds.maxY - bounds.height * 0.05 - diameter
        return listOf(cover) + (0 until insets).map { index ->
            CallMontageSlot(CallFrameRect(margin + index * (diameter + gap), top, diameter, diameter), CallMontageShape.CIRCLE)
        }
    }

    private fun comic(count: Int, bounds: CallFrameRect): List<CallMontageSlot> {
        val gutter = bounds.width * 0.035
        val area = bounds.insetBy(gutter, gutter)
        if (count != 3) return cells(count, area, gutter).map { CallMontageSlot(it, CallMontageShape.RECTANGLE) }
        val topHeight = (area.height - gutter) * 0.5
        val bottomWidth = (area.width - gutter) / 2
        val bottomY = area.minY + topHeight + gutter
        val bottomHeight = area.maxY - bottomY
        return listOf(
            CallFrameRect(area.minX, area.minY, area.width, topHeight),
            CallFrameRect(area.minX, bottomY, bottomWidth, bottomHeight),
            CallFrameRect(area.minX + bottomWidth + gutter, bottomY, bottomWidth, bottomHeight),
        ).map { CallMontageSlot(it, CallMontageShape.RECTANGLE) }
    }

    private fun heart(count: Int, bounds: CallFrameRect): List<CallMontageSlot> {
        if (count <= 1) {
            val side = bounds.width * 0.86
            val frame = CallFrameRect(bounds.midX - side / 2, bounds.midY - side / 2 - bounds.height * 0.03, side, side)
            return listOf(CallMontageSlot(frame, CallMontageShape.HEART))
        }
        val inset = bounds.width * 0.06
        val area = CallFrameRect(inset, bounds.height * 0.06, bounds.width - inset * 2, bounds.height * 0.82)
        return cells(count, area, bounds.width * 0.04).map { cell ->
            val side = min(cell.width, cell.height) * 0.95
            CallMontageSlot(CallFrameRect(cell.midX - side / 2, cell.midY - side / 2, side, side), CallMontageShape.HEART)
        }
    }
}
