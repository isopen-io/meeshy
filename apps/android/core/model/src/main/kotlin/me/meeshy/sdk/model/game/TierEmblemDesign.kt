package me.meeshy.sdk.model.game

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin

/** Comment une primitive d'emblème se peint : un aplat, ou un trait à bouts ronds de [width] unités de la boîte. */
public sealed interface EmblemPaint {
    public data object Fill : EmblemPaint
    public data class Stroke(val width: Double) : EmblemPaint
}

/** Une primitive d'emblème, en coordonnées d'une boîte de 100 centrée sur l'origine. Jamais une couleur. */
public sealed interface EmblemShape {
    public val paint: EmblemPaint

    public data class Path(val d: String, override val paint: EmblemPaint) : EmblemShape
    public data class Circle(val cx: Double, val cy: Double, val r: Double, override val paint: EmblemPaint) : EmblemShape
    public data class Line(val x1: Double, val y1: Double, val x2: Double, val y2: Double, val width: Double) : EmblemShape {
        override val paint: EmblemPaint get() = EmblemPaint.Stroke(width)
    }
}

/** Un emblème : ses primitives, et si le cœur est PLEIN (la Signature s'y creuse) ou OUVERT (elle garde la teinte du palier). */
public data class TierEmblem(val shapes: List<EmblemShape>, val filledCore: Boolean)

/**
 * Les vingt emblèmes de palier, primitive pour primitive (miroir de `apps/web/src/lib/game/tier-emblem.ts` et de
 * `GameTierEmblem.swift`). Le TypeScript fait foi : deux sources du même dessin divergeraient à la première retouche.
 */
public object TierEmblemDesign {

    public const val BOX: Double = 100.0
    public const val SIGNATURE_SIDE: Double = 30.0

    private val ROMAN = listOf(
        "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
        "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
    )

    /** Le palier en chiffres romains (I à XX), identique dans les sept langues. */
    public fun roman(tier: LevelTierKey): String = ROMAN[tier.ordinal]

    public fun of(tier: LevelTierKey): TierEmblem = designs.getValue(tier)

    private fun round(v: Double): Double = floor(v * 10 + 0.5) / 10

    private fun polar(radius: Double, degrees: Double, ox: Double = 0.0, oy: Double = 0.0): Pair<Double, Double> {
        val a = degrees * PI / 180
        return round(ox + radius * cos(a)) to round(oy + radius * sin(a))
    }

    private fun num(v: Double): String =
        if (v == floor(v)) v.toLong().toString() else v.toString()

    private fun fill() = EmblemPaint.Fill
    private fun stroke(width: Double) = EmblemPaint.Stroke(width)
    private fun disc(r: Double, cx: Double = 0.0, cy: Double = 0.0): EmblemShape = EmblemShape.Circle(cx, cy, r, fill())
    private fun ring(r: Double, width: Double): EmblemShape = EmblemShape.Circle(0.0, 0.0, r, stroke(width))
    private fun path(d: String, paint: EmblemPaint): EmblemShape = EmblemShape.Path(d, paint)
    private fun line(x1: Double, y1: Double, x2: Double, y2: Double, width: Double): EmblemShape =
        EmblemShape.Line(x1, y1, x2, y2, width)

    private fun starPath(points: Int, outer: Double, inner: Double): String =
        (0 until points * 2).joinToString("") { k ->
            val (x, y) = polar(if (k % 2 == 0) outer else inner, -90.0 + k * 180.0 / points)
            "${if (k == 0) "M" else "L"}${num(x)} ${num(y)}"
        } + "Z"

    private fun rays(count: Int, from: Double, to: Double, width: Double): List<EmblemShape> =
        (0 until count).map { k ->
            val (x1, y1) = polar(from, k * 360.0 / count)
            val (x2, y2) = polar(to, k * 360.0 / count)
            line(x1, y1, x2, y2, width)
        }

    private fun fan(degrees: List<Double>): List<EmblemShape> = degrees.map { d ->
        val (x1, y1) = polar(12.0, -90 + d, 0.0, 36.0)
        val (x2, y2) = polar(62.0, -90 + d, 0.0, 36.0)
        line(x1, y1, x2, y2, 6.0)
    }

    private val constellationPoints = listOf(-34.0 to 18.0, -14.0 to -14.0, 10.0 to 4.0, 32.0 to -26.0, 36.0 to 24.0)

    private fun constellation(): List<EmblemShape> =
        constellationPoints.zipWithNext { a, b -> line(a.first, a.second, b.first, b.second, 3.0) } +
            constellationPoints.map { disc(6.0, it.first, it.second) }

    private fun dots(points: List<Triple<Double, Double, Double>>): List<EmblemShape> =
        points.map { (cx, cy, r) -> disc(r, cx, cy) }

    private fun ellipse(rx: Double, ry: Double): String =
        "M${num(-rx)} 0 A${num(rx)} ${num(ry)} 0 1 0 ${num(rx)} 0 A${num(rx)} ${num(ry)} 0 1 0 ${num(-rx)} 0"

    private const val LEMNISCATE = "M0 0 C12 -22 44 -22 44 0 C44 22 12 22 0 0 C-12 -22 -44 -22 -44 0 C-44 22 -12 22 0 0 Z"
    private const val FIELD = "M0 -16 C34 -46 34 46 0 16"
    private const val FIELD_MIRRORED = "M0 16 C-34 46 -34 -46 0 -16"
    private const val ARM = "M0 0 C8 -8 22 -6 26 6 C30 22 8 36 -12 30 C-36 22 -40 -8 -22 -28 C-6 -44 24 -46 40 -28"
    private const val ARM_MIRRORED = "M0 0 C-8 8 -22 6 -26 -6 C-30 -22 -8 -36 12 -30 C36 -22 40 8 22 28 C6 44 -24 46 -40 28"

