package me.meeshy.sdk.model.appearance

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/*
 * FrameDecor (#10932) — MIROIR de `packages/shared/types/frame-decor.ts` et de
 * `FrameDecor.swift` : les briques COMMUNES aux contours d'avatar et aux cadres de
 * bannière, les DÉGRADÉS et les MOUVEMENTS déclarés. Un mouvement est une donnée,
 * rendue par le GPU sur transform et opacity seuls ; il désigne ses cibles par le
 * `group` des chemins qu'il anime. Sur divergence, le TypeScript a raison.
 *
 * Décodage TOLÉRANT là où il le faut : un mouvement inconnu ou hors bornes est
 * IGNORÉ (les autres restent), un dégradé inconnu GARDE SA PLACE (`null`) pour que
 * l'index des traits reste juste, le trait retombant sur sa couleur.
 */

@Serializable
enum class FrameMotionKind {
    @SerialName("rotate") ROTATE,
    @SerialName("pulse") PULSE,
    @SerialName("sweep") SWEEP,
    @SerialName("twinkle") TWINKLE,
    @SerialName("skew") SKEW,
    ;

    /** L'amplitude admise par mouvement ; `null` = il n'en prend pas. */
    val amplitudeRange: ClosedFloatingPointRange<Double>?
        get() = when (this) {
            ROTATE -> 1.0..360.0
            PULSE -> 0.01..0.3
            SWEEP -> null
            TWINKLE -> 0.05..1.0
            SKEW -> 1.0..15.0
        }

    /** Les points d'ancrage qu'il accepte ; un reflet et un scintillement n'en ont pas. */
    val origins: Set<FrameMotionOrigin>
        get() = when (this) {
            ROTATE -> setOf(FrameMotionOrigin.FRAME, FrameMotionOrigin.SELF, FrameMotionOrigin.TOP, FrameMotionOrigin.BOTTOM)
            PULSE -> setOf(FrameMotionOrigin.FRAME, FrameMotionOrigin.SELF)
            SWEEP, TWINKLE -> emptySet()
            SKEW -> setOf(FrameMotionOrigin.SELF, FrameMotionOrigin.TOP, FrameMotionOrigin.BOTTOM)
        }
}

/** `frame` : le centre du cadre ; `self` : le centre de la cible ; `top` / `bottom` : son bord. */
@Serializable
enum class FrameMotionOrigin {
    @SerialName("frame") FRAME,
    @SerialName("self") SELF,
    @SerialName("top") TOP,
    @SerialName("bottom") BOTTOM,
}

@Serializable
enum class FrameMotionDirection {
    @SerialName("normal") NORMAL,
    @SerialName("reverse") REVERSE,
    @SerialName("alternate") ALTERNATE,
}

/**
 * Fail-closed PAR mouvement : un mouvement hors bornes ne se construit pas, et la
 * liste qui le porte ([FrameMotionListSerializer]) le tait — jamais le cadre.
 */
@Serializable
data class FrameMotion(
    val kind: FrameMotionKind,
    val targets: List<String>,
    /** Secondes. */
    val duration: Double,
    val delay: Double? = null,
    /** Le décalage entre deux cibles successives. */
    val stagger: Double? = null,
    val direction: FrameMotionDirection? = null,
    val amplitude: Double? = null,
    val origin: FrameMotionOrigin? = null,
) {
    init {
        require(isWithinBounds()) { "mouvement hors bornes" }
    }

    private fun isWithinBounds(): Boolean {
        if (targets.size !in 1..MAX_TARGETS || targets.toSet().size != targets.size) return false
        if (!targets.all(FrameDecorField::isGroup)) return false
        if (duration !in DURATION_RANGE) return false
        if (delay != null && delay !in 0.0..MAX_DELAY) return false
        if (stagger != null && stagger !in 0.0..MAX_STAGGER) return false
        if (amplitude != null && amplitude !in (kind.amplitudeRange ?: return false)) return false
        if (origin != null && origin !in kind.origins) return false
        return true
    }

    companion object {
        const val MAX_MOTIONS = 8

        /** Au-delà, la liste est un abus (le TypeScript refuse le dessin) : rien ne s'anime. */
        const val MAX_DECLARED_MOTIONS = 32
        const val MAX_TARGETS = 16
        val DURATION_RANGE: ClosedFloatingPointRange<Double> = 0.5..180.0
        const val MAX_DELAY = 30.0
        const val MAX_STAGGER = 10.0
    }
}

