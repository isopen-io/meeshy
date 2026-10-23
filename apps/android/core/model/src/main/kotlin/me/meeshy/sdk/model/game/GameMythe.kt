package me.meeshy.sdk.model.game

import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin

/** Un gain de Gloire daté (instant ISO 8601, comparé comme texte). */
public data class GloryGain(val delta: Int, val createdAt: String)

public data class MythicArrival(val userId: String, val glory: Int, val crossedAt: String)

public data class MythicSeatGrant(val userId: String, val number: Int)

public data class MythicSignatureLine(val x1: Double, val y1: Double, val x2: Double, val y2: Double)

public data class MythicSignatureBead(val cx: Double, val cy: Double, val r: Double, val slot: Int)

public data class MythicSignatureHalo(
    val cx: Double,
    val cy: Double,
    val inner: Double,
    val outer: Double,
    val strokeWidth: Double,
)

public data class MythicSignatureGem(val cx: Double, val cy: Double, val r: Double, val orbit: Double, val angle: Int)

public data class MythicSignatureEngraving(val x: Double, val y: Double, val size: Double)

/**
 * La Signature unique d'une émission du Mythe : une TABLE DE GÉOMÉTRIE dans le carré de 1 024
 * ([GameMythe.SIGNATURE_BOX]), centre (512, 512). Les trois traits de la Signature Meeshy ne sont
 * jamais déformés ; ce qui rend un Mythe unique est ce qui l'ENTOURE : le halo (la dizaine), la gemme
 * (l'unité), les perles (l'anneau), le prisme (teinte) et le numéro gravé.
 */
public data class MythicSignatureDesign(
    /** Le numéro d'émission dont dérive la Signature. */
    val edition: Int,
    /** Teinte de départ du prisme, en degrés entiers (0-359). */
    val hue: Int,
    val halo: MythicSignatureHalo,
    /** Les rayons du halo, le premier à midi, à pas égal dans le sens horaire. */
    val rays: List<MythicSignatureLine>,
    val gem: MythicSignatureGem,
    /** Les perles de l'anneau (aucune pour les émissions 1 à 100). */
    val beads: List<MythicSignatureBead>,
    /** Le numéro d'émission gravé sous la Signature. */
    val numeral: String,
    val engraving: MythicSignatureEngraving,
)

/**
 * LE MYTHE : cent places prises dans l'ordre d'arrivée à 1 000 000 de Gloire, et une émission par
 * attribution. La passerelle tient le registre et attribue ; le client ne calcule JAMAIS l'attribution
 * d'une place : il DESSINE la Signature de l'émission que le serveur lui sert ([signature]), de façon
 * déterministe. Les fonctions d'attribution ([assignSeats]…) disent, sans base, ce que la loi produit ;
 * elles servent de témoin des vecteurs partagés. Le TypeScript fait foi (`mythe.ts`,
 * `mythic-signature.ts`) ; miroir iOS `GameMythe.swift`.
 */
public object GameMythe {
    public const val SIGNATURE_BOX: Int = 1024

    private const val CENTER = 512.0
    private const val HALO_INNER = 380.0
    private const val HALO_OUTER = 430.0
    private const val HALO_STROKE = 28.0
    private const val GEM_ORBIT = 478.0
    private const val GEM_R = 30.0
    private const val BEADS_ORBIT = 350.0
    private const val BEADS_R = 9.0
    private const val BEAD_SLOTS = 12
    private const val ENGRAVING_X = 512.0
    private const val ENGRAVING_Y = 800.0
    private const val ENGRAVING_SIZE = 72.0

    /** Le nombre d'émissions dont la géométrie seule est deux à deux distincte : 100 x 2^12. */
    public const val GEOMETRY_SPAN: Int = 100 * (1 shl BEAD_SLOTS)

    /** `true` quand cette Gloire ouvre droit à une place (s'il en reste une). */
    public fun reachesMythe(glory: Int): Boolean = glory >= GloryLaws.MYTHE_GLORY

    /** Les places libres, de la plus petite à la plus grande, quand [taken] sont prises. */
    public fun freeNumbers(taken: Collection<Int>): List<Int> {
        val held = taken.filter(GloryLaws::isMythicNumber).toSet()
        return (1..GloryLaws.MYTHE_SIZE).filter { it !in held }
    }

    /** La place que prend le prochain arrivant : la plus petite libre, `null` quand les cent sont prises. */
    public fun nextNumber(taken: Collection<Int>): Int? = freeNumbers(taken).firstOrNull()

