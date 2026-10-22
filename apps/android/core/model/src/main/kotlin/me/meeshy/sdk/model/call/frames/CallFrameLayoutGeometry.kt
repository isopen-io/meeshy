package me.meeshy.sdk.model.call.frames

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Un rectangle, origine en haut à gauche, y vers le bas. */
public data class CallFrameRect(val x: Double, val y: Double, val width: Double, val height: Double) {
    val minX: Double get() = x
    val minY: Double get() = y
    val maxX: Double get() = x + width
    val maxY: Double get() = y + height
    val midX: Double get() = x + width / 2
    val midY: Double get() = y + height / 2

    internal fun offsetBy(dx: Double, dy: Double): CallFrameRect = CallFrameRect(x + dx, y + dy, width, height)
}

/** Une case : son rectangle (avant rotation), sa forme, son inclinaison en degrés (sens horaire), l'index de la personne. */
public data class CallFrameSlotBox(val rect: CallFrameRect, val shape: CallFrameSlotShape, val rotation: Double, val index: Int)

/** Les zones de la toile : l'intérieur (toile moins la marge), les deux réserves de texte, et la zone de contenu entre elles. */
public data class CallFrameAreas(
    val unit: Double,
    val inner: CallFrameRect,
    val top: CallFrameRect,
    val content: CallFrameRect,
    val bottom: CallFrameRect,
)

/**
 * LA GÉOMÉTRIE CANONIQUE D'UN CADRE — portage LITTÉRAL de `apps/web/src/lib/calls/frames/frame-layout.ts`
 * (et de `CallFrameLayoutGeometry.swift`) : mêmes formules, même graine (`scatter`), même ordre.
 * Repère : origine en haut à gauche, y vers le bas, angles en degrés dans le sens horaire. La fixture de
 * parité `packages/shared/design/call-capture-frames-layout.fixture.json` en fige les sorties.
 */
public object CallFrameLayoutGeometry {
    private const val DIAGONAL_SHARE = 0.64
    private const val HERO_SHARE = 0.62
    private const val ORBIT_CENTER_SHARE = 0.38
    private const val SCATTER_SHRINK = 0.88
    private const val TIERS_BACK_SHARE = 0.86
    private const val MOSAIC_SHARE = 2.0 / 3.0
    private const val CASCADE_SHARE = 0.6
    private val HEX_RATIO = 2 / sqrt(3.0)

    /** La part de la zone des visages qu'aucune bande de contrôles ne prend. */
    private const val RESERVE_CONTENT_FLOOR = 0.5

    /** Le tirage pseudo-aléatoire DÉTERMINISTE (0…1) de `call-montage-shapes.ts` : le même cadre à chaque image. */
    public fun scatter(seed: Double): Double {
        val value = sin(seed * 12.9898 + 78.233) * 43758.5453
        return value - floor(value)
    }

    private fun rect(x: Double, y: Double, width: Double, height: Double) =
        CallFrameRect(x, y, max(0.0, width), max(0.0, height))

    private fun square(cx: Double, cy: Double, side: Double) = rect(cx - side / 2, cy - side / 2, side, side)

    public fun isPortrait(width: Double, height: Double): Boolean = height >= width

    public fun areas(layout: CallFrameLayout, width: Double, height: Double): CallFrameAreas {
        val unit = min(width, height)
        val margin = min(layout.margin * unit, unit / 2)
        val inner = rect(margin, margin, width - margin * 2, height - margin * 2)
        val topHeight = min(layout.top * height, inner.height)
        val bottomHeight = min(layout.bottom * height, inner.height - topHeight)
        val top = rect(inner.minX, inner.minY, inner.width, topHeight)
        val bottom = rect(inner.minX, inner.minY + inner.height - bottomHeight, inner.width, bottomHeight)
        val content = rect(inner.minX, inner.minY + topHeight, inner.width, inner.height - topHeight - bottomHeight)
        return CallFrameAreas(unit, inner, top, content, bottom)
    }

