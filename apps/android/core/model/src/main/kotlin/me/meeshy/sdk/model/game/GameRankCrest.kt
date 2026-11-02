package me.meeshy.sdk.model.game

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin

/**
 * `tone` nomme un RÔLE, jamais une couleur : `METAL` (la matière du rang), `GOLD` (l'or), `INK` (l'encre de la
 * matière, posée SUR une pièce).
 */
public enum class CrestTone { METAL, GOLD, INK }

public data class CrestCubic(
    val c1x: Double,
    val c1y: Double,
    val c2x: Double,
    val c2y: Double,
    val x: Double,
    val y: Double,
)

/** Une pièce de la décoration. Toutes ont des bouts ronds, comme la Signature. */
public sealed interface CrestPiece {
    public val tone: CrestTone

    public data class Line(
        val x1: Double,
        val y1: Double,
        val x2: Double,
        val y2: Double,
        val width: Double,
        override val tone: CrestTone,
    ) : CrestPiece

    /** Un arc tracé dans le sens horaire de [from] à [to] (degrés depuis midi). */
    public data class Arc(
        val cx: Double,
        val cy: Double,
        val r: Double,
        val from: Double,
        val to: Double,
        val width: Double,
        override val tone: CrestTone,
    ) : CrestPiece

    /** Un trait courbe : un départ, puis des Bézier cubiques. */
    public data class Curve(
        val x: Double,
        val y: Double,
        val segments: List<CrestCubic>,
        val width: Double,
        override val tone: CrestTone,
    ) : CrestPiece

    /** Une feuille pleine : deux Bézier quadratiques dont le contrôle s'écarte de 2 x [bulge] du milieu. */
    public data class Leaf(
        val x1: Double,
        val y1: Double,
        val x2: Double,
        val y2: Double,
        val bulge: Double,
        override val tone: CrestTone,
    ) : CrestPiece

    public data class Dot(val cx: Double, val cy: Double, val r: Double, override val tone: CrestTone) : CrestPiece
}

public data class BlasonViewport(val x: Double, val y: Double, val width: Double, val height: Double)

public data class DivisionNotch(val x: Double, val y1: Double, val y2: Double, val width: Double, val on: Boolean)

public data class CrestPoint(val x: Double, val y: Double)

public data class MythicHaloBead(val cx: Double, val cy: Double, val r: Double)

public data class MythicHaloNumeral(val text: String, val x: Double, val y: Double, val size: Double)

public data class MythicHalo(
    /** L'émission dessinée, `null` pour le halo par défaut (ancien serveur). */
    val edition: Int?,
    /** Teinte de départ du prisme (0-359) ; `null` : le dégradé prismatique du client. */
    val hue: Int?,
    val rays: List<MythicSignatureLine>,
    val rayWidth: Double,
    /** Les quatre sommets du losange, de la pointe extérieure, dans le sens horaire. */
    val gem: List<CrestPoint>?,
    val beads: List<MythicHaloBead>,
    val numeral: MythicHaloNumeral?,
)

/**
 * LE BLASON D'UN RANG, SA GÉOMÉTRIE : une TABLE, pas du dessin. Miroir de `packages/shared/utils/game/rank-crest.ts`
 * (le TypeScript fait foi) et de `GameRankCrest.swift`, recopié forme pour forme.
 *
 * Repère : le cadre du blason, 200 x 184 ; l'écu y occupe x 64-136, y 36-119 (sa pointe en (100, 119)). Angles en
 * degrés depuis MIDI, sens horaire (x = cx + r sin t, y = cy - r cos t), comme la Signature unique.
 */
public object GameRankCrest {

    public const val FRAME_WIDTH: Double = 200.0
    public const val FRAME_HEIGHT: Double = 184.0

    public val fullFrame: BlasonViewport = BlasonViewport(0.0, 0.0, 200.0, 184.0)
    public val compactFrame: BlasonViewport = BlasonViewport(30.0, 6.0, 140.0, 128.8)
    public val compactMythicFrame: BlasonViewport = BlasonViewport(14.0, 5.0, 172.0, 158.24)

    /** En dessous de cette largeur, le blason se dessine en petit format. */
    public const val COMPACT_BELOW: Double = 60.0

