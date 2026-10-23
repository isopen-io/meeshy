package me.meeshy.sdk.model.appearance

import kotlin.math.PI

/*
 * La géométrie d'un contour d'avatar (#10632, spec §§ 5.2, 8.2) — MIROIR de `AvatarRingView.swift` et de
 * `avatarRingSvg` : le viewBox est 0 0 100 100, l'avatar occupe le cercle de rayon 42 et le trait de base
 * se pose SUR le bord (rayon = 50 − largeur/2). Pur : l'écran ne fait que dessiner ce plan.
 */
sealed interface RingStrokeLayer {
    /** Un cercle plein de ce rayon, dans le viewBox. */
    data class Circle(val radius: Double, val width: Double, val colorHex: String) : RingStrokeLayer

    /** Des points ronds équidistants sur le cercle (`count` points, un tous les `pitch`). */
    data class Dots(val radius: Double, val width: Double, val colorHex: String, val count: Int, val pitch: Double) : RingStrokeLayer

    /** Des tirets : `dash` plein puis `gap` vide, `count` tirets par tour. */
    data class Dashes(
        val radius: Double, val width: Double, val colorHex: String,
        val count: Int, val dash: Double, val gap: Double,
    ) : RingStrokeLayer

    /** Des arcs jointifs dont la couleur parcourt la palette en boucle. */
    data class Sweep(val radius: Double, val width: Double, val arcs: List<ArcSlice>) : RingStrokeLayer
}

data class ArcSlice(val startRadians: Double, val endRadians: Double, val colorHex: String)

object AvatarRingGeometry {

    const val BOX = 100.0
    const val DOT_COUNT = 28
    const val DASH_COUNT = 36
    const val ARC_COUNT = 24
    private const val DASH_FILL = 0.6
    private const val ARC_OVERLAP_RADIANS = 0.004
    private const val DOUBLE_GAP_FACTOR = 2.0

    /** La part de l'empreinte que l'avatar occupe sous un contour : le cercle de rayon 42 du viewBox 100. */
    const val HOLE_FRACTION = 0.84

    /** Le côté du contour pour un avatar de cote [avatarSize] : l'avatar tient dans son trou. */
    fun frameSide(avatarSize: Double): Double = avatarSize * BOX / (HOLE_FRACTION * 100)

    /** L'échelle de l'avatar (anneau de story compris) sous un contour : l'anneau se ramène au trou. */
    fun avatarScale(avatarSize: Double, storyRingSize: Double?): Double =
        if (storyRingSize == null || avatarSize <= 0.0 || storyRingSize <= avatarSize) 1.0 else avatarSize / storyRingSize

    /** L'échelle de l'avatar quand le contour tient DANS son empreinte (listes et bulles). */
    fun footprintScale(footprint: Double, storyRingSize: Double?): Double =
        HOLE_FRACTION * avatarScale(footprint, storyRingSize)

    /** Les couches du trait de base, dans l'ordre de peinture ; vide pour `none`. */
    fun strokeLayers(design: AvatarRingDesign): List<RingStrokeLayer> {
        val colors = design.stroke.colors
        val width = design.stroke.width * BOX
        val radius = BOX / 2 - width / 2
        val first = colors[0]
        val second = colors.getOrElse(1) { colors[0] }
        return when (design.stroke.style) {
            RingStrokeStyle.SOLID -> listOf(RingStrokeLayer.Circle(radius, width, first))
            RingStrokeStyle.DOUBLE -> listOf(
                RingStrokeLayer.Circle(radius, width, first),
                RingStrokeLayer.Circle(radius - width * DOUBLE_GAP_FACTOR, width, second),
            )
            RingStrokeStyle.DOTTED -> listOf(
                RingStrokeLayer.Dots(radius, width, first, DOT_COUNT, 2 * PI * radius / DOT_COUNT),
            )
            RingStrokeStyle.DASHED -> {
                val step = 2 * PI * radius / DASH_COUNT
                listOf(RingStrokeLayer.Dashes(radius, width, first, DASH_COUNT, step * DASH_FILL, step * (1 - DASH_FILL)))
            }
            RingStrokeStyle.GRADIENT -> listOf(RingStrokeLayer.Sweep(radius, width, sweepArcs(colors)))
            RingStrokeStyle.NONE -> emptyList()
        }
    }

    private fun sweepArcs(colors: List<String>): List<ArcSlice> = (0 until ARC_COUNT).map { index ->
        val from = index.toDouble() / ARC_COUNT * 2 * PI - PI / 2
        val to = (index + 1).toDouble() / ARC_COUNT * 2 * PI - PI / 2 + ARC_OVERLAP_RADIANS
        ArcSlice(from, to, cyclicHex(colors, index.toDouble() / ARC_COUNT))
    }

    /** La couleur à la fraction [t] d'un tour, le dernier segment ramenant à la première couleur. */
    fun cyclicHex(colors: List<String>, t: Double): String {
        val loop = colors + colors[0]
        val scaled = t * (loop.size - 1)
        val index = minOf(scaled.toInt(), loop.size - 2)
        return lerpHex(loop[index], loop[index + 1], scaled - index)
    }

    /** `#RGB` s'étend, `#RRGGBBAA` perd son alpha, le reste se lit noir — jamais un indice hors de la chaîne. */
    fun lerpHex(from: String, to: String, t: Double): String {
        val a = channels(from)
        val b = channels(to)
        val mixed = IntArray(3) { Math.round(a[it] + (b[it] - a[it]) * t).toInt() }
        return "#%02X%02X%02X".format(mixed[0], mixed[1], mixed[2])
    }

    private fun channels(hex: String): IntArray {
        var digits = hex.removePrefix("#")
        if (digits.length == 3) digits = digits.flatMap { listOf(it, it) }.joinToString("")
        if (digits.length < 6 || !digits.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }) return IntArray(3)
        return IntArray(3) { digits.substring(it * 2, it * 2 + 2).toInt(16) }
    }
}