    /**
     * L'instant où une suite de gains atteint le seuil pour la PREMIÈRE fois, `null` s'il n'est pas
     * atteint. Les gains se rangent par instant ; une correction négative ne déplace pas l'arrivée.
     */
    public fun crossedAt(gains: List<GloryGain>): String? {
        var total = 0L
        for (gain in gains.sortedBy { it.createdAt }) {
            total += gain.delta
            if (total >= GloryLaws.MYTHE_GLORY) return gain.createdAt
        }
        return null
    }

    /** L'ordre d'arrivée : instant de franchissement, puis identifiant. Le dernier doublon d'un compte l'emporte. */
    public fun arrivalOrder(arrivals: List<MythicArrival>): List<MythicArrival> =
        arrivals.associateBy { it.userId }.values
            .filter { reachesMythe(it.glory) }
            .sortedWith(compareBy<MythicArrival> { it.crossedAt }.thenBy { it.userId })

    /**
     * Les places qu'une attribution donne : aux arrivants qui ont la Gloire et pas encore de place, dans
     * l'ordre d'arrivée, chacun sur la plus petite place libre restante, jamais au-delà de la 100e.
     */
    public fun assignSeats(taken: Collection<Int>, seated: Collection<String>, arrivals: List<MythicArrival>): List<MythicSeatGrant> {
        val free = freeNumbers(taken)
        val already = seated.toSet()
        return arrivalOrder(arrivals)
            .filter { it.userId !in already }
            .take(free.size)
            .mapIndexed { index, arrival -> MythicSeatGrant(arrival.userId, free[index]) }
    }

    private fun tenth(value: Double): Double = floor(value * 10 + 0.5) / 10

    private fun polar(radius: Double, degrees: Double): Pair<Double, Double> {
        val radians = degrees * Math.PI / 180
        return tenth(CENTER + radius * sin(radians)) to tenth(CENTER - radius * cos(radians))
    }

    /** Le nombre de rayons : la dizaine, 12 pour 1-10, 14 pour 11-20 ... 30 pour 91-100, puis on recommence. */
    public fun rayCount(edition: Int): Int = 12 + 2 * (((edition - 1) / 10) % 10)

    /** L'angle de la gemme : l'unité, 18 degrés pour 1, 11, 21 ... ; 342 pour 10, 20, 30 ... */
    public fun gemAngle(edition: Int): Int = 18 + 36 * ((edition - 1) % 10)

    /** L'anneau : floor((e - 1) / 100) modulo 2^12, dont les bits sont les perles. */
    public fun ring(edition: Int): Int = ((edition - 1) / 100) % (1 shl BEAD_SLOTS)

    /** La teinte de départ du prisme : floor((e - 1) x 137,508 + 1/2) mod 360, en entiers. */
    public fun hue(edition: Int): Int = ((((edition - 1).toLong() * 137_508L + 500L) / 1000L) % 360L).toInt()

    /** La Signature unique de l'émission [edition] (1, 2, 3...) ; `null` pour une émission illisible. */
    public fun signature(edition: Int): MythicSignatureDesign? {
        if (!GloryLaws.isMythicEdition(edition)) return null
        val count = rayCount(edition)
        val rays = (0 until count).map { k ->
            val degrees = 360.0 * k / count
            val (x1, y1) = polar(HALO_INNER, degrees)
            val (x2, y2) = polar(HALO_OUTER, degrees)
            MythicSignatureLine(x1, y1, x2, y2)
        }
        val angle = gemAngle(edition)
        val (gemX, gemY) = polar(GEM_ORBIT, angle.toDouble())
        val ring = ring(edition)
        val beads = (0 until BEAD_SLOTS).filter { (ring shr it) and 1 == 1 }.map { slot ->
            val (cx, cy) = polar(BEADS_ORBIT, 15.0 + 30.0 * slot)
            MythicSignatureBead(cx, cy, BEADS_R, slot)
        }
        return MythicSignatureDesign(
            edition = edition,
            hue = hue(edition),
            halo = MythicSignatureHalo(CENTER, CENTER, HALO_INNER, HALO_OUTER, HALO_STROKE),
            rays = rays,
            gem = MythicSignatureGem(gemX, gemY, GEM_R, GEM_ORBIT, angle),
            beads = beads,
            numeral = edition.toString(),
            engraving = MythicSignatureEngraving(ENGRAVING_X, ENGRAVING_Y, ENGRAVING_SIZE),
        )
    }

    /** Les Signatures des émissions 1 à [count] (cent par défaut). */
    public fun signatures(count: Int = GloryLaws.MYTHE_SIZE): List<MythicSignatureDesign> =
        (1..count).mapNotNull(::signature)
}
