package me.meeshy.sdk.model.appearance

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.pack.PackAssetRef

/*
 * BannerFrameDesign (#10932) — MIROIR de `packages/shared/types/banner-frame-design.ts`
 * et de `BannerFrameDesign.swift` : un CADRE de bannière, posé SUR la photo de
 * bannière (ou, sans photo, sur le fond), le CENTRE restant TRANSPARENT. Il ne
 * remplace jamais la photo. Gabarit 0 0 300 100 : la bordure et ses filets se
 * tracent à la largeur réelle, les pièces restent fixes (ancrées à gauche, à droite
 * ou au centre), les frises répètent leur module.
 *
 * Le centre transparent est une LOI ([BannerFrameDesign.drawableRegion]) : le rendu
 * découpe tout ce que le cadre dessine au pourtour de `border.width` (≤ 9,6), plus
 * les quatre coins et le cartouche central, qui n'entrent pas au-delà de 20.
 * Fail-closed sur le dessin (couleurs, bornes) ; tolérant sur ce qui l'anime.
 * Sur divergence, le TypeScript a raison.
 */

@Serializable
enum class BannerFrameAnchor {
    @SerialName("start") START,
    @SerialName("center") CENTER,
    @SerialName("end") END,
}

@Serializable
enum class BannerFrameFit {
    /** Des modules entiers. */
    @SerialName("repeat") REPEAT,

    /** Le module recalculé pour tomber juste entre les marges. */
    @SerialName("justify") JUSTIFY,
}

@Serializable
enum class BannerFrameFillRule {
    @SerialName("nonzero") NONZERO,
    @SerialName("evenodd") EVENODD,
}

@Serializable
enum class CartoucheEdge {
    @SerialName("top") TOP,
    @SerialName("bottom") BOTTOM,
    @SerialName("both") BOTH,
}

@Serializable
data class BannerFramePath(
    val d: String,
    /** Index dans [BannerFrameDesign.palette]. */
    val color: Int,
    /** Index dans [BannerFrameDesign.gradients] ; [color] reste le repli. */
    val gradient: Int? = null,
    val opacity: Double,
    /** `> 0` ⇒ trait ; absent ⇒ remplissage. */
    val width: Double? = null,
    val fillRule: BannerFrameFillRule? = null,
    val group: String? = null,
)

@Serializable
data class BannerFrameFilet(
    val inset: Double,
    val width: Double,
    val color: Int,
    val gradient: Int? = null,
    val opacity: Double,
)

@Serializable
data class BannerFrameBorder(
    val width: Double,
    val color: Int,
    val gradient: Int? = null,
    val opacity: Double,
    val filets: List<BannerFrameFilet> = emptyList(),
)

@Serializable
data class BannerFrameCartouche(
    val width: Double,
    val depth: Double,
    val edge: CartoucheEdge,
)

@Serializable
data class BannerFrameReach(
    /** Le côté des quatre carrés de coin. */
    val corner: Double,
    val cartouche: BannerFrameCartouche? = null,
)

@Serializable
data class BannerFramePiece(
    val anchor: BannerFrameAnchor,
    val paths: List<BannerFramePath>,
)

@Serializable
data class BannerFrameFrieze(
    val module: Double,
    val from: Double,
    val to: Double,
    val fit: BannerFrameFit,
    val paths: List<BannerFramePath>,
)

data class FrameRect(
    val x: Double,
    val y: Double,
    val width: Double,
    val height: Double,
)

/** Ce que le rendu peint : `outer` privé de `hole`, plus `reserved` (coins, puis cartouche). */
data class BannerFrameDrawableRegion(
    val outer: FrameRect,
    val hole: FrameRect,
    val reserved: List<FrameRect>,
)

