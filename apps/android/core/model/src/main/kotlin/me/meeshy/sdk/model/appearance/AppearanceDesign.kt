package me.meeshy.sdk.model.appearance

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.pack.PackAssetRef

/*
 * AppearanceDesign (#10631, spec § 5.1) — MIROIR de
 * `packages/shared/types/appearance-design.ts` et de `AppearanceDesign.swift` : la
 * donnée vectorielle dont web, iOS et Android peignent le même dessin. Ce sont des
 * DONNÉES (hex, chemins, nombres) : aucun balisage reçu n'est jamais interprété ;
 * le client construit son dessin depuis ces champs. Sur divergence, le TypeScript
 * a raison.
 *
 * Fail-closed PAR modèle : un modèle hors bornes ne se construit pas, et la liste
 * qui le porte ([AppearanceDesignListSerializer]) le tait SEUL.
 */

/** Les rôles de couleur, résolus par la palette du modèle (clair/sombre). `accent-next` / `accent-prev` : l'accent tourné de ±30°. */
@Serializable
enum class AppearancePaintRole {
    @SerialName("ink") INK,
    @SerialName("accent") ACCENT,
    @SerialName("accent-next") ACCENT_NEXT,
    @SerialName("accent-prev") ACCENT_PREV,
    @SerialName("soft") SOFT,
    @SerialName("base") BASE,
}

private const val MAX_TILE_SIDE = 512.0
private const val MAX_TILE_PATHS = 24
private const val MAX_SCENE_SIDE = 1000.0
private const val MAX_SCENE_PATHS = 48
private const val DEFAULT_SCENE_SIDE = 100.0
private const val MAX_GRADIENT_BLOBS = 5

@Serializable
data class AppearanceDesignPalette(
    val base: String,
    val ink: String,
    val soft: String,
    /** Absent ⇒ l'accent EFFECTIF du lecteur. */
    val accent: String? = null,
) {
    init {
        require(listOfNotNull(base, ink, soft, accent).all(FrameDecorField::isHex)) { "une couleur n'est pas un hexadécimal" }
    }
}

@Serializable
data class AppearanceDesignPalettes(
    val light: AppearanceDesignPalette,
    val dark: AppearanceDesignPalette,
)

@Serializable
data class AppearanceDesignStroke(
    val d: String,
    val role: AppearancePaintRole,
    val opacity: Double,
    /** `> 0` ⇒ trait de cette épaisseur ; absent ⇒ remplissage. */
    val width: Double? = null,
) {
    init {
        require(FrameDecorField.isPathData(d, AppearanceDesign.MAX_PATH_LENGTH)) { "chemin illisible" }
        require(opacity in 0.0..1.0) { "opacité hors bornes" }
        require(width == null || (width > 0.0 && width <= AppearanceDesign.MAX_STROKE_WIDTH)) { "épaisseur hors bornes" }
    }
}

@Serializable
data class AppearanceDesignTile(
    val width: Double,
    val height: Double,
    val scale: Double,
    val rotation: Double,
    val paths: List<AppearanceDesignStroke>,
) {
    init {
        require(width > 0.0 && width <= MAX_TILE_SIDE && height > 0.0 && height <= MAX_TILE_SIDE) { "tuile hors bornes" }
        require(scale in 0.5..3.0 && rotation in -45.0..45.0) { "tuile hors bornes" }
        require(paths.size in 1..MAX_TILE_PATHS) { "tuile hors bornes" }
    }
}

@Serializable
enum class AppearanceSceneAnchor {
    @SerialName("bottom") BOTTOM,
    @SerialName("center") CENTER,
    @SerialName("bottom-end") BOTTOM_END,
}

@Serializable
data class AppearanceDesignScene(
    val viewBox: List<Double>,
    val anchor: AppearanceSceneAnchor,
    val paths: List<AppearanceDesignStroke>,
) {
    init {
        require(viewBox.size == 4 && viewBox[0] == 0.0 && viewBox[1] == 0.0) { "scène hors bornes" }
        require(viewBox[2] > 0.0 && viewBox[2] <= MAX_SCENE_SIDE && viewBox[3] > 0.0 && viewBox[3] <= MAX_SCENE_SIDE) { "scène hors bornes" }
        require(paths.size in 1..MAX_SCENE_PATHS) { "scène hors bornes" }
    }

    val width: Double get() = if (viewBox.size == 4) viewBox[2] else DEFAULT_SCENE_SIDE
    val height: Double get() = if (viewBox.size == 4) viewBox[3] else DEFAULT_SCENE_SIDE
}

