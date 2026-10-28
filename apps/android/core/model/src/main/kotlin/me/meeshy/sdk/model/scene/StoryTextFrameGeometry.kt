package me.meeshy.sdk.model.scene

import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * La géométrie du cadre d'un texte, en design-pixels (référentiel 1080 de large) : le port de
 * `StoryTextLayer.frameMetrics` / `framePath` / `frameCornerRadius` d'iOS. UNE seule mesure, que la scène du composeur et
 * le lecteur consomment — l'écart de proportion entre deux écrans, ou entre Android et iOS, ne peut plus naître d'une
 * marge « à l'estime ». Pure : la mesure du texte (largeur, hauteur, chasse du « o ») est fournie par l'appelant.
 */
object StoryTextFrameGeometry {
    const val SPEECH_TAIL_HEIGHT: Double = 40.0
    const val CLOUD_PUFF_RADIUS: Double = 26.0
    const val CLOUD_THOUGHT_HEIGHT: Double = 48.0
    private const val MIN_H_PAD = 8.0
    private const val V_PAD = 8.0

    /** L'encombrement de la boîte et la zone où les glyphes se posent (iOS `FrameMetrics`). */
    data class Metrics(
        val boundsWidth: Double,
        val boundsHeight: Double,
        val glyphX: Double,
        val glyphY: Double,
        val glyphWidth: Double,
        val glyphHeight: Double,
    )

    /** Un sous-tracé de la forme ; les sous-tracés se chevauchent et se remplissent en `nonzero` (une seule peinture par pixel). */
    sealed interface Primitive {
        data class RoundRect(val left: Double, val top: Double, val width: Double, val height: Double, val radius: Double) : Primitive
        data class Oval(val left: Double, val top: Double, val width: Double, val height: Double) : Primitive
        data class Polygon(val points: List<Pair<Double, Double>>) : Primitive
    }

    private fun StoryTextFrameShape.usesCustomPath(): Boolean =
        this == StoryTextFrameShape.DIAMOND || this == StoryTextFrameShape.CLOUD || this == StoryTextFrameShape.SPEECH

    /** Le losange double l'encombrement du texte : sa largeur de mesure est plafonnée à 44 % pour que la forme tienne. */
    fun maxTextWidthFraction(shape: StoryTextFrameShape, framed: Boolean): Double =
        if (framed && shape == StoryTextFrameShape.DIAMOND) 0.44 else 0.88

    fun metrics(
        shape: StoryTextFrameShape,
        isFramed: Boolean,
        textWidth: Double,
        textHeight: Double,
        oGlyphWidth: Double,
        paddingScale: Double = 1.0,
    ): Metrics {
        val w = ceil(textWidth)
        val h = ceil(textHeight)
        val scale = if (isFramed) max(0.0, paddingScale) else 1.0
        val hPad = max(MIN_H_PAD, if (isFramed) oGlyphWidth else 0.0) * scale
        val vPad = V_PAD * scale
        if (!isFramed || !shape.usesCustomPath()) {
            return Metrics(w + hPad * 2, h + vPad * 2, hPad, vPad, w, h)
        }
        return when (shape) {
            StoryTextFrameShape.DIAMOND -> {
                val width = max(w * 2, w + hPad * 2)
                val height = max(h * 2, h + vPad * 2)
                Metrics(width, height, (width - w) / 2, (height - h) / 2, w, h)
            }
            StoryTextFrameShape.SPEECH ->
                Metrics(w + hPad * 2, h + vPad * 2 + SPEECH_TAIL_HEIGHT, hPad, vPad, w, h)
            StoryTextFrameShape.CLOUD -> {
                val puff = CLOUD_PUFF_RADIUS
                Metrics(
                    w + hPad * 2 + puff * 2,
                    h + vPad * 2 + puff * 2 + CLOUD_THOUGHT_HEIGHT,
                    hPad + puff,
                    vPad + puff,
                    w,
                    h,
                )
            }
            else -> Metrics(w + hPad * 2, h + vPad * 2, hPad, vPad, w, h)
        }
    }

