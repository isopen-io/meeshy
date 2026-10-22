package me.meeshy.sdk.model.appearance

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.pack.PackAssetRef

/*
 * AvatarRingDesign (#10632, spec §§ 5.2, 6) — MIROIR de
 * `packages/shared/types/avatar-ring-design.ts` et de `AvatarRingDesign.swift` :
 * un contour d'avatar. Il se voit des AUTRES, donc ses couleurs sont FIXES (aucun
 * rôle `accent`). Les traits d'ornement désignent leur couleur par l'INDEX dans
 * `stroke.colors` (1 à 8, #10936) ; `none` ne trace aucun trait de base :
 * l'ornement dessine tout. Ce sont des DONNÉES (hex, chemins, nombres) : rien de
 * reçu n'est interprété. Dégradés et mouvements déclarés (#10932, `FrameDecor.kt`) :
 * FACULTATIFS et tolérants — un contour de l'ancien format se lit sans eux, un
 * mouvement inconnu est ignoré.
 *
 * Fail-closed PAR contour (hex invalide, index de couleur absent, chemin illisible) :
 * un contour hors bornes ne se construit pas, et la liste qui le porte
 * ([AvatarRingListSerializer]) le tait SEUL.
 */

@Serializable
enum class RingStrokeStyle {
    @SerialName("solid") SOLID,
    @SerialName("double") DOUBLE,
    @SerialName("dotted") DOTTED,
    @SerialName("dashed") DASHED,
    @SerialName("gradient") GRADIENT,

    /** Aucun trait de base : l'ornement dessine tout (#10936). */
    @SerialName("none") NONE,
}

@Serializable
data class AvatarRingStroke(
    val style: RingStrokeStyle,
    /** Fraction du diamètre. */
    val width: Double,
    val colors: List<String>,
) {
    companion object {
        /** `#RGB`, `#RRGGBB` ou `#RRGGBBAA`, dièse facultatif — rien d'autre ne se dessine. */
        fun isWellFormedHex(value: String): Boolean = FrameDecorField.isHex(value)
    }
}

@Serializable
data class AvatarRingOrnamentPath(
    val d: String,
    /** Index dans [AvatarRingStroke.colors]. */
    val color: Int,
    val opacity: Double,
    val width: Double? = null,
    /** Index dans [AvatarRingDesign.gradients] ; [color] reste le repli. */
    val gradient: Int? = null,
    /** Le groupe que les mouvements désignent. */
    val group: String? = null,
)

@Serializable
data class AvatarRingOrnament(
    val paths: List<AvatarRingOrnamentPath>,
)

@Serializable
data class AvatarRingDesign(
    val key: String,
    val stroke: AvatarRingStroke,
    val ornament: AvatarRingOrnament? = null,
    /** Couche animée facultative (D6, #10638), jouée au-dessus du contour ; illisible ⇒ ignorée. */
    @Serializable(with = LossyPackAssetRefSerializer::class)
    val lottie: PackAssetRef? = null,
    /** Les dégradés que les traits désignent par index ; un dégradé illisible garde sa place (`null`). */
    @Serializable(with = FrameGradientListSerializer::class)
    val gradients: List<FrameGradient?> = emptyList(),
    /** Les mouvements déclarés (#10932) ; un mouvement inconnu ou hors bornes est ignoré. */
    @Serializable(with = FrameMotionListSerializer::class)
    val motion: List<FrameMotion> = emptyList(),
) {
    init {
        require(FrameDecorField.isGroup(key)) { "clé illisible" }
        require(stroke.colors.size in 1..MAX_COLORS) { "un contour porte de 1 à 8 couleurs" }
        require(stroke.colors.all(AvatarRingStroke::isWellFormedHex)) { "une couleur n'est pas un hexadécimal" }
        require(stroke.width in STROKE_WIDTH_RANGE) { "épaisseur de contour hors bornes" }
        require(gradients.all { it == null || it.fitsPalette(stroke.colors.size) }) { "un dégradé désigne une couleur absente" }
        require(ornamentPaths.size <= MAX_ORNAMENT_PATHS) { "trop de traits d'ornement" }
        require(ornamentPaths.sumOf { it.d.length } <= AppearanceDesign.MAX_TOTAL_PATH_LENGTH) { "chemins trop longs" }
        require(ornamentPaths.all { drawable(it) }) { "un trait d'ornement n'est pas dessinable" }
    }

    val id: String get() = key

    /** Les traits d'ornement dans l'ordre de peinture ; vide pour un contour qui n'est qu'un trait. */
    val ornamentPaths: List<AvatarRingOrnamentPath> get() = ornament?.paths.orEmpty()

    /** Un trait désigne une couleur présente, un dégradé déclaré, un groupe lisible — sinon le contour ne se lit pas. */
    private fun drawable(path: AvatarRingOrnamentPath): Boolean =
        FrameDecorField.isPathData(path.d, AppearanceDesign.MAX_PATH_LENGTH) &&
            path.color in stroke.colors.indices &&
            path.opacity in 0.0..1.0 &&
            (path.width == null || (path.width > 0.0 && path.width <= AppearanceDesign.MAX_STROKE_WIDTH)) &&
            (path.gradient == null || path.gradient in gradients.indices) &&
            (path.group == null || FrameDecorField.isGroup(path.group))

    companion object {
        /** Le rayon du cercle de l'avatar dans le viewBox 0 0 100 100. */
        const val AVATAR_RADIUS = 42.0

        /** La palette d'un contour : huit couleurs au plus, comme un cadre de bannière (#10936, `RING_MAX_COLORS`). */
        const val MAX_COLORS = 8
        const val MAX_ORNAMENT_PATHS = 48
        val STROKE_WIDTH_RANGE: ClosedFloatingPointRange<Double> = 0.02..0.12
    }
}

/** Les contours lisibles d'un pack : un contour illisible tombe SEUL. */
object AvatarRingListSerializer : KSerializer<List<AvatarRingDesign>> by LossyListSerializer(AvatarRingDesign.serializer())

@Serializable
data class AvatarRingPack(
    override val slug: String,
    override val order: Int = 0,
    override val installedByDefault: Boolean = false,
    override val removable: Boolean = true,
    @Serializable(with = AvatarRingListSerializer::class)
    val rings: List<AvatarRingDesign> = emptyList(),
) : AppearancePack {
    val id: String get() = slug
}
