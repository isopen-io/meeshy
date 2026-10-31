package me.meeshy.sdk.model.game

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToLong
import kotlin.math.sin

/** La face que la Meesh montre (miroir de `MeeshCoinView.Face`, iOS). */
public sealed interface MeeshCoinFace {
    /** Le FLAN : la pièce avant la frappe — métal, tranche, décors, sans couronne ni Signature (#11177). */
    public data object Blank : MeeshCoinFace

    /** L'avers : la couronne « MEESHY · 1 MEESH » et la Signature frappée. */
    public data object Obverse : MeeshCoinFace

    /** Le revers : l'oiseau ou les oiseaux de l'édition, le numéro gravé et l'année de frappe. */
    public data class Reverse(val number: Int, val year: Int) : MeeshCoinFace

    /** Les décors que cette face lit : le flan et l'avers ceux de l'avers, le revers les siens. */
    public fun decor(edition: MeeshCoinGeometry.Edition): List<MeeshCoinGeometry.Decor> = when (this) {
        Blank, Obverse -> edition.decor.obverse
        is Reverse -> edition.decor.reverse
    }

    /** Le champ que cette face creuse : celui de l'avers est plus petit (la couronne l'entoure). */
    public fun field(geometry: MeeshCoinGeometry): MeeshCoinGeometry.Field = when (this) {
        Blank, Obverse -> geometry.field.obverse
        is Reverse -> geometry.field.reverse
    }
}

/**
 * Les formes de la Meesh : les MÊMES formules que `apps/web/src/lib/game/coin-geometry.ts` et `MeeshCoinLayout` (iOS),
 * une à une, sur la même géométrie ([MeeshCoinGeometry.shared]) et au même arrondi (le millième). Chaque perle, chaque
 * glyphe, chaque cabochon tombe au même point sur les trois plateformes.
 */
public object MeeshCoinLayout {

    public data class Point(val x: Double, val y: Double)

    public data class RingGlyph(
        /** La place du glyphe dans le texte répété, espaces compris. */
        val index: Int,
        val glyph: Char,
        val isSeparator: Boolean,
        val point: Point,
        /** En degrés : l'angle de la place, plus 90 (la tête vers l'extérieur). */
        val rotate: Double,
    )

    public data class Cabochon(val center: Point, val outer: List<Point>, val table: List<Point>)

    public data class Ray(val from: Point, val to: Point)

    public data class LaurelLeaf(val base: Point, val outerControl: Point, val tip: Point, val innerControl: Point)

    public data class Twinkle(val scale: Double, val opacity: Double)

    /** La période du scintillement (`gameTwinkle` du web), en secondes. */
    public const val TWINKLE_PERIOD: Double = 2.4

    public fun round(value: Double): Double = (value * 1000).roundToLong() / 1000.0

    public fun polar(radius: Double, degrees: Double, center: Point): Point {
        val radians = degrees * PI / 180
        return Point(round(center.x + radius * cos(radians)), round(center.y + radius * sin(radians)))
    }

    private fun coinCenter(geometry: MeeshCoinGeometry) = Point(geometry.center, geometry.center)

    /** La couronne de l'avers, glyphe par glyphe, centré sur son cercle, la tête vers l'extérieur ; sans les espaces. */
    public fun inscription(geometry: MeeshCoinGeometry = MeeshCoinGeometry.shared): List<RingGlyph> {
        val ring = geometry.inscription
        val characters = ring.text.repeat(ring.repetitions)
        val step = 360.0 / characters.length
        return characters.mapIndexedNotNull { index, glyph ->
            if (glyph == ' ') return@mapIndexedNotNull null
            val angle = ring.startDeg + index * step
            RingGlyph(
                index = index, glyph = glyph, isSeparator = glyph.toString() == ring.separator,
                point = polar(ring.radius, angle, coinCenter(geometry)), rotate = round(angle + 90),
            )
        }
    }

    public fun beads(ring: MeeshCoinDecorGeometry.BeadRing, geometry: MeeshCoinGeometry = MeeshCoinGeometry.shared): List<Point> =
        (0 until ring.count).map { polar(ring.radius, ring.startDeg + it * 360.0 / ring.count, coinCenter(geometry)) }

    private fun polygon(center: Point, radius: Double, sides: Int, startDeg: Double): List<Point> =
        (0 until sides).map { polar(radius, startDeg + it * 360.0 / sides, center) }