@Serializable
data class BannerFrameDesign(
    val key: String,
    val viewBox: List<Double>,
    val palette: List<String>,
    @Serializable(with = FrameGradientListSerializer::class)
    val gradients: List<FrameGradient?> = emptyList(),
    val border: BannerFrameBorder,
    val reach: BannerFrameReach,
    val pieces: List<BannerFramePiece> = emptyList(),
    val friezes: List<BannerFrameFrieze> = emptyList(),
    @Serializable(with = FrameMotionListSerializer::class)
    val motion: List<FrameMotion> = emptyList(),
    @Serializable(with = LossyPackAssetRefSerializer::class)
    val lottie: PackAssetRef? = null,
) {
    init {
        require(viewBox == listOf(0.0, 0.0, REFERENCE_WIDTH, HEIGHT)) { "un cadre de bannière se dessine en 0 0 300 100" }
        require(palette.size in 1..MAX_COLORS && palette.all(AvatarRingStroke::isWellFormedHex)) { "palette illisible" }
        require(FrameDecorField.isGroup(key)) { "clé illisible" }
        require(keepsTheCenterClear()) { "le cadre mord sur le centre transparent" }
        require(piecesAndFriezesAreBounded() && pathsAreDrawable() && paintsFitThePalette()) {
            "pièces, frises ou chemins hors bornes"
        }
    }

    val id: String get() = key

    private fun allPaths(): List<BannerFramePath> = pieces.flatMap { it.paths } + friezes.flatMap { it.paths }

    /** Les bornes du TypeScript : une frise de module nul ferait boucler le rendu. */
    private fun piecesAndFriezesAreBounded(): Boolean =
        pieces.size <= MAX_PIECES && friezes.size <= MAX_FRIEZES &&
            pieces.all { it.paths.isNotEmpty() } &&
            friezes.all { frieze ->
                val half = REFERENCE_WIDTH / 2
                frieze.paths.isNotEmpty() && frieze.module > 0.0 && frieze.module <= MAX_MODULE &&
                    frieze.from in 0.0..half && frieze.to in 0.0..half &&
                    frieze.from + frieze.module + frieze.to <= REFERENCE_WIDTH
            }

    private fun pathsAreDrawable(): Boolean {
        val paths = allPaths()
        return paths.size <= MAX_PATHS &&
            paths.sumOf { it.d.length } <= AppearanceDesign.MAX_TOTAL_PATH_LENGTH &&
            paths.all { path ->
                FrameDecorField.isPathData(path.d, AppearanceDesign.MAX_PATH_LENGTH) && path.opacity in 0.0..1.0 &&
                    (path.width == null || (path.width > 0.0 && path.width <= AppearanceDesign.MAX_STROKE_WIDTH)) &&
                    (path.group == null || FrameDecorField.isGroup(path.group))
            } &&
            border.opacity in 0.0..1.0 &&
            border.filets.all { it.opacity in 0.0..1.0 }
    }

    private fun keepsTheCenterClear(): Boolean {
        val cartoucheFits = reach.cartouche?.let {
            it.width > 0.0 && it.width <= MAX_CARTOUCHE_WIDTH && it.depth > 0.0 && it.depth <= MAX_REACH
        } ?: true
        return border.width > 0.0 && border.width <= MAX_BORDER_WIDTH &&
            reach.corner in 0.0..MAX_REACH &&
            cartoucheFits &&
            border.filets.size <= MAX_FILETS &&
            border.filets.all { it.inset >= 0.0 && it.inset <= border.width && it.width > 0.0 && it.width <= MAX_FILET_WIDTH }
    }

    /**
     * Une couleur désignée hors palette ferait planter le dessin ; un dégradé DÉCLARÉ mais illisible
     * (`null`) retombe sur la couleur, un dégradé jamais déclaré est refusé comme au TypeScript.
     */
    private fun paintsFitThePalette(): Boolean {
        val paints = listOf(border.color to border.gradient) +
            border.filets.map { it.color to it.gradient } +
            allPaths().map { it.color to it.gradient }
        val gradientsFit = gradients.all { it == null || it.fitsPalette(palette.size) }
        return gradientsFit && paints.all { (color, gradient) ->
            color in palette.indices && (gradient == null || gradient in gradients.indices)
        }
    }

    /** La région où le cadre peint, à une largeur LOGIQUE (`largeur × 100 / hauteur`, 300 au gabarit). */
    fun drawableRegion(width: Double): BannerFrameDrawableRegion {
        val corner = reach.corner
        val corners = listOf(
            FrameRect(x = 0.0, y = 0.0, width = corner, height = corner),
            FrameRect(x = width - corner, y = 0.0, width = corner, height = corner),
            FrameRect(x = 0.0, y = HEIGHT - corner, width = corner, height = corner),
            FrameRect(x = width - corner, y = HEIGHT - corner, width = corner, height = corner),
        )
        val cartouches = reach.cartouche?.let { cartouche ->
            val x = (width - cartouche.width) / 2
            val top = FrameRect(x = x, y = 0.0, width = cartouche.width, height = cartouche.depth)
            val bottom = FrameRect(x = x, y = HEIGHT - cartouche.depth, width = cartouche.width, height = cartouche.depth)
            when (cartouche.edge) {
                CartoucheEdge.TOP -> listOf(top)
                CartoucheEdge.BOTTOM -> listOf(bottom)
                CartoucheEdge.BOTH -> listOf(top, bottom)
            }
        }.orEmpty()
        return BannerFrameDrawableRegion(
            outer = FrameRect(x = 0.0, y = 0.0, width = width, height = HEIGHT),
            hole = FrameRect(
                x = border.width,
                y = border.width,
                width = width - 2 * border.width,
                height = HEIGHT - 2 * border.width,
            ),
            reserved = corners + cartouches,
        )
    }

    companion object {
        const val REFERENCE_WIDTH = 300.0
        const val HEIGHT = 100.0
        const val MAX_BORDER_WIDTH = 9.6
        const val MAX_REACH = 20.0
        const val MAX_CARTOUCHE_WIDTH = 80.0
        const val MAX_COLORS = 8
        const val MAX_PATHS = 48
        const val MAX_PIECES = 16
        const val MAX_FRIEZES = 8
        const val MAX_FILETS = 6
        const val MAX_MODULE = 60.0
        private const val MAX_FILET_WIDTH = 2.0
    }
}

/** Les cadres lisibles d'un pack : un cadre illisible tombe SEUL. */
object BannerFrameListSerializer : KSerializer<List<BannerFrameDesign>> by LossyListSerializer(BannerFrameDesign.serializer())

/** Un pack `banner-frame` du catalogue embarqué : ses cadres illisibles tombent un par un. */
@Serializable
data class BannerFramePack(
    override val slug: String,
    override val order: Int = 0,
    override val installedByDefault: Boolean = false,
    override val removable: Boolean = true,
    @Serializable(with = BannerFrameListSerializer::class)
    val frames: List<BannerFrameDesign> = emptyList(),
) : AppearancePack {
    val id: String get() = slug
}
