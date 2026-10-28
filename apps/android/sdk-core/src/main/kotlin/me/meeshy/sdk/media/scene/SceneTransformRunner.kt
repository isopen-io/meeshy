package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import java.io.File
import me.meeshy.sdk.model.composer.scene.SceneExportRecipe

/**
 * Tout ce que le moteur reçoit pour baker UNE scène : la recette (lois pures), les fichiers déjà résolus, et le calque
 * des objets peint à la taille de la vidéo (1080x1920). [overlay] appartient à l'appelant, qui le libère.
 */
public class SceneExportJob(
    public val recipe: SceneExportRecipe,
    /** Le fond : la vidéo à lire, ou le fixe (fond, couleur, image, déjà composés) peint une fois. */
    public val backgroundFile: File?,
    public val overlay: Bitmap?,
    /** Les fichiers audio, par identifiant de son de la recette. */
    public val soundFiles: Map<String, File>,
    public val output: File,
    /** Libère ce que le job tient (le calque peint) : appelé une fois le moteur arrêté, réussi, échoué ou annulé. */
    public val release: () -> Unit = {},
)

/** Le moteur de rendu derrière [SceneExportCoordinator] : annulable, il rend la fraction bakée à mesure. */
public interface SceneTransformRunner {
    public suspend fun run(job: SceneExportJob, onProgress: (Float) -> Unit)
}
