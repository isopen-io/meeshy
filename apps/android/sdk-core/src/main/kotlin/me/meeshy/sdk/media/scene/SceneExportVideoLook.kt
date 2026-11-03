package me.meeshy.sdk.media.scene

import androidx.media3.common.Effect
import me.meeshy.sdk.media.RetouchVideoEffects
import me.meeshy.sdk.media.RetouchVideoExporter
import me.meeshy.sdk.media.RetouchVideoLook
import me.meeshy.sdk.model.imageedit.NormalizedCrop

/**
 * **LE LOOK D'UNE VIDÉO RÉGLÉE, POSÉ PAR LA PASSE UNIQUE DE L'EXPORT** (#14875) : le cadrage ([crop], fraction de la source
 * debout), puis le filtre et le cadre ([look]) d'une vidéo du compositeur. Une vidéo de fond les reçoit en effets Media3, les
 * mêmes que la publication ([RetouchVideoEffects]), son cadre posé avec les objets ; une vidéo posée, lue image par image,
 * les peint sur chaque image ([PlacedVideoLookFrame]). La vidéo n'est jamais encodée une fois de plus avant le rendu.
 */
public class SceneExportVideoLook(public val crop: NormalizedCrop?, public val look: RetouchVideoLook) {

    /**
     * Le cadrage, le filtre et la pose dans la case, sans le cadre : des transformations que Media3 fond avec le cadrage au
     * format en une seule passe ; le cadre se pose avec les objets ([SceneLookFrameOverlay]). Construits une fois : chaque
     * tour d'une même vidéo porte la même liste, et la chaîne GL ne se refait pas entre eux.
     */
    internal val effects: List<Effect> by lazy {
        RetouchVideoEffects.of(crop?.let(RetouchVideoExporter::ndc), RetouchVideoLook(rgbMatrix = look.rgbMatrix, placement = look.placement))
    }

    /** Le filtre en matrice 4 × 5 d'Android (décalages sur 0…255) pour une image opaque ; `null` : neutre. */
    internal val colorMatrix: FloatArray? by lazy { look.rgbMatrix?.let(::androidMatrix) }

    private companion object {
        const val GPU_SIDE = 4
        const val ANDROID_ROW = 5
        const val COLOR_ROWS = 3
        const val CHANNEL = 255f

        /** La matrice du GPU (4 × 4 par colonnes, alpha d'une vidéo à 1) relue en matrice d'Android. */
        fun androidMatrix(gpu: FloatArray): FloatArray = FloatArray(GPU_SIDE * ANDROID_ROW) { index ->
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
