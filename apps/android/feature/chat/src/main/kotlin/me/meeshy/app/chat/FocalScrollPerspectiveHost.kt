package me.meeshy.app.chat

import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import me.meeshy.sdk.model.reading.focal.FocalScrollPerspective

/**
 * La perspective du fil, côté Compose : la loi ([FocalScrollPerspective.poses]) rend une pose par
 * cellule (échelle et opacité décroissantes avec la distance à la ligne de focus, rangées compactées
 * par tirage cumulatif sans interstice, pivot 0,16) ; la peau l'applique en `graphicsLayer` seule,
 * sans hauteur ni police (zéro relayout). Désactivée en réduction de mouvement (pose identité).
 *
 * Comme sur iOS (directive 2026-08-24, `syncFocalOverscan`), la compaction des VOISINES est écrite
 * et testée mais n'est PAS appliquée : seul l'élu se distingue. [APPLIES_TO_NEIGHBORS] est la
 * couture qui la rebranche, en un seul endroit, le jour où iOS la rejoue.
 */
internal object FocalScrollPerspectiveHost {

    const val APPLIES_TO_NEIGHBORS: Boolean = false

    /** Une pose par identifiant de cellule ; vide quand la scène n'a rien à compacter. */
    fun poses(frame: FocalFrame): Map<String, FocalScrollPerspective.CellPose> =
        FocalScrollPerspective.poses(frame.cells, frame.focusY, frame.reduceMotion).associateBy { it.id }

    /** La pose qu'une cellule reçoit réellement : identité tant que la couture est fermée. */
    fun appliedPose(poses: Map<String, FocalScrollPerspective.CellPose>, id: String): FocalScrollPerspective.CellPose? =
        if (APPLIES_TO_NEIGHBORS) poses[id] else null
}

/** Applique une pose de cellule : échelle, opacité et tirage vers la ligne, autour du pivot du fil. */
internal fun Modifier.focalCellPose(pose: () -> FocalScrollPerspective.CellPose?): Modifier =
    graphicsLayer {
        val current = pose() ?: return@graphicsLayer
        transformOrigin = TransformOrigin(
            pivotFractionX = FocalScrollPerspective.VISUAL_PIVOT_X.toFloat(),
            pivotFractionY = (1.0 - current.anchorY).toFloat(),
        )
        scaleX = current.scale.toFloat()
        scaleY = current.scale.toFloat()
        alpha = current.alpha.toFloat()
        translationY = current.pull.toFloat() * density
    }
