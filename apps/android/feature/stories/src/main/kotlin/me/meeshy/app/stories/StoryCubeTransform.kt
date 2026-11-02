package me.meeshy.app.stories

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sin

/**
 * Géométrie PURE de la carte du lecteur sous les glissés : face du cube qui change d'auteur
 * (iOS `StoryGroupCube`) et carte tirée vers le bas qui se ferme (iOS
 * `StoryViewerCardTransform`). Le Composable ne fait que lire ces valeurs en phase de
 * dessin (`graphicsLayer`) — aucune recomposition pendant le geste.
 *
 * La face est montée comme une page de cube : elle suit le doigt 1:1 et tourne autour de
 * l'arête qu'elle partage avec l'auteur voisin, de 90° par largeur parcourue.
 */
object StoryCubeTransform {
    /** 90° pile rend une projection singulière : à 89,5° la face est déjà de profil (iOS). */
    const val EDGE_DEGREES = 89.5f

    /** Recul de la caméra, en largeurs de carte (iOS `cameraDistanceInWidths`). */
    const val CAMERA_DISTANCE_IN_WIDTHS = 2.2f

    /** Une face qui se détourne de la lumière s'assombrit jusqu'à cette opacité de noir. */
    const val MAXIMUM_SHADE = 0.45f

    /** Course verticale, en dp, au bout de laquelle la carte tirée vers le bas a fini de se réduire. */
    const val DISMISS_TRAVEL_DP = 350f

    /** Rayon d'angle maximal, en dp, de la carte tirée vers le bas. */
    const val DISMISS_CORNER_DP = 36f

    /** Rayon d'angle, en dp, de la carte qui s'en va. */
    const val DISMISSING_CORNER_DP = 32f

    /**
     * La caméra d'un `graphicsLayer` se règle en pouces de la caméra Skia (72 unités par
     * pouce) : [CAMERA_DISTANCE_IN_WIDTHS] largeurs exprimées dans cette unité.
     */
    fun cameraDistance(width: Float): Float = CAMERA_DISTANCE_IN_WIDTHS * max(width, 1f) / SKIA_UNITS_PER_INCH

    /** Rotation de la face déplacée de [offsetX], bornée juste avant le profil. */
    fun faceDegrees(offsetX: Float, width: Float): Float =
        (offsetX / max(width, 1f) * 90f).coerceIn(-EDGE_DEGREES, EDGE_DEGREES)

    /**
     * Arête-charnière : celle qui touche l'auteur voisin. Doigt vers la gauche, la face
     * s'ouvre vers l'auteur SUIVANT et tourne autour de son arête droite (1) ; vers la
     * droite, autour de la gauche (0).
     */
    fun pivotFractionX(offsetX: Float): Float = if (offsetX < 0f) 1f else 0f

    /** Opacité du voile noir d'une face qui se détourne (iOS `maximumShade × |sin θ|`). */
    fun shade(offsetX: Float, width: Float): Float {
        val radians = Math.toRadians(faceDegrees(offsetX, width).toDouble())
        return MAXIMUM_SHADE * abs(sin(radians)).toFloat()
    }

    /** Avancement de la fermeture, 0 au repos, 1 après [DISMISS_TRAVEL_DP] tirés vers le bas. */
    fun dismissProgress(dragY: Float, travelPx: Float): Float =
        if (travelPx <= 0f) 0f else (dragY / travelPx).coerceIn(0f, 1f)

    /** Échelle de la carte tirée vers le bas : 1 au repos, 0,65 au bout de la course (iOS). */
    fun dismissScale(progress: Float): Float = 1f - progress * 0.35f

    /** Opacité de la carte tirée vers le bas : 1 au repos, 0,7 au bout de la course (iOS). */
    fun dismissAlpha(progress: Float): Float = 1f - progress * 0.3f

    private const val SKIA_UNITS_PER_INCH = 72f
}

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

/**
 * Fermeture par glissement bas, port de iOS `StoryVerticalGestureDecisions` hors plein
 * écran : au-delà du seuil, ou d'un flick dont la projection dépasse 2,5 seuils.
 */
object StoryVerticalSwipeDecision {
    fun dismisses(translationY: Float, predictedY: Float, threshold: Float): Boolean =
        translationY > threshold || predictedY > threshold * 2.5f

    fun crossesThreshold(translationY: Float, predictedY: Float, threshold: Float): Boolean =
        abs(translationY) > threshold || abs(predictedY) > threshold * 2.5f
}