    /**
     * Les zones d'un cadre posé sous des contrôles (#9777) : la réserve haute descend sous la bande haute,
     * la basse remonte au-dessus de la bande basse, le contenu se resserre entre elles — sans jamais passer
     * sous la moitié de la zone des visages.
     */
    public fun areas(layout: CallFrameLayout, width: Double, height: Double, reserve: CallFrameChromeReserve): CallFrameAreas {
        val canonical = areas(layout, width, height)
        if (reserve == CallFrameChromeReserve.NONE) return canonical
        val (bandTop, bandBottom) = reserve.bands(width, height)
        val wantTop = max(0.0, bandTop.maxY - canonical.top.minY)
        val wantBottom = max(0.0, canonical.bottom.maxY - bandBottom.minY)
        val wanted = wantTop + wantBottom
        val room = canonical.content.height * (1 - RESERVE_CONTENT_FLOOR)
        val factor = if (wanted > room && wanted > 0) room / wanted else 1.0
        val top = canonical.top.offsetBy(0.0, wantTop * factor)
        val bottom = canonical.bottom.offsetBy(0.0, -wantBottom * factor)
        val content = rect(canonical.content.minX, top.maxY, canonical.content.width, bottom.minY - top.maxY)
        return CallFrameAreas(canonical.unit, canonical.inner, top, content, bottom)
    }

    /** La grille équilibrée : autant de colonnes que la racine, l'orientation de l'aire décidant du sens. */
    public fun gridRects(count: Int, area: CallFrameRect, gap: Double): List<CallFrameRect> {
        if (count <= 0) return emptyList()
        val wide = area.width >= area.height
        val major = kotlin.math.ceil(sqrt(count.toDouble())).toInt()
        val minor = kotlin.math.ceil(count.toDouble() / major).toInt()
        val cols = if (wide) major else minor
        val rows = if (wide) minor else major
        val cellWidth = (area.width - gap * (cols - 1)) / cols
        val cellHeight = (area.height - gap * (rows - 1)) / rows
        return (0 until count).map { index ->
            val row = index / cols
            val inRow = if (row == rows - 1) count - row * cols else cols
            val offset = ((cols - inRow) * (cellWidth + gap)) / 2
            CallFrameRect(
                area.minX + offset + (index % cols) * (cellWidth + gap),
                area.minY + row * (cellHeight + gap),
                cellWidth,
                cellHeight,
            )
        }
    }

    private fun split(area: CallFrameRect, gap: Double, portrait: Boolean): List<CallFrameRect> {
        if (portrait) {
            val height = (area.height - gap) / 2
            return listOf(
                rect(area.minX, area.minY, area.width, height),
                rect(area.minX, area.minY + height + gap, area.width, height),
            )
        }
        val width = (area.width - gap) / 2
        return listOf(
            rect(area.minX, area.minY, width, area.height),
            rect(area.minX + width + gap, area.minY, width, area.height),
        )
    }

    private fun diagonal(area: CallFrameRect): List<CallFrameRect> {
        val width = area.width * DIAGONAL_SHARE
        val height = area.height * DIAGONAL_SHARE
        return listOf(
            rect(area.minX, area.minY, width, height),
            rect(area.minX + area.width - width, area.minY + area.height - height, width, height),
        )
    }

    private fun squareLine(count: Int, area: CallFrameRect, gap: Double, horizontal: Boolean): List<CallFrameRect> {
        if (count <= 0) return emptyList()
        val along = if (horizontal) area.width else area.height
        val across = if (horizontal) area.height else area.width
        val side = max(0.0, min(across, (along - gap * (count - 1)) / count))
        val span = side * count + gap * (count - 1)
        val start = (if (horizontal) area.minX else area.minY) + (along - span) / 2
        val cross = (if (horizontal) area.minY else area.minX) + (across - side) / 2
        return (0 until count).map { index ->
            val offset = start + index * (side + gap)
            if (horizontal) rect(offset, cross, side, side) else rect(cross, offset, side, side)
        }
    }