/** Les mouvements lisibles d'une liste, dans l'ordre, au plus huit. */
object FrameMotionListSerializer : KSerializer<List<FrameMotion>> by LossyListSerializer(
    FrameMotion.serializer(),
    maxDeclared = FrameMotion.MAX_DECLARED_MOTIONS,
    maxKept = FrameMotion.MAX_MOTIONS,
)

@Serializable
data class FrameGradientStop(
    /** Index dans la palette fixe du cadre. */
    val color: Int,
    val at: Double,
    val opacity: Double? = null,
)

/** Un dégradé linéaire, en fractions de la boîte du chemin qui le porte. */
@Serializable
data class FrameGradient(
    val kind: String,
    val x1: Double,
    val y1: Double,
    val x2: Double,
    val y2: Double,
    val stops: List<FrameGradientStop>,
) {
    init {
        require(kind == LINEAR) { "dégradé inconnu" }
        require(listOf(x1, y1, x2, y2).all { it in UNIT }) { "dégradé hors bornes" }
        require(stops.size in MIN_STOPS..MAX_STOPS) { "dégradé hors bornes" }
        require(stops.all { it.at in UNIT && (it.opacity == null || it.opacity in UNIT) && it.color >= 0 }) {
            "dégradé hors bornes"
        }
        require(stops.zipWithNext().all { (previous, next) -> previous.at <= next.at }) { "dégradé hors bornes" }
    }

    /** Chaque arrêt désigne une couleur de la palette de [colorCount] couleurs. */
    fun fitsPalette(colorCount: Int): Boolean = stops.all { it.color < colorCount }

    companion object {
        const val LINEAR = "linear"
        const val MAX_GRADIENTS = 4
        private const val MIN_STOPS = 2
        private const val MAX_STOPS = 4
        private val UNIT = 0.0..1.0
    }
}

/**
 * Les dégradés d'un cadre : un dégradé illisible GARDE SA PLACE (`null`) — le trait
 * qui le désigne retombe sur sa couleur. Au plus quatre.
 */
object FrameGradientListSerializer : KSerializer<List<FrameGradient?>> by LossySlotListSerializer(
    FrameGradient.serializer(),
    maxKept = FrameGradient.MAX_GRADIENTS,
)

/** Les contrôles de champ communs aux contours et aux cadres : rien d'autre que ce qui se dessine. */
object FrameDecorField {
    private val PATH_DATA = Regex("^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\\s-]+$")
    private val GROUP = Regex("^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
    private const val MAX_GROUP_LENGTH = 24
    private val HEX_LENGTHS = setOf(3, 6, 8)

    /** Les seules commandes de chemin SVG, comme `PATH_D_PATTERN` : aucun autre caractère ne se dessine. */
    fun isPathData(value: String, maxLength: Int): Boolean =
        value.isNotEmpty() && value.length <= maxLength && PATH_DATA.matches(value)

    /** L'identifiant d'un groupe de chemins, ou la clé d'un modèle : le motif des slugs de packs, 24 caractères au plus. */
    fun isGroup(value: String): Boolean = value.length <= MAX_GROUP_LENGTH && GROUP.matches(value)

    /** `#RGB`, `#RRGGBB` ou `#RRGGBBAA`, dièse facultatif — rien d'autre ne se dessine. */
    fun isHex(value: String): Boolean {
        val digits = value.removePrefix("#")
        return digits.length in HEX_LENGTHS && digits.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }
    }
}