    /** Le rayon des formes à coins (iOS `frameCornerRadius`). */
    fun cornerRadius(shape: StoryTextFrameShape, height: Double): Double = when (shape) {
        StoryTextFrameShape.PILL -> height / 2
        StoryTextFrameShape.RECTANGLE -> max(2.0, height * 0.04)
        else -> max(4.0, height * 0.15)
    }

    /** Le tracé de la forme dans une boîte [width] × [height] (iOS `framePath`, les formes à coins en un rectangle arrondi). */
    fun primitives(shape: StoryTextFrameShape, width: Double, height: Double): List<Primitive> = when (shape) {
        StoryTextFrameShape.DIAMOND -> listOf(
            Primitive.Polygon(listOf(width / 2 to 0.0, width to height / 2, width / 2 to height, 0.0 to height / 2)),
        )
        StoryTextFrameShape.SPEECH -> speech(width, height)
        StoryTextFrameShape.CLOUD -> cloud(width, height)
        else -> listOf(Primitive.RoundRect(0.0, 0.0, width, height, cornerRadius(shape, height)))
    }

    private fun speech(width: Double, height: Double): List<Primitive> {
        val bodyHeight = max(1.0, height - SPEECH_TAIL_HEIGHT)
        val radius = max(0.0, min(bodyHeight * 0.3, width * 0.2))
        val baseX = width * 0.20
        val baseWidth = min(width * 0.30, SPEECH_TAIL_HEIGHT * 1.6)
        return listOf(
            Primitive.RoundRect(0.0, 0.0, width, bodyHeight, radius),
            Primitive.Polygon(
                listOf(
                    baseX to bodyHeight - 2,
                    baseX + baseWidth to bodyHeight - 2,
                    max(0.0, baseX - SPEECH_TAIL_HEIGHT * 0.25) to height,
                ),
            ),
        )
    }

    private fun cloud(width: Double, height: Double): List<Primitive> {
        val puff = CLOUD_PUFF_RADIUS
        val bodyHeight = max(1.0, height - CLOUD_THOUGHT_HEIGHT)
        val innerWidth = width - puff * 2
        val innerHeight = bodyHeight - puff * 2
        if (innerWidth <= 0 || innerHeight <= 0) return listOf(Primitive.Oval(0.0, 0.0, width, bodyHeight))
        val radius = max(0.0, min(innerHeight, innerWidth) * 0.25)
        val left = puff
        val top = puff
        val right = puff + innerWidth
        val bottom = puff + innerHeight
        val large = puff * 0.6
        val small = puff * 0.35
        val cx = max(left + puff, left + innerWidth * 0.15)
        return buildList {
            add(Primitive.RoundRect(left, top, innerWidth, innerHeight, radius))
            puffsAlong(left, top, right, top, puff)
            puffsAlong(right, top, right, bottom, puff)
            puffsAlong(right, bottom, left, bottom, puff)
            puffsAlong(left, bottom, left, top, puff)
            add(Primitive.Oval(cx - large, bodyHeight - large * 0.4, large * 2, large * 2))
            add(Primitive.Oval(cx - puff * 0.8 - small, bodyHeight + large * 1.4, small * 2, small * 2))
        }
    }

    private fun MutableList<Primitive>.puffsAlong(ax: Double, ay: Double, bx: Double, by: Double, radius: Double) {
        val steps = max(1, ceil(hypot(bx - ax, by - ay) / (radius * 1.5)).toInt())
        for (i in 0..steps) {
            val t = i.toDouble() / steps
            val cx = ax + (bx - ax) * t
            val cy = ay + (by - ay) * t
            add(Primitive.Oval(cx - radius, cy - radius, radius * 2, radius * 2))
        }
    }
}
