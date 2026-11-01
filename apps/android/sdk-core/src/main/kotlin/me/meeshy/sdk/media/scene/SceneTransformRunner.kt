package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import java.io.File
import me.meeshy.sdk.model.scene.export.StoryExportBrandingPlan
import me.meeshy.sdk.model.scene.export.StoryExportClipRange
import me.meeshy.sdk.model.scene.export.StoryExportPlacedVideoClock
import me.meeshy.sdk.model.scene.export.StoryExportTimelinePlan
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat

/**
 * Ce qui remplit l'image d'une slide sous ses objets : une vidéo de fond lue en tours ([laps]) — une vidéo qui ne boucle pas
 * se lit une fois puis tient son image ([hold]) jusqu'à la fin de la slide —, ou une image fixe.
 */
public sealed interface SceneExportSlideFill {
    public data class Video(val file: File, val laps: List<StoryExportClipRange>, val hold: SceneExportHold? = null) : SceneExportSlideFill

    public data class Picture(val file: File) : SceneExportSlideFill
}

/** Une image tenue [millis] : la dernière image d'une vidéo de fond qui ne boucle pas. */
public data class SceneExportHold(val file: File, val millis: Long)

/**
 * Un calque des objets, posé sur la timeline commune de [startMillis] à [endMillis]. [depth] : sa place parmi les vidéos
 * posées de sa slide (#13897) — 0 sous la première (le fond peint et les objets d'en dessous), `n` au-dessus de la n-ième.
 * Une slide sans vidéo posée n'a que des calques de profondeur 0.
 */
public sealed interface SceneExportOverlay {
    public val startMillis: Long
    public val endMillis: Long
    public val depth: Int

    /** Déjà peint en mémoire : il appartient à l'appelant, qui le libère ([SceneExportJob.release]). */
    public class Painted(
        override val startMillis: Long,
        override val endMillis: Long,
        public val bitmap: Bitmap,
        override val depth: Int = 0,
    ) : SceneExportOverlay

    /** Peint sur disque (PNG) : le moteur le décode à son instant et le libère après. */
    public class Stored(
        override val startMillis: Long,
        override val endMillis: Long,
        public val file: File,
        override val depth: Int = 0,
    ) : SceneExportOverlay
}

/**
 * Où une vidéo posée se peint à un instant, en pixels du format : son centre, la taille de son cadre (la source le remplit
 * par recadrage centré), sa rotation autour du centre, son opacité (fondus et images clés compris) et l'arrondi du cadre.
 */
public data class SceneExportPlacement(
    val centerX: Float,
    val centerY: Float,
    val width: Float,
    val height: Float,
    val rotationDegrees: Float = 0f,
    val opacity: Float = 1f,
    val cornerRadius: Float = 0f,
)

/**
 * **Une vidéo POSÉE sur la scène** (#13897), rendue vivante dans son cadre : son fichier rapatrié, son horloge sur la
 * timeline commune ([clock] : présence, fenêtre coupée, boucle), sa place dans la pile ([depth] : au-dessus des calques
 * de même profondeur, sous ceux de profondeur supérieure), son look ([colorMatrix], matrice 4×5 d'Android ; `null` :
 * neutre) et sa pose à chaque instant de la composition ([placementAt] ; `null` : invisible à cet instant).
 */
public class SceneExportPlacedVideo(
    public val file: File,
    public val clock: StoryExportPlacedVideoClock,
    public val depth: Int,
    public val colorMatrix: FloatArray? = null,
    public val placementAt: (Long) -> SceneExportPlacement?,
)

/** Un fichier son rapatrié, et sa durée sondée (`null` : non sondée — il se lit alors une fois, sans boucle). */
public data class SceneExportSoundFile(val file: File, val durationMillis: Long?)

/**
 * **L'emballage de marque d'un export de story** (#13509 ; miroir de `StoryExportBranding.Plan` iOS) : l'intro d'identité en tête
 * ([introCard] pleine puis fondue sur la story), la carte de fin qui recouvre la fin de la story ([outroCard], puis [authorCard]
 * posée dessus quand l'auteur ferme la vidéo), et les deux signatures sonores en WAV. Les cartes sont des images à la taille
 * du format ; le minutage vient du [plan], les cartes ne portent aucune horloge.
 */
public class SceneExportBranding(
    public val plan: StoryExportBrandingPlan,
    public val introCard: File?,
    public val outroCard: File,
    public val authorCard: File?,
    public val introJingle: File?,
    public val introJingleMillis: Long,
    public val outroJingle: File,
    public val outroJingleMillis: Long,
)

/**
 * Tout ce que le moteur reçoit pour rendre un export : le plan (lois pures — slides, sons), le format de la vidéo, ce qui
 * remplit chaque slide (dans l'ordre des slides du plan), les calques des objets, et les fichiers des sons par adresse.
 */
public class SceneExportJob(
    public val plan: StoryExportTimelinePlan,
    public val format: StoryExportVideoFormat,
    public val fills: List<SceneExportSlideFill>,
    public val overlays: List<SceneExportOverlay>,
    public val sounds: Map<String, SceneExportSoundFile>,
    public val output: File,
    /** Libère ce que le job tient (les calques peints) : appelé une fois le moteur arrêté, réussi, échoué ou annulé. */
    public val release: () -> Unit = {},
    /** Une scène fixe et muette : son image, déjà peinte avec son fond, remise telle quelle — aucun rendu vidéo. */
    public val still: File? = null,
    /** L'intro, la carte de fin et les jingles ; `null` : la story seule (une scène de post rend l'œuvre sans marque). */
    public val branding: SceneExportBranding? = null,
    /** Les vidéos posées sur les scènes, vivantes dans leur cadre (#13897) ; leurs sons sont dans le plan. */
    public val placedVideos: List<SceneExportPlacedVideo> = emptyList(),
)

/** Le moteur de rendu derrière [SceneExportCoordinator] : annulable, il rend la fraction rendue à mesure. */
public interface SceneTransformRunner {
    public suspend fun run(job: SceneExportJob, onProgress: (Float) -> Unit)
}