    /** Le niveau gravé dans la pointe de l'écu : centre de la ligne de base et corps. */
    public const val LEVEL_X: Double = 100.0
    public const val LEVEL_Y: Double = 109.0
    public const val LEVEL_SIZE: Double = 15.0

    /** Le corps de la gravure selon le nombre de chiffres : 15 jusqu'à 2 chiffres, puis 12, 9,5 et 8. */
    public fun levelEngravingSize(level: Int): Double = when (maxOf(0, level).toString().length) {
        1, 2 -> LEVEL_SIZE
        3 -> 12.0
        4 -> 9.5
        else -> 8.0
    }

    private const val NOTCH_CX = 100.0
    private const val NOTCH_Y1 = 124.0
    private const val NOTCH_Y2 = 131.0
    private const val NOTCH_GAP = 9.0
    private const val NOTCH_WIDTH = 4.0
    public const val NOTCH_SLOTS: Int = 5

    private const val HALO_CX = 100.0
    private const val HALO_CY = 84.0
    private const val HALO_SCALE = 0.155
    public const val MYTHIC_HALO_DEFAULT_RAYS: Int = 12

    private fun line(x1: Double, y1: Double, x2: Double, y2: Double, width: Double, tone: CrestTone): CrestPiece =
        CrestPiece.Line(x1, y1, x2, y2, width, tone)

    private fun arc(cx: Double, cy: Double, r: Double, from: Double, to: Double, width: Double, tone: CrestTone): CrestPiece =
        CrestPiece.Arc(cx, cy, r, from, to, width, tone)

    private fun leaf(x1: Double, y1: Double, x2: Double, y2: Double, bulge: Double, tone: CrestTone): CrestPiece =
        CrestPiece.Leaf(x1, y1, x2, y2, bulge, tone)

    private fun dot(cx: Double, cy: Double, r: Double, tone: CrestTone): CrestPiece = CrestPiece.Dot(cx, cy, r, tone)

    private fun cubic(c1x: Double, c1y: Double, c2x: Double, c2y: Double, x: Double, y: Double) =
        CrestCubic(c1x, c1y, c2x, c2y, x, y)

    private val laurel: List<CrestPiece> = listOf(
        CrestPiece.Curve(62.0, 131.0, listOf(cubic(48.0, 123.7, 42.3, 110.0, 45.0, 90.0)), 3.0, CrestTone.GOLD),
        CrestPiece.Curve(138.0, 131.0, listOf(cubic(152.0, 123.7, 157.7, 110.0, 155.0, 90.0)), 3.0, CrestTone.GOLD),
        leaf(54.6, 125.8, 45.9, 128.0, 3.2, CrestTone.GOLD),
        leaf(49.2, 119.2, 53.1, 111.1, 3.2, CrestTone.GOLD),
        leaf(45.8, 111.0, 37.3, 108.1, 3.2, CrestTone.GOLD),
        leaf(44.4, 101.2, 51.7, 96.0, 3.2, CrestTone.GOLD),
        leaf(45.0, 90.0, 46.2, 81.1, 3.2, CrestTone.GOLD),
        leaf(145.4, 125.8, 154.1, 128.0, 3.2, CrestTone.GOLD),
        leaf(150.8, 119.2, 146.9, 111.1, 3.2, CrestTone.GOLD),
        leaf(154.2, 111.0, 162.7, 108.1, 3.2, CrestTone.GOLD),
        leaf(155.6, 101.2, 148.3, 96.0, 3.2, CrestTone.GOLD),
        leaf(155.0, 90.0, 153.8, 81.1, 3.2, CrestTone.GOLD),
    )

