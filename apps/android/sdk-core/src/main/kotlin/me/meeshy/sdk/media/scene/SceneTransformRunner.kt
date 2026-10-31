package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import java.io.File
import me.meeshy.sdk.model.scene.export.StoryExportBrandingPlan
import me.meeshy.sdk.model.scene.export.StoryExportClipRange
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

/** Un calque des objets, posé sur la timeline commune de [startMillis] à [endMillis]. */
public sealed interface SceneExportOverlay {
    public val startMillis: Long
    public val endMillis: Long

    /** Déjà peint en mémoire : il appartient à l'appelant, qui le libère ([SceneExportJob.release]). */
    public class Painted(override val startMillis: Long, override val endMillis: Long, public val bitmap: Bitmap) : SceneExportOverlay

    /** Peint sur disque (PNG) : le moteur le décode à son instant et le libère après. */
    public class Stored(override val startMillis: Long, override val endMillis: Long, public val file: File) : SceneExportOverlay
}

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
)

/** Le moteur de rendu derrière [SceneExportCoordinator] : annulable, il rend la fraction rendue à mesure. */
public interface SceneTransformRunner {
    public suspend fun run(job: SceneExportJob, onProgress: (Float) -> Unit)
}