    private fun hero(count: Int, area: CallFrameRect, gap: Double, portrait: Boolean): List<CallFrameRect> {
        if (count == 1) return listOf(area)
        if (portrait) {
            val height = area.height * HERO_SHARE
            val rest = rect(area.minX, area.minY + height + gap, area.width, area.height - height - gap)
            return listOf(rect(area.minX, area.minY, area.width, height)) + squareLine(count - 1, rest, gap, true)
        }
        val width = area.width * HERO_SHARE
        val rest = rect(area.minX + width + gap, area.minY, area.width - width - gap, area.height)
        return listOf(rect(area.minX, area.minY, width, area.height)) + squareLine(count - 1, rest, gap, false)
    }

    private fun axisReach(angle: Double): Double = max(abs(cos(angle)), abs(sin(angle)))

    private fun neighbourReach(angles: List<Double>): Double =
        angles.zipWithNext { a, b -> axisReach((a + b) / 2 + PI / 2) }.minOrNull() ?: Double.POSITIVE_INFINITY

    private fun arch(count: Int, area: CallFrameRect, gap: Double): List<CallFrameRect> {
        val angles = (0 until count).map { PI + (PI * (it + 0.5)) / count }
        val cosines = angles.map { cos(it) }
        val sines = angles.map { sin(it) }
        val chord = if (count > 1) 2 * sin(PI / (2 * count)) * neighbourReach(angles) else 1.0
        val minCos = cosines.minOrNull() ?: 0.0
        val maxCos = cosines.maxOrNull() ?: 0.0
        val minSin = sines.minOrNull() ?: 0.0
        val maxSin = sines.maxOrNull() ?: 0.0
        val spanX = if (count > 1) (maxCos - minCos) / chord else 0.0
        val spanY = if (count > 1) (maxSin - minSin) / chord else 0.0
        val side = max(0.0, min((area.width - gap * spanX) / (1 + spanX), (area.height - gap * spanY) / (1 + spanY)))
        val radius = if (count > 1) (side + gap) / chord else 0.0
        val minX = minCos * radius
        val minY = minSin * radius
        val width = spanX * (side + gap) + side
        val height = spanY * (side + gap) + side
        val originX = area.minX + (area.width - width) / 2 + side / 2 - minX
        val originY = area.minY + (area.height - height) / 2 + side / 2 - minY
        return (0 until count).map { square(originX + cosines[it] * radius, originY + sines[it] * radius, side) }
    }

    private fun orbit(count: Int, area: CallFrameRect, gap: Double): List<CallFrameRect> {
        val middleX = area.midX
        val middleY = area.midY
        val core = min(area.width, area.height) * ORBIT_CENTER_SHARE
        val satellites = count - 1
        if (satellites <= 0) return listOf(square(middleX, middleY, core))
        val step = 2 * PI / satellites
        val start = -PI / 2
        val angles = (0 until satellites).map { start + step * it }
        val radial = angles.minOf { axisReach(it) }
        val ring = orbitRing(satellites, angles)
        val fits = angles.flatMap { orbitFits(it, area, core, gap, radial, ring) }
        val side = max(0.0, min(core, fits.minOrNull() ?: core))
        val fromCore = (core / 2 + side / 2 + gap) / radial
        val fromRing = (side + gap) / ring
        val radius = max(fromCore, fromRing)
        val ringRects = angles.map { square(middleX + cos(it) * radius, middleY + sin(it) * radius, side) }
        return listOf(square(middleX, middleY, core)) + ringRects
    }

    private fun orbitRing(satellites: Int, angles: List<Double>): Double {
        if (satellites <= 1) return Double.POSITIVE_INFINITY
        val closed = angles + (angles.first() + 2 * PI)
        val chord = 2 * sin(PI / satellites)
        return chord * neighbourReach(closed)
    }