    private val byRank: Map<GloryRank, List<CrestPiece>> = mapOf(
        GloryRank.Murmure to listOf(line(90.0, 26.0, 110.0, 26.0, 6.0, CrestTone.METAL)),
        GloryRank.Echo to listOf(
            arc(100.0, 40.0, 12.0, -55.0, 55.0, 4.5, CrestTone.METAL),
            arc(100.0, 40.0, 22.0, -50.0, 50.0, 4.5, CrestTone.METAL),
        ),
        GloryRank.Voix to listOf(
            line(91.0, 29.3, 82.0, 18.6, 5.5, CrestTone.METAL),
            line(100.0, 26.0, 100.0, 12.0, 5.5, CrestTone.METAL),
            line(109.0, 29.3, 118.0, 18.6, 5.5, CrestTone.METAL),
        ),
        GloryRank.Conteur to listOf(
            leaf(100.0, 31.0, 86.0, 22.0, 3.5, CrestTone.METAL),
            leaf(100.0, 31.0, 114.0, 22.0, 3.5, CrestTone.METAL),
            leaf(100.0, 33.0, 100.0, 10.0, 7.0, CrestTone.METAL),
            line(100.0, 29.0, 100.0, 15.0, 1.6, CrestTone.INK),
        ),
        GloryRank.Passeur to listOf(
            arc(100.0, 44.0, 32.0, -72.0, 72.0, 6.0, CrestTone.METAL),
            arc(100.0, 44.0, 24.0, -66.0, 66.0, 3.0, CrestTone.METAL),
            dot(100.0, 12.0, 4.5, CrestTone.GOLD),
            dot(69.6, 34.1, 3.5, CrestTone.GOLD),
            dot(130.4, 34.1, 3.5, CrestTone.GOLD),
        ),
        GloryRank.Polyglotte to listOf(
            line(72.0, 22.0, 128.0, 22.0, 3.0, CrestTone.METAL),
            CrestPiece.Curve(
                72.0, 22.0,
                listOf(cubic(81.0, 11.0, 91.0, 11.0, 100.0, 22.0), cubic(109.0, 33.0, 119.0, 33.0, 128.0, 22.0)),
                4.5, CrestTone.METAL,
            ),
            CrestPiece.Curve(
                72.0, 22.0,
                listOf(cubic(81.0, 33.0, 91.0, 33.0, 100.0, 22.0), cubic(109.0, 11.0, 119.0, 11.0, 128.0, 22.0)),
                4.5, CrestTone.GOLD,
            ),
            dot(72.0, 22.0, 3.2, CrestTone.GOLD),
            dot(100.0, 22.0, 3.2, CrestTone.GOLD),
            dot(128.0, 22.0, 3.2, CrestTone.GOLD),
        ),
        GloryRank.Ambassadeur to laurel,
        GloryRank.Orateur to laurel + listOf(
            line(82.2, 33.1, 75.7, 28.4, 4.5, CrestTone.METAL),
            line(88.2, 29.8, 80.0, 18.5, 4.5, CrestTone.METAL),
            line(93.2, 25.1, 90.7, 17.5, 4.5, CrestTone.METAL),
            line(100.0, 26.0, 100.0, 12.0, 4.5, CrestTone.METAL),
            line(106.8, 25.1, 109.3, 17.5, 4.5, CrestTone.METAL),
            line(111.8, 29.8, 120.0, 18.5, 4.5, CrestTone.METAL),
            line(117.8, 33.1, 124.3, 28.4, 4.5, CrestTone.METAL),
        ),
        GloryRank.Oracle to laurel + listOf(
            line(100.0, 10.0, 100.0, 32.0, 5.0, CrestTone.METAL),
            line(109.5, 15.5, 90.5, 26.5, 5.0, CrestTone.METAL),
            line(109.5, 26.5, 90.5, 15.5, 5.0, CrestTone.METAL),
            dot(100.0, 21.0, 3.0, CrestTone.GOLD),
            dot(85.0, 12.0, 1.8, CrestTone.GOLD),
            dot(115.0, 12.0, 1.8, CrestTone.GOLD),
            dot(84.0, 30.0, 1.8, CrestTone.GOLD),
            dot(116.0, 30.0, 1.8, CrestTone.GOLD),
        ),
        GloryRank.Legende to laurel + listOf(
            line(78.0, 33.0, 122.0, 33.0, 5.0, CrestTone.GOLD),
            line(80.0, 33.0, 80.0, 23.0, 4.5, CrestTone.GOLD),
            line(90.0, 33.0, 90.0, 17.0, 4.5, CrestTone.GOLD),
            line(100.0, 33.0, 100.0, 12.0, 4.5, CrestTone.GOLD),
            line(110.0, 33.0, 110.0, 17.0, 4.5, CrestTone.GOLD),
            line(120.0, 33.0, 120.0, 23.0, 4.5, CrestTone.GOLD),
            dot(90.0, 17.0, 3.4, CrestTone.METAL),
            dot(100.0, 12.0, 3.4, CrestTone.METAL),
            dot(110.0, 17.0, 3.4, CrestTone.METAL),
        ),
        GloryRank.Mythe to emptyList(),
    )

