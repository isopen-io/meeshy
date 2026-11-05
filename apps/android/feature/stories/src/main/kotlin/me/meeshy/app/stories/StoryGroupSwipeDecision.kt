package me.meeshy.app.stories

import kotlin.math.abs
import kotlin.math.max

/** Ce que décide le relâchement d'un glissé horizontal. */
enum class StoryGroupSwipeOutcome { Next, Previous, Cancel }

/**
 * La loi du relâchement d'un glissé de groupe, port de iOS `StoryGroupSwipeDecision` :
 * progressif et annulable jusqu'au bout. Le geste valide quand la course PROJETÉE par
 * l'inertie atteint la moitié de la largeur ; le doigt qui repart vers l'origine annule, à
 * n'importe quel point de la course.
 */
object StoryGroupSwipeDecision {
    const val COMMIT_FRACTION = 0.5f

    /** Un tremblement du doigt au relâchement n'est pas un retour en arrière. */
    const val REVERSAL_TOLERANCE = 0.04f

    /** Sans voisin, la carte ne se laisse tirer qu'asymptotiquement vers cette part de la largeur. */
    const val EDGE_RESISTANCE_IN_WIDTHS = 0.22f

    /** Horizon de la projection inertielle : course finale ≈ course + vitesse × horizon. */
    const val PROJECTION_SECONDS = 0.25f

    fun predictedEnd(translation: Float, velocity: Float): Float = translation + velocity * PROJECTION_SECONDS

    fun decide(
        translation: Float,
        predictedEnd: Float,
        width: Float,
        hasNext: Boolean,
        hasPrevious: Boolean,
    ): StoryGroupSwipeOutcome {
        val safeWidth = max(width, 1f)
        val progress = -translation / safeWidth
        val projected = -predictedEnd / safeWidth
        val direction = if (progress != 0f) progress else projected
        if (direction == 0f) return StoryGroupSwipeOutcome.Cancel
        val forward = direction > 0f
        val reach = if (forward) projected else -projected
        val momentum = if (forward) projected - progress else progress - projected
        if (reach < COMMIT_FRACTION || momentum < -REVERSAL_TOLERANCE) return StoryGroupSwipeOutcome.Cancel
        return when {
            forward && hasNext -> StoryGroupSwipeOutcome.Next
            !forward && hasPrevious -> StoryGroupSwipeOutcome.Previous
            else -> StoryGroupSwipeOutcome.Cancel
        }
    }

    /**
     * Sans auteur dans le sens du geste, la carte résiste comme un défilement en butée :
     * elle dit qu'il n'y a rien derrière, sans tourner sur du noir.
     */
    fun displayedTranslation(translation: Float, width: Float, hasNeighbor: Boolean): Float {
        if (hasNeighbor) return translation
        val limit = max(width, 1f) * EDGE_RESISTANCE_IN_WIDTHS
        val resisted = (1f - 1f / (abs(translation) / limit * 0.55f + 1f)) * limit
        return if (translation < 0f) -resisted else resisted
    }
}