    private fun d(x: Double, y: Double, r: Double) = Triple(x, y, r)

    private val designs: Map<LevelTierKey, TierEmblem> = mapOf(
        LevelTierKey.Etincelle to TierEmblem(
            listOf(
                path("M0 -46 C3 -12 12 -3 46 0 C12 3 3 12 0 46 C-3 12 -12 3 -46 0 C-12 -3 -3 -12 0 -46 Z", fill()),
                path("M30 -44 C31 -36 34 -33 42 -32 C34 -31 31 -28 30 -20 C29 -28 26 -31 18 -32 C26 -33 29 -36 30 -44 Z", fill()),
            ),
            true,
        ),
        LevelTierKey.Lueur to TierEmblem(listOf(disc(15.0), ring(28.0, 4.0), ring(41.0, 3.0)), true),
        LevelTierKey.Lumiere to TierEmblem(listOf(disc(17.0)) + rays(8, 27.0, 44.0, 5.0), true),
        LevelTierKey.Eclat to TierEmblem(listOf(path(starPath(12, 46.0, 27.0), fill())), true),
        LevelTierKey.Rayon to TierEmblem(fan(listOf(-50.0, -25.0, 0.0, 25.0, 50.0)), false),
        LevelTierKey.Aurore to TierEmblem(
            listOf(
                path("M-20 14 A20 20 0 0 1 20 14 Z", fill()),
                path("M-33 14 A33 33 0 0 1 33 14", stroke(4.0)),
                path("M-45 14 A45 45 0 0 1 45 14", stroke(3.5)),
                line(-45.0, 25.0, 45.0, 25.0, 5.0),
            ),
            false,
        ),
        LevelTierKey.Comete to TierEmblem(
            listOf(
                disc(13.0, 22.0, -20.0),
                path("M12 -10 Q-10 10 -40 24", stroke(7.0)),
                path("M8 -22 Q-16 -8 -42 -6", stroke(4.0)),
                path("M24 -6 Q10 18 -8 40", stroke(4.0)),
            ),
            false,
        ),
        LevelTierKey.Etoile to TierEmblem(listOf(path(starPath(5, 46.0, 19.0), fill())), true),
        LevelTierKey.Constellation to TierEmblem(constellation(), false),
        LevelTierKey.Galaxie to TierEmblem(
            listOf(path(ARM, stroke(5.0)), path(ARM_MIRRORED, stroke(5.0)), disc(6.0)),
            false,
        ),
        LevelTierKey.Nebuleuse to TierEmblem(
            dots(listOf(d(0.0, 0.0, 20.0), d(-22.0, -8.0, 15.0), d(20.0, -14.0, 14.0), d(16.0, 18.0, 15.0), d(-16.0, 20.0, 12.0))),
            true,
        ),
        LevelTierKey.Pulsar to TierEmblem(
            listOf(disc(16.0), ring(26.0, 3.0), line(0.0, -32.0, 0.0, -48.0, 6.0), line(0.0, 32.0, 0.0, 48.0, 6.0)),
            true,
        ),
        LevelTierKey.Quasar to TierEmblem(
            listOf(
                disc(15.0),
                path(ellipse(44.0, 13.0), stroke(4.0)),
                line(16.0, -16.0, 36.0, -40.0, 5.0),
                line(-16.0, 16.0, -36.0, 40.0, 5.0),
            ),
            true,
        ),
        LevelTierKey.Supernova to TierEmblem(listOf(path(starPath(16, 47.0, 24.0), fill())), true),
        LevelTierKey.Magnetar to TierEmblem(
            listOf(disc(15.0), path(FIELD, stroke(4.0)), path(FIELD_MIRRORED, stroke(4.0))),
            true,
        ),
        LevelTierKey.Amas to TierEmblem(
            dots(
                listOf(
                    d(0.0, -30.0, 8.0), d(-26.0, -14.0, 7.0), d(26.0, -14.0, 7.0), d(-30.0, 14.0, 6.0),
                    d(30.0, 14.0, 6.0), d(-12.0, 32.0, 7.0), d(12.0, 32.0, 7.0), d(0.0, 6.0, 5.0),
                ),
            ),
            false,
        ),
        LevelTierKey.Superamas to TierEmblem(
            listOf(
                line(0.0, -30.0, -28.0, 20.0, 2.5),
                line(-28.0, 20.0, 28.0, 20.0, 2.5),
                line(28.0, 20.0, 0.0, -30.0, 2.5),
            ) + dots(
                listOf(
                    d(0.0, -30.0, 7.0), d(-8.0, -40.0, 4.0), d(8.0, -40.0, 4.0),
                    d(-28.0, 20.0, 7.0), d(-40.0, 14.0, 4.0), d(-36.0, 30.0, 4.0),
                    d(28.0, 20.0, 7.0), d(40.0, 14.0, 4.0), d(36.0, 30.0, 4.0),
                ),
            ),
            false,
        ),
        LevelTierKey.Cosmos to TierEmblem(
            listOf(ring(24.0, 3.0), ring(40.0, 3.0)) + dots(listOf(d(24.0, 0.0, 6.0), d(-28.0, -28.0, 6.0), d(12.0, 38.0, 5.0))),
            false,
        ),
        LevelTierKey.Infini to TierEmblem(listOf(path(LEMNISCATE, stroke(7.0))), false),
        LevelTierKey.Singularite to TierEmblem(
            listOf(disc(17.0), path(ellipse(42.0, 15.0), stroke(3.5))) + rays(12, 30.0, 47.0, 2.5),
            true,
        ),
    )
}