    private fun orbitFits(angle: Double, area: CallFrameRect, core: Double, gap: Double, radial: Double, ring: Double): List<Double> {
        val axes = listOf(abs(cos(angle)) to area.width / 2, abs(sin(angle)) to area.height / 2)
        return axes.flatMap { (onAxis, halfAxis) ->
            val coreSpan = onAxis * (core / 2 + gap) / radial
            val coreShare = onAxis / (2 * radial) + 0.5
            val ringSpan = onAxis * gap / ring
            val ringShare = onAxis / ring + 0.5
            listOf((halfAxis - coreSpan) / coreShare, (halfAxis - ringSpan) / ringShare)
        }
    }

    private fun scattered(count: Int, area: CallFrameRect, gap: Double): List<CallFrameRect> =
        gridRects(count, area, gap).mapIndexed { index, cell ->
            val width = cell.width * SCATTER_SHRINK
            val height = cell.height * SCATTER_SHRINK
            val dx = (scatter((index * 2 + 1).toDouble()) - 0.5) * (cell.width - width)
            val dy = (scatter((index * 2 + 2).toDouble()) - 0.5) * (cell.height - height)
            rect(cell.minX + (cell.width - width) / 2 + dx, cell.minY + (cell.height - height) / 2 + dy, width, height)
        }

    private fun rowCounts(count: Int, rows: Int): List<Int> =
        (0 until rows).map { row -> count / rows + (if (row < count % rows) 1 else 0) }

    private fun rowShifts(counts: List<Int>): List<Double> {
        val shifts = ArrayList<Double>()
        counts.indices.forEach { row ->
            val previous = if (row > 0) shifts[row - 1] else 0.0
            val shifted = row > 0 && counts[row] == counts[row - 1]
            shifts += if (shifted) (if (previous == 0.0) 0.5 else 0.0) else previous
        }
        return shifts
    }

    private class TiersPlan(val counts: List<Int>, val scales: List<Double>, val shifts: List<Double>, val side: Double)

    private fun tiersPlan(count: Int, area: CallFrameRect, gap: Double, rows: Int): TiersPlan {
        val counts = rowCounts(count, rows)
        val scales = counts.indices.map { TIERS_BACK_SHARE.pow(it) }
        val shifts = rowShifts(counts)
        val halves = counts.map { it / 2.0 }
        val rightSlope = counts.indices.map { scales[it] * (halves[it] + shifts[it]) }
        val leftSlope = counts.indices.map { scales[it] * (shifts[it] - halves[it]) }
        val gaps = counts.map { gap * (it - 1) / 2 }
        val widthFit = counts.indices.flatMap { i ->
            counts.indices.map { j -> (area.width - gaps[i] - gaps[j]) / (rightSlope[i] - leftSlope[j]) }
        }.minOrNull() ?: Double.POSITIVE_INFINITY
        val heightFit = (area.height - gap * (rows - 1)) / scales.sum()
        return TiersPlan(counts, scales, shifts, max(0.0, min(heightFit, widthFit)))
    }

    private class TiersRow(val value: Int, val side: Double, val left: Double, val right: Double)

    private fun tiers(count: Int, area: CallFrameRect, gap: Double): List<CallFrameRect> {
        if (count <= 0) return emptyList()
        val best = (1..count).map { tiersPlan(count, area, gap, it) }
            .fold(tiersPlan(count, area, gap, 1)) { winner, candidate -> if (candidate.side > winner.side) candidate else winner }
        val sides = best.scales.map { best.side * it }
        val rows = best.counts.indices.map { row ->
            val value = best.counts[row]
            val side = sides[row]
            val span = side * value + gap * (value - 1)
            val left = -span / 2 + best.shifts[row] * side
            TiersRow(value, side, left, left + span)
        }
        val maxRight = rows.maxOf { it.right }
        val minLeft = rows.minOf { it.left }
        val centerX = area.minX + area.width / 2 - (maxRight + minLeft) / 2
        val blockHeight = sides.sum() + gap * (sides.size - 1)
        val bottom = area.minY + (area.height + blockHeight) / 2
        return rows.flatMapIndexed { index, row ->
            val above = sides.take(index + 1).sum() + gap * index
            (0 until row.value).map { cell -> rect(centerX + row.left + cell * (row.side + gap), bottom - above, row.side, row.side) }
        }
    }