    /** La décoration de chaque rang, dessinée DERRIÈRE l'écu ; le Mythe n'en a pas (son halo vient de l'émission). */
    public fun pieces(rank: GloryRank): List<CrestPiece> = byRank.getValue(rank)

    /** Le nombre d'encoches pleines d'une division : V (5) = 1 ... I (1) = 5. */
    public fun notchCount(division5: Int): Int = 6 - division5

    /** Les cinq encoches d'une division, pleines de gauche à droite ; `null` (le Mythe) ou hors 1-5 : aucune. */
    public fun notches(division5: Int?): List<DivisionNotch> {
        if (division5 == null || division5 !in 1..5) return emptyList()
        val count = notchCount(division5)
        return (0 until NOTCH_SLOTS).map { k ->
            DivisionNotch(
                x = NOTCH_CX + (k - (NOTCH_SLOTS - 1) / 2.0) * NOTCH_GAP,
                y1 = NOTCH_Y1,
                y2 = NOTCH_Y2,
                width = NOTCH_WIDTH,
                on = k < count,
            )
        }
    }

    /** Un point d'un arc (degrés depuis midi, sens horaire). */
    public fun arcPoint(cx: Double, cy: Double, r: Double, degrees: Double): CrestPoint {
        val radians = degrees * PI / 180
        return CrestPoint(cx + r * sin(radians), cy - r * cos(radians))
    }

    private fun tenth(value: Double): Double = floor(value * 10 + 0.5) / 10

    private fun place(x: Double, y: Double): CrestPoint {
        val half = GameMythe.SIGNATURE_BOX / 2.0
        return CrestPoint(tenth(HALO_CX + (x - half) * HALO_SCALE), tenth(HALO_CY + (y - half) * HALO_SCALE))
    }

    private fun placed(ray: MythicSignatureLine): MythicSignatureLine {
        val from = place(ray.x1, ray.y1)
        val to = place(ray.x2, ray.y2)
        return MythicSignatureLine(from.x, from.y, to.x, to.y)
    }

    /**
     * La Signature unique d'une émission posée en HALO autour de l'écu ; sans émission lisible : douze rayons,
     * sans gemme, ni perle, ni numéro.
     */
    public fun mythicHalo(edition: Int?): MythicHalo {
        val design = edition?.let(GameMythe::signature)
        if (design == null) {
            val rays = (0 until MYTHIC_HALO_DEFAULT_RAYS).map { k ->
                val radians = 2 * PI * k / MYTHIC_HALO_DEFAULT_RAYS
                val from = place(512 + 380 * sin(radians), 512 - 380 * cos(radians))
                val to = place(512 + 430 * sin(radians), 512 - 430 * cos(radians))
                MythicSignatureLine(from.x, from.y, to.x, to.y)
            }
            return MythicHalo(null, null, rays, tenth(28 * HALO_SCALE), null, emptyList(), null)
        }
        val radians = design.gem.angle * PI / 180
        val alongX = sin(radians)
        val alongY = -cos(radians)
        val acrossX = -alongY
        val acrossY = alongX
        val g = design.gem
        val r = g.r
        val gem = listOf(
            place(g.cx + alongX * r, g.cy + alongY * r),
            place(g.cx + acrossX * r, g.cy + acrossY * r),
            place(g.cx - alongX * r, g.cy - alongY * r),
            place(g.cx - acrossX * r, g.cy - acrossY * r),
        )
        val beads = design.beads.map { bead ->
            val at = place(bead.cx, bead.cy)
            MythicHaloBead(at.x, at.y, tenth(bead.r * HALO_SCALE))
        }
        val engraving = place(design.engraving.x, design.engraving.y)
        return MythicHalo(
            edition = design.edition,
            hue = design.hue,
            rays = design.rays.map(::placed),
            rayWidth = tenth(design.halo.strokeWidth * HALO_SCALE),
            gem = gem,
            beads = beads,
            numeral = MythicHaloNumeral(design.numeral, engraving.x, engraving.y, tenth(design.engraving.size * HALO_SCALE)),
        )
    }
}
