package me.meeshy.sdk.model.game

/**
 * Mee et Meo GRAVÉS dans le métal du revers, et colorés (#9540) — les DONNÉES de `GameEngravedBirds` (iOS), trait pour
 * trait : l'ordre, les chemins, les teintes, dans la boîte de 140 × 140 que le web pose (`GAME_BIRD_BOX`,
 * `apps/web/src/lib/game/birds.ts`). Le relief (`birdEngraveFilter` du web) : l'ombre décalée de +2,4 (opacité 0,6,
 * indigo 950), la lumière décalée de −1,3 (blanc, 0,85), puis le dessin. Rien ne bouge : un objet frappé est immobile.
 */
public object GameEngravedBirdShapes {

    public const val BOX: Double = 140.0
    public const val SHADE_OFFSET: Double = 2.4
    public const val SHADE_OPACITY: Double = 0.6
    public const val SHADE_HEX: String = "1e1b4b"
    public const val LIGHT_OFFSET: Double = -1.3
    public const val LIGHT_OPACITY: Double = 0.85

    /** Un point unitaire de la boîte d'une forme (`objectBoundingBox`). */
    public data class UnitPoint(val x: Double, val y: Double)

    public sealed interface Paint {
        public data class Solid(val hex: String) : Paint
        public data class Linear(val first: String, val second: String, val from: UnitPoint, val to: UnitPoint) : Paint
        public data class Radial(val inner: String, val outer: String, val center: UnitPoint, val radius: Double) : Paint
    }

    public data class Stroke(val hex: String, val width: Double, val opacity: Double = 1.0)

    public sealed interface Geometry {
        public data class Circle(val cx: Double, val cy: Double, val r: Double) : Geometry
        public data class Ellipse(val cx: Double, val cy: Double, val rx: Double, val ry: Double, val rotation: Double = 0.0) : Geometry
        public data class Path(val d: String) : Geometry
    }

    public data class Shape(val geometry: Geometry, val fill: Paint? = null, val stroke: Stroke? = null, val opacity: Double = 1.0) {
        /** Un reflet blanc posé DANS le corps : hors de la silhouette qui porte l'ombre et la lumière. */
        val isHighlight: Boolean get() = opacity < 0.6 && (fill as? Paint.Solid)?.hex == "ffffff"
    }

    private val TOP = UnitPoint(0.5, 0.0)
    private val BOTTOM = UnitPoint(0.5, 1.0)
    private val TOP_LEADING = UnitPoint(0.0, 0.0)
    private val BOTTOM_TRAILING = UnitPoint(1.0, 1.0)

    private fun solid(hex: String, geometry: Geometry, opacity: Double = 1.0) = Shape(geometry, fill = Paint.Solid(hex), opacity = opacity)

    private fun line(d: String, hex: String, width: Double, opacity: Double = 1.0) =
        Shape(Geometry.Path(d), stroke = Stroke(hex, width), opacity = opacity)

    private fun meoEye(x: Double): List<Shape> = listOf(
        solid("1c1941", Geometry.Ellipse(x, 74.0, 9.0, 10.5)),
        solid("4c4a8a", Geometry.Ellipse(x, 79.0, 6.0, 4.0), opacity = 0.55),
        solid("ffffff", Geometry.Circle(x + 3, 70.0, 3.8)),
        solid("ffffff", Geometry.Circle(x - 3, 77.8, 1.7)),
    )

    private val beak: List<Shape> = listOf(
        Shape(
            Geometry.Path("M65.5 85 Q60.5 91 65.5 97.5 L86.5 93 Q90.5 91.3 86.5 89.6 Z"),
            fill = Paint.Linear("fde68a", "f59e0b", TOP, BOTTOM), stroke = Stroke("b45309", 1.6),
        ),
        line("M63.8 90.6 Q75 94 87 90.9", "b45309", 1.5),
        line("M68 86.8 Q75 86 81 88", "ffffff", 1.8, opacity = 0.7),
    )

    private const val HEART = "M70 117.2 C56.4 109.2 62.8 100.4 70 107.2 C77.2 100.4 83.6 109.2 70 117.2 Z"
    private const val TAIL = "M61 112 C50 116 45 124 47 131 C53 130 57 126 60 122 C62 128 66 132 72 133 C74 125 70 117 66 112 Z"

    private fun wing(cx: Double, rotation: Double, vein: String, skin: String, deep: String, light: String, veinHex: String) = listOf(
        Shape(
            Geometry.Ellipse(cx, 70.0, 13.0, 24.0, rotation),
            fill = Paint.Linear(light, skin, TOP, BOTTOM), stroke = Stroke(deep, 2.2, opacity = 0.55),
        ),
        line(vein, veinHex, 2.0),
    )