@Serializable
data class AppearanceDesignGradientStop(
    val role: AppearancePaintRole,
    val at: Double,
)

@Serializable
data class AppearanceDesignBlob(
    val x: Double,
    val y: Double,
    val r: Double,
    val role: AppearancePaintRole,
    val opacity: Double,
)

@Serializable
data class AppearanceDesignGradient(
    val angle: Double,
    val stops: List<AppearanceDesignGradientStop>,
    val blobs: List<AppearanceDesignBlob> = emptyList(),
) {
    init {
        require(angle in 0.0..360.0 && stops.size in 2..4 && blobs.size <= MAX_GRADIENT_BLOBS) { "dégradé hors bornes" }
        require(stops.all { it.at in 0.0..1.0 }) { "dégradé hors bornes" }
        require(blobs.all { it.x in 0.0..1.0 && it.y in 0.0..1.0 && it.r > 0.0 && it.r <= 2.0 && it.opacity in 0.0..1.0 }) {
            "dégradé hors bornes"
        }
    }
}

@Serializable
enum class AppearanceDesignStyle {
    @SerialName("pattern") PATTERN,
    @SerialName("illustration") ILLUSTRATION,
    @SerialName("gradient") GRADIENT,
}

@Serializable
data class AppearanceDesign(
    val key: String,
    val style: AppearanceDesignStyle,
    val palettes: AppearanceDesignPalettes,
    val tile: AppearanceDesignTile? = null,
    val scene: AppearanceDesignScene? = null,
    val gradient: AppearanceDesignGradient? = null,
    /**
     * Couche animée facultative (D6, #10638) : un fichier de pack que le moteur Lottie joue AU-DESSUS du dessin.
     * Illisible ⇒ ignorée : le dessin vectoriel reste la vérité, l'animation n'est qu'un plus.
     */
    @Serializable(with = LossyPackAssetRefSerializer::class)
    val lottie: PackAssetRef? = null,
) {
    init {
        require(FrameDecorField.isGroup(key)) { "clé illisible" }
        require(shapeMatchesStyle()) { "le bloc de forme ne correspond pas au style" }
        require(strokes().sumOf { it.d.length } <= MAX_TOTAL_PATH_LENGTH) { "chemins trop longs" }
    }

    val id: String get() = key

    val light: AppearanceDesignPalette get() = palettes.light
    val dark: AppearanceDesignPalette get() = palettes.dark

    fun palette(scheme: AppearanceScheme): AppearanceDesignPalette =
        if (scheme == AppearanceScheme.DARK) dark else light

    /** Exactement UN bloc de forme, celui du style. */
    private fun shapeMatchesStyle(): Boolean = when (style) {
        AppearanceDesignStyle.PATTERN -> tile != null && scene == null && gradient == null
        AppearanceDesignStyle.ILLUSTRATION -> scene != null && tile == null && gradient == null
        AppearanceDesignStyle.GRADIENT -> gradient != null && tile == null && scene == null
    }

    private fun strokes(): List<AppearanceDesignStroke> = tile?.paths.orEmpty() + scene?.paths.orEmpty()

    companion object {
        const val MAX_PATH_LENGTH = 4000
        const val MAX_TOTAL_PATH_LENGTH = 24_000
        const val MAX_STROKE_WIDTH = 40.0
    }
}

/** Les modèles lisibles d'un pack : un modèle illisible (champ d'une passerelle plus récente) tombe SEUL. */
object AppearanceDesignListSerializer : KSerializer<List<AppearanceDesign>> by LossyListSerializer(AppearanceDesign.serializer())

/** Ce que tout pack du catalogue déclare, quel que soit son domaine. */
interface AppearancePack {
    val slug: String
    val order: Int
    val installedByDefault: Boolean
    val removable: Boolean
}

/** Un pack de fonds ou de bannières : ses modèles illisibles tombent un par un. */
@Serializable
data class AppearanceDesignPack(
    override val slug: String,
    override val order: Int = 0,
    override val installedByDefault: Boolean = false,
    override val removable: Boolean = true,
    @Serializable(with = AppearanceDesignListSerializer::class)
    val designs: List<AppearanceDesign> = emptyList(),
) : AppearancePack {
    val id: String get() = slug
}