    private fun mosaic(count: Int, area: CallFrameRect, gap: Double, portrait: Boolean): List<CallFrameRect> {
        if (count == 1) return listOf(area)
        if (portrait) {
            val height = (area.height - gap) * MOSAIC_SHARE
            val rest = rect(area.minX, area.minY + height + gap, area.width, area.height - height - gap)
            return listOf(rect(area.minX, area.minY, area.width, height)) + gridRects(count - 1, rest, gap)
        }
        val width = (area.width - gap) * MOSAIC_SHARE
        val rest = rect(area.minX + width + gap, area.minY, area.width - width - gap, area.height)
        return listOf(rect(area.minX, area.minY, width, area.height)) + gridRects(count - 1, rest, gap)
    }

    private fun honeycombRows(count: Int, cols: Int, row: Int): List<Int> {
        val out = ArrayList<Int>()
        var left = count
        var index = row
        while (left > 0) {
            val slots = if (cols == 1 || index % 2 == 0) cols else cols - 1
            out += min(slots, left)
            left -= slots
            index += 1
        }
        return out
    }

    private class HoneycombPlan(val cols: Int, val counts: List<Int>, val pitchShare: Double, val height: Double)

    private fun honeycombPlan(count: Int, area: CallFrameRect, gap: Double, cols: Int): HoneycombPlan {
        val counts = honeycombRows(count, cols, 0)
        val rows = counts.size
        val pitchShare = if (cols == 1) 1.0 else 0.75
        val heightFit = (area.height - gap * (rows - 1)) / (1 + pitchShare * (rows - 1))
        val widthFit = ((area.width - gap * (cols - 1)) / cols) * HEX_RATIO
        return HoneycombPlan(cols, counts, pitchShare, max(0.0, min(heightFit, widthFit)))
    }

    private fun honeycomb(count: Int, area: CallFrameRect, gap: Double): List<CallFrameRect> {
        if (count <= 0) return emptyList()
        val candidates = (0 until max(1, count - 1)).map { honeycombPlan(count, area, gap, if (count == 1) 1 else it + 2) }
        val best = candidates.drop(1).fold(candidates[0]) { winner, candidate -> if (candidate.height > winner.height) candidate else winner }
        val height = best.height
        val width = height / HEX_RATIO
        val rows = best.counts.size
        val blockWidth = best.cols * width + gap * (best.cols - 1)
        val blockHeight = height + (rows - 1) * (height * best.pitchShare + gap)
        val originX = area.minX + (area.width - blockWidth) / 2
        val originY = area.minY + (area.height - blockHeight) / 2
        return best.counts.flatMapIndexed { row, value ->
            val full = best.cols == 1 || row % 2 == 0
            val slots = if (full) best.cols else best.cols - 1
            val inset = if (full) 0.0 else (width + gap) / 2
            val first = (slots - value) / 2
            val y = originY + row * (height * best.pitchShare + gap)
            (0 until value).map { index -> rect(originX + inset + (first + index) * (width + gap), y, width, height) }
        }
    }

    private fun cascade(count: Int, area: CallFrameRect): List<CallFrameRect> {
        val width = area.width * CASCADE_SHARE
        val height = area.height * CASCADE_SHARE
        if (count == 1) return listOf(rect(area.minX + (area.width - width) / 2, area.minY + (area.height - height) / 2, width, height))
        return (0 until count).map { index ->
            rect(
                area.minX + ((area.width - width) * index) / (count - 1),
                area.minY + ((area.height - height) * index) / (count - 1),
                width,
                height,
            )
        }
    }

    /** `split` et `diagonal` n'ont de sens qu'à deux : à tout autre nombre, la grille. */
    public fun servedArrangement(arrangement: CallFrameArrangement, count: Int): CallFrameArrangement =
        if (arrangement.isDuoOnly && count != 2) CallFrameArrangement.GRID else arrangement