    private fun wings(skin: String, deep: String, light: String, vein: String): Pair<List<Shape>, List<Shape>> =
        wing(26.0, -34.0, "M21 60 q2 12 7 22", skin, deep, light, vein) to
            wing(114.0, 34.0, "M119 60 q-2 12 -7 22", skin, deep, light, vein)

    private fun body(inner: String, outer: String, deep: String) = Shape(
        Geometry.Circle(70.0, 80.0, 40.0),
        fill = Paint.Radial(inner, outer, UnitPoint(0.38, 0.3), 0.8), stroke = Stroke(deep, 2.4),
    )

    private val bodyGlints: List<Shape> = listOf(
        solid("ffffff", Geometry.Ellipse(55.0, 55.0, 13.0, 7.5, -28.0), opacity = 0.38),
        solid("ffffff", Geometry.Circle(76.0, 47.5, 2.6), opacity = 0.55),
    )

    private fun cheeks(hex: String) = listOf(
        solid(hex, Geometry.Ellipse(45.0, 88.0, 7.5, 4.8), opacity = 0.85),
        solid(hex, Geometry.Ellipse(98.0, 86.0, 7.0, 4.6), opacity = 0.85),
    )

    /** Mee, joyeuse : les yeux en arcs, la crête rose, la queue verte. */
    public val meeJoy: List<Shape> = run {
        val (left, right) = wings(skin = "7de8d2", deep = "0f766e", light = "e6fff7", vein = "7de8d2")
        val crest = "M66 44 C58 28 74 16 84 24 C91 30 84 40 77 35"
        left + listOf(
            Shape(Geometry.Path(TAIL), fill = Paint.Solid("0f766e"), stroke = Stroke("0f766e", 1.8)),
            line(crest, "0f766e", 9.5),
            line(crest, "f43f5e", 6.0),
            solid("ffffff", Geometry.Circle(72.0, 24.0, 1.6), opacity = 0.75),
            body("7ff0c8", "14b8a6", "0f766e"),
        ) + bodyGlints + listOf(
            solid("f0fdfa", Geometry.Ellipse(70.0, 103.0, 26.0, 16.0), opacity = 0.96),
            Shape(Geometry.Path(HEART), fill = Paint.Linear("fb7185", "e11d48", TOP_LEADING, BOTTOM_TRAILING)),
            solid("ffffff", Geometry.Circle(66.0, 107.0, 1.5), opacity = 0.9),
        ) + cheeks("ff7a9a") + listOf(
            line("M49 76 q8 -11 16 0", "1c1941", 4.5),
            line("M75 76 q8 -11 16 0", "1c1941", 4.5),
        ) + beak + right
    }

    /** Meo, les yeux ouverts : le plumet violet, la queue ambrée, le col violet. */
    public val meoOpen: List<Shape> = run {
        val (left, right) = wings(skin = "86efac", deep = "065f46", light = "e3fcef", vein = "86efac")
        fun plume(d: String) = Shape(Geometry.Path(d), fill = Paint.Solid("7c3aed"), stroke = Stroke("6d28d9", 2.0))
        left + listOf(
            Shape(Geometry.Path(TAIL), fill = Paint.Solid("d97706"), stroke = Stroke("065f46", 1.8)),
            plume("M62 45 C58 35 48 31 38 34 C46 37 51 41 53 48 Z"),
            plume("M69 43 C68 29 58 20 45 21 C55 27 59 34 60 45 Z"),
            plume("M76 43 C77 30 70 18 60 14 C66 23 68 32 67 44 Z"),
            body("5ee6a8", "0d9b6c", "065f46"),
        ) + bodyGlints + listOf(
            solid("ecfdf5", Geometry.Ellipse(70.0, 103.0, 26.0, 16.0), opacity = 0.96),
            solid("6d28d9", Geometry.Path("M61 107 Q50 110 42 117 Q53 115 62 112 Z")),
            solid("6d28d9", Geometry.Path("M79 107 Q90 110 98 117 Q87 115 78 112 Z")),
            Shape(Geometry.Path(HEART), fill = Paint.Linear("a78bfa", "6d28d9", TOP_LEADING, BOTTOM_TRAILING)),
            solid("ffffff", Geometry.Circle(66.0, 107.0, 1.5), opacity = 0.9),
        ) + cheeks("ff8fa8") + meoEye(57.0) + meoEye(83.0) + beak + right
    }

    public fun shapes(bird: GameEngravedBird): List<Shape> = when (bird) {
        GameEngravedBird.MeeJoy -> meeJoy
        GameEngravedBird.MeoOpen -> meoOpen
    }
}
