package me.meeshy.sdk.model.game

import kotlinx.serialization.Serializable

/**
 * Les décors de la Meesh, en coordonnées : la branche `decor` de `packages/shared/design/meesh-coin.json` (miroir de
 * `MeeshCoinDecorGeometry`, iOS). Argent SOBRE (veines d'or), or RAFFINÉ (grènetis, rosace, étoiles, lauriers), prisme
 * ROYAL (double grènetis, cabochons, soleil, couronne, éclats). Rien ne s'y dessine : [MeeshCoinLayout] en tire les
 * formes, la brique `MeeshCoin` de `:sdk-ui` les peint.
 */
@Serializable
public data class MeeshCoinDecorGeometry(
    val veins: Veins,
    val beads: Beads,
    val cabochons: Cabochons,
    val rosette: Rosette,
    val sunburst: Sunburst,
    val stars: Stars,
    val laurels: Laurels,
    val crown: Crown,
    val sparkles: Sparkles,
) {
    @Serializable
    public data class Veins(val width: Double, val opacity: Double, val paths: List<String>)

    @Serializable
    public data class BeadRing(val radius: Double, val count: Int, val dot: Double, val startDeg: Double)

    @Serializable
    public data class Beads(val gold: List<BeadRing>, val prism: List<BeadRing>)

    @Serializable
    public data class Cabochons(val count: Int, val radius: Double, val startDeg: Double, val size: Double, val table: Double)

    @Serializable
    public data class Rosette(val count: Int, val orbit: Double, val radius: Double, val width: Double, val opacity: Double)

    @Serializable
    public data class Sunburst(
        val count: Int,
        val inner: Double,
        val margin: Double,
        val short: Double,
        val width: Double,
        val opacity: Double,
    )

    @Serializable
    public data class Stars(val points: Int, val outer: Double, val inner: Double)

    @Serializable
    public data class Leaf(val x: Double, val y: Double, val angle: Double, val length: Double, val width: Double)

    @Serializable
    public data class Laurels(val mirrorX: Double, val stem: String, val stemWidth: Double, val leaves: List<Leaf>)

    @Serializable
    public data class Jewel(val x: Double, val y: Double, val r: Double)

    @Serializable
    public data class Crown(val body: String, val band: String, val width: Double, val jewels: List<Jewel>)

    @Serializable
    public data class SparklePoint(val x: Double, val y: Double, val size: Double, val tint: Int, val delay: Double)

    @Serializable
    public data class Sparkles(val inner: Double, val points: List<SparklePoint>)

    public companion object {
        public val shared: MeeshCoinDecorGeometry = MeeshCoinDecorGeometry(
            veins = Veins(
                width = 0.4, opacity = 0.42,
                paths = listOf(
                    "M4 52 C22 46 36 56 54 50 C72 44 88 40 116 46",
                    "M10 86 C30 80 48 88 66 82 C84 76 98 80 112 72",
                    "M44 6 C50 18 46 28 56 38",
                ),
            ),
            beads = Beads(
                gold = listOf(BeadRing(radius = 49.8, count = 96, dot = 0.55, startDeg = 0.0)),
                prism = listOf(
                    BeadRing(radius = 49.6, count = 90, dot = 0.5, startDeg = 2.0),
                    BeadRing(radius = 55.6, count = 120, dot = 0.45, startDeg = 0.0),
                ),
            ),
            cabochons = Cabochons(count = 8, radius = 53.0, startDeg = 22.5, size = 2.5, table = 0.5),
            rosette = Rosette(count = 24, orbit = 13.0, radius = 13.0, width = 0.22, opacity = 0.45),
            sunburst = Sunburst(count = 64, inner = 4.0, margin = 2.0, short = 0.74, width = 0.3, opacity = 0.4),
            stars = Stars(points = 5, outer = 2.1, inner = 0.85),
            laurels = Laurels(
                mirrorX = 60.0,
                stem = "M43.2 96.8 Q34 95 31.8 81.5",
                stemWidth = 0.7,
                leaves = listOf(
                    Leaf(x = 41.43, y = 96.32, angle = 159.3, length = 4.4, width = 1.5),
                    Leaf(x = 41.43, y = 96.32, angle = 239.3, length = 4.4, width = 1.5),
                    Leaf(x = 38.31, y = 94.67, angle = 176.8, length = 4.2, width = 1.46),
                    Leaf(x = 38.31, y = 94.67, angle = 256.8, length = 4.2, width = 1.46),
                    Leaf(x = 35.75, y = 92.08, angle = 193.3, length = 4.0, width = 1.42),
                    Leaf(x = 35.75, y = 92.08, angle = 273.3, length = 4.0, width = 1.42),
                    Leaf(x = 33.75, y = 88.55, angle = 206.7, length = 3.8, width = 1.38),
                    Leaf(x = 33.75, y = 88.55, angle = 286.7, length = 3.8, width = 1.38),
                    Leaf(x = 31.8, y = 81.5, angle = 260.7, length = 3.6, width = 1.25),
                ),
            ),
            crown = Crown(
                body = "M49 42.5 L48 33.0 L53.5 37.0 L56.5 31.0 L60 35.0 L63.5 31.0 L66.5 37.0 L72 33.0 L71 42.5 Z",
                band = "M48.6 42.5 L71.4 42.5 L71.4 45.1 L48.6 45.1 Z",
                width = 0.5,
                jewels = listOf(
                    Jewel(x = 48.0, y = 33.0, r = 0.9),
                    Jewel(x = 56.5, y = 31.0, r = 0.9),
                    Jewel(x = 63.5, y = 31.0, r = 0.9),
                    Jewel(x = 72.0, y = 33.0, r = 0.9),
                    Jewel(x = 60.0, y = 43.8, r = 1.05),
                    Jewel(x = 54.0, y = 43.8, r = 0.7),
                    Jewel(x = 66.0, y = 43.8, r = 0.7),
                ),
            ),
            sparkles = Sparkles(
                inner = 0.22,
                points = listOf(
                    SparklePoint(x = 38.0, y = 44.0, size = 3.2, tint = 0, delay = 0.0),
                    SparklePoint(x = 82.0, y = 30.0, size = 2.6, tint = 1, delay = 0.37),
                    SparklePoint(x = 88.0, y = 74.0, size = 3.4, tint = 0, delay = 0.74),
                    SparklePoint(x = 33.0, y = 80.0, size = 2.4, tint = 2, delay = 1.11),
                    SparklePoint(x = 70.0, y = 88.0, size = 2.8, tint = 0, delay = 1.48),
                    SparklePoint(x = 94.0, y = 52.0, size = 2.0, tint = 3, delay = 1.85),
                    SparklePoint(x = 26.0, y = 58.0, size = 2.2, tint = 1, delay = 2.22),
                    SparklePoint(x = 52.0, y = 22.0, size = 1.8, tint = 4, delay = 2.59),
                ),
            ),
        )
    }
}
