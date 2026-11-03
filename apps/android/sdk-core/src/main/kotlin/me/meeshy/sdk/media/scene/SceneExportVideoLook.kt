package me.meeshy.sdk.media.scene

import android.graphics.ColorMatrixColorFilter
import androidx.media3.common.Effect
import androidx.media3.effect.RgbMatrix
import me.meeshy.sdk.media.RetouchVideoEffects
import me.meeshy.sdk.media.RetouchVideoExporter
import me.meeshy.sdk.media.RetouchVideoLook
import me.meeshy.sdk.model.composer.look.ComposerVideoLook
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import me.meeshy.sdk.model.scene.StoryColorMatrix

/**
 * **LE LOOK D'UNE VIDÉO RÉGLÉE, POSÉ PAR LA PASSE UNIQUE DE L'EXPORT** (#14875) : le cadrage ([crop], fraction de la source
 * debout), puis le filtre et le cadre ([look]) d'une vidéo du compositeur. Une vidéo de fond les reçoit en effets Media3, les
 * mêmes que la publication ([RetouchVideoEffects]), son cadre posé avec les objets ; une vidéo posée, lue image par image,
 * les peint sur chaque image ([PlacedVideoLookFrame]). La vidéo n'est jamais encodée une fois de plus avant le rendu.
 *
 * [scene] : le look de la DIAPO (son filtre puis les réglages du fond, #15224), que l'aperçu peint sur tout le fond — la vidéo
 * réglée ET son cadre. Il se pose dans la même passe, après le look propre de la vidéo, et sur son cadre ; une vidéo de fond
 * nue sous un filtre de diapo n'a que lui ([ofScene]).
 */
public class SceneExportVideoLook(
    public val crop: NormalizedCrop?,
    public val look: RetouchVideoLook,
    public val scene: StoryColorMatrix? = null,
) {

    /** Ce look, sous le look [scene] de sa diapo. */
    public fun underScene(scene: StoryColorMatrix): SceneExportVideoLook = SceneExportVideoLook(crop, look, scene)

    /**
     * Le cadrage, le filtre et la pose dans la case, sans le cadre : des transformations que Media3 fond avec le cadrage au
     * format en une seule passe ; le cadre se pose avec les objets ([SceneLookFrameOverlay]). Construits une fois : chaque
     * tour d'une même vidéo porte la même liste, et la chaîne GL ne se refait pas entre eux.
     */
    internal val effects: List<Effect> by lazy {
        RetouchVideoEffects.of(crop?.let(RetouchVideoExporter::ndc), RetouchVideoLook(rgbMatrix = look.rgbMatrix, placement = look.placement)) +
            listOfNotNull(scene?.let(ComposerVideoLook::rgbMatrix)?.let { gpu -> RgbMatrix { _, _ -> gpu } })
    }

    /** Le look de la diapo en matrice 4 × 5 d'Android (décalages sur 0…255) ; `null` : aucun. */
    internal val sceneColorMatrix: FloatArray? by lazy { scene?.values?.toFloatArray() }

    /** Le look de la diapo en filtre de peinture, pour le cadre que la vidéo porte ([SceneLookFrameOverlay]) ; `null` : aucun. */
    internal val sceneFilter: ColorMatrixColorFilter? by lazy { sceneColorMatrix?.let(::ColorMatrixColorFilter) }

    /** Le filtre en matrice 4 × 5 d'Android (décalages sur 0…255) pour une image opaque ; `null` : neutre. */
    internal val colorMatrix: FloatArray? by lazy { look.rgbMatrix?.let(::androidMatrix) }

    public companion object {
        /** Une vidéo de fond sans look propre, sous le look [scene] de sa diapo. */
        public fun ofScene(scene: StoryColorMatrix): SceneExportVideoLook = SceneExportVideoLook(null, RetouchVideoLook.NONE, scene)

        private const val GPU_SIDE = 4
        private const val ANDROID_ROW = 5
        private const val COLOR_ROWS = 3
        private const val CHANNEL = 255f

        /** La matrice du GPU (4 × 4 par colonnes, alpha d'une vidéo à 1) relue en matrice d'Android. */
        private fun androidMatrix(gpu: FloatArray): FloatArray = FloatArray(GPU_SIDE * ANDROID_ROW) { index ->
            val row = index / ANDROID_ROW
            val column = index % ANDROID_ROW
            when {
                row == COLOR_ROWS -> if (column == COLOR_ROWS) 1f else 0f
                column < COLOR_ROWS -> gpu[column * GPU_SIDE + row]
                column == COLOR_ROWS -> 0f
                else -> gpu[COLOR_ROWS * GPU_SIDE + row] * CHANNEL
            }
        }
    }
}