    /** Les cabochons du prisme : un octogone taillé et sa table, posés sur la tranche. */
    public fun cabochons(geometry: MeeshCoinGeometry = MeeshCoinGeometry.shared): List<Cabochon> {
        val spec = geometry.decor.cabochons
        return (0 until spec.count).map { index ->
            val angle = spec.startDeg + index * 360.0 / spec.count
            val center = polar(spec.radius, angle, coinCenter(geometry))
            Cabochon(
                center = center,
                outer = polygon(center, spec.size, sides = 8, startDeg = angle + 22.5),
                table = polygon(center, spec.size * spec.table, sides = 8, startDeg = angle + 22.5),
            )
        }
    }

    /** Le guilloché en rosace de l'or : des cercles dont les centres tournent autour de celui de la pièce. */
    public fun rosetteCenters(geometry: MeeshCoinGeometry = MeeshCoinGeometry.shared): List<Point> {
        val spec = geometry.decor.rosette
        return (0 until spec.count).map { polar(spec.orbit, it * 360.0 / spec.count, coinCenter(geometry)) }
    }

    /** Le guilloché en soleil du prisme, jusqu'au bord du champ moins sa marge, un rayon sur deux raccourci. */
    public fun sunburst(fieldRadius: Double, geometry: MeeshCoinGeometry = MeeshCoinGeometry.shared): List<Ray> {
        val spec = geometry.decor.sunburst
        val outer = fieldRadius - spec.margin
        return (0 until spec.count).map { index ->
            val angle = index * 360.0 / spec.count
            val reach = if (index % 2 == 0) outer else spec.inner + (outer - spec.inner) * spec.short
            Ray(from = polar(spec.inner, angle, coinCenter(geometry)), to = polar(reach, angle, coinCenter(geometry)))
        }
    }

    /** Une petite étoile de la couronne de l'or, centrée sur le glyphe qu'elle remplace, une branche vers l'extérieur. */
    public fun star(glyph: RingGlyph, geometry: MeeshCoinGeometry = MeeshCoinGeometry.shared): List<Point> {
        val spec = geometry.decor.stars
        return (0 until spec.points * 2).map { index ->
            val degrees = glyph.rotate - 90 + index * 180.0 / spec.points
            polar(if (index % 2 == 0) spec.outer else spec.inner, degrees, glyph.point)
        }
    }

    /** Un éclat de diamant : une étoile à quatre branches, la gorge à `inner` × size. */
    public fun sparkle(
        point: MeeshCoinDecorGeometry.SparklePoint,
        geometry: MeeshCoinGeometry = MeeshCoinGeometry.shared,
    ): List<Point> {
        val g = round(point.size * geometry.decor.sparkles.inner)
        val s = point.size
        val x = point.x
        val y = point.y
        return listOf(
            Point(x, round(y - s)), Point(round(x + g), round(y - g)),
            Point(round(x + s), y), Point(round(x + g), round(y + g)),
            Point(x, round(y + s)), Point(round(x - g), round(y + g)),
            Point(round(x - s), y), Point(round(x - g), round(y - g)),
        )
    }

    /** Une feuille de laurier : de sa base vers `angle`, deux courbes qui se rejoignent à la pointe. */
    public fun leaf(leaf: MeeshCoinDecorGeometry.Leaf): LaurelLeaf {
        val radians = leaf.angle * PI / 180
        fun along(distance: Double, across: Double) = Point(
            round(leaf.x + distance * cos(radians) - across * sin(radians)),
            round(leaf.y + distance * sin(radians) + across * cos(radians)),
        )
        return LaurelLeaf(
            base = Point(leaf.x, leaf.y),
            outerControl = along(leaf.length / 2, -leaf.width),
            tip = along(leaf.length, 0.0),
            innerControl = along(leaf.length / 2, leaf.width),
        )
    }

    /** `gameTwinkle` du web : 2,4 s, de (0,6 ; 0,35) au repos à (1,15 ; 1) au milieu, en douceur. */
    public fun twinkle(time: Double): Twinkle {
        val phase = ((time % TWINKLE_PERIOD) + TWINKLE_PERIOD) % TWINKLE_PERIOD / TWINKLE_PERIOD
        val wave = (1 - cos(2 * PI * phase)) / 2
        return Twinkle(scale = 0.6 + 0.55 * wave, opacity = 0.35 + 0.65 * wave)
    }

    /** Les éclats scintillent s'il y en a sur la face — jamais sous « réduire les animations », jamais hors écran. */
    public fun twinkles(decor: List<MeeshCoinGeometry.Decor>, reduceMotion: Boolean, onScreen: Boolean): Boolean =
        MeeshCoinGeometry.Decor.Sparkles in decor && !reduceMotion && onScreen
}