    private fun arrangementRects(layout: CallFrameLayout, count: Int, area: CallFrameRect, gap: Double, portrait: Boolean): List<CallFrameRect> =
        when (servedArrangement(layout.arrangement, count)) {
            CallFrameArrangement.SPLIT -> split(area, gap, portrait)
            CallFrameArrangement.DIAGONAL -> diagonal(area)
            CallFrameArrangement.HERO -> hero(count, area, gap, portrait)
            CallFrameArrangement.GRID -> gridRects(count, area, gap)
            CallFrameArrangement.ROW -> squareLine(count, area, gap, !portrait)
            CallFrameArrangement.COLUMN -> squareLine(count, area, gap, portrait)
            CallFrameArrangement.ARCH -> arch(count, area, gap)
            CallFrameArrangement.ORBIT -> orbit(count, area, gap)
            CallFrameArrangement.SCATTER -> scattered(count, area, gap)
            CallFrameArrangement.TIERS -> tiers(count, area, gap)
            CallFrameArrangement.MOSAIC -> mosaic(count, area, gap, portrait)
            CallFrameArrangement.HONEYCOMB -> honeycomb(count, area, gap)
            CallFrameArrangement.CASCADE -> cascade(count, area)
        }

    /** L'inclinaison de la case [index] : alternée (gauche, droite…), d'amplitude 50 à 100 % du maximum (graine index + 1). */
    public fun tiltDegrees(tilt: CallFrameTilt, index: Int): Double {
        val maximum = tilt.degrees
        if (maximum == 0.0) return 0.0
        val sign = if (index % 2 == 0) -1.0 else 1.0
        return sign * maximum * (0.5 + 0.5 * scatter((index + 1).toDouble()))
    }

    /** Réduit [box] autour de son centre pour que, tourné de [degrees], son encombrement tienne dans [bounds]. */
    public fun keepInside(box: CallFrameRect, degrees: Double, bounds: CallFrameRect): CallFrameRect {
        if (degrees == 0.0 || box.width <= 0 || box.height <= 0) return box
        val radians = abs(degrees) * PI / 180
        val cosine = cos(radians)
        val sine = sin(radians)
        val halfX = (box.width * cosine + box.height * sine) / 2
        val halfY = (box.width * sine + box.height * cosine) / 2
        val roomX = min(box.midX - bounds.minX, bounds.minX + bounds.width - box.midX)
        val roomY = min(box.midY - bounds.minY, bounds.minY + bounds.height - box.midY)
        val factor = max(0.0, min(1.0, min(roomX / halfX, roomY / halfY)))
        if (factor >= 1) return box
        return rect(box.midX - (box.width * factor) / 2, box.midY - (box.height * factor) / 2, box.width * factor, box.height * factor)
    }

    /** UNE CASE PAR PERSONNE — les [people] cases du cadre dans une toile de [width] × [height], dans l'ordre des personnes. */
    public fun slots(
        layout: CallFrameLayout,
        slot: CallFrameSlotStyle,
        people: Int,
        width: Double,
        height: Double,
        reserve: CallFrameChromeReserve = CallFrameChromeReserve.NONE,
    ): List<CallFrameSlotBox> {
        val count = max(0, people)
        if (count == 0) return emptyList()
        val zones = areas(layout, width, height, reserve)
        val gap = layout.gap * zones.unit
        val shape = if (layout.arrangement == CallFrameArrangement.HONEYCOMB) CallFrameSlotShape.HEX else slot.shape
        return arrangementRects(layout, count, zones.content, gap, isPortrait(width, height)).mapIndexed { index, box ->
            val rotation = tiltDegrees(slot.tilt, index)
            CallFrameSlotBox(keepInside(box, rotation, zones.content), shape, rotation, index)
        }
    }

    /** Les cases d'un cadre pour [people] personnes. */
    public fun slots(
        frame: CallFrameDesign,
        people: Int,
        width: Double,
        height: Double,
        reserve: CallFrameChromeReserve = CallFrameChromeReserve.NONE,
    ): List<CallFrameSlotBox> = slots(frame.look.layout, frame.look.slot, people, width, height, reserve)
}
