package me.meeshy.app.stories

/** Ce que décide le relâchement d'un glissé vertical — iOS `StoryVerticalGestureAction`. */
internal enum class StoryVerticalGestureAction {
    /** Sous le seuil : la carte revient à sa position. */
    Cancel,

    /** Glissé haut hors plein écran : la session passe en plein écran. */
    EnterFullscreen,

    /** Glissé bas en plein écran : retour au mode fenêtré, sans quitter la story. */
    ExitFullscreen,

    /** Glissé bas en mode fenêtré : la story se ferme. */
    DismissViewer,

    /** Rien à faire (glissé haut alors qu'on est déjà en plein écran). */
    None,

    /** Une surface du lecteur est ouverte : le geste lui revient, elle se ferme et rien d'autre ne se produit. */
    DismissActiveFeature,
}

/**
 * Le sort d'un glissé vertical selon le plein écran — iOS `StoryVerticalGestureDecisions`. Le glissé bas porte deux
 * sens ; « sortir du plein écran » prime sur « quitter la story », sinon on ne reviendrait jamais au mode fenêtré au
 * doigt. Une surface ouverte CONSOMME tout glissé qui franchit le seuil, dans les deux sens : la story survit.
 */
internal object StoryVerticalGestureDecisions {
    /** Distance de validation, en dp. */
    const val THRESHOLD_DP: Float = 120f

    /** Un flick court mais rapide valide quand sa course projetée atteint ce multiple du seuil. */
    const val PREDICTION_FACTOR: Float = 2.5f

    fun decide(
        translationY: Float,
        predictedY: Float,
        isFullscreen: Boolean,
        threshold: Float,
        hasActiveFeature: Boolean = false,
    ): StoryVerticalGestureAction {
        val predictionThreshold = threshold * PREDICTION_FACTOR
        val goesDown = translationY > threshold || predictedY > predictionThreshold
        val goesUp = translationY < -threshold || predictedY < -predictionThreshold
        return when {
            hasActiveFeature -> if (goesDown || goesUp) StoryVerticalGestureAction.DismissActiveFeature else StoryVerticalGestureAction.Cancel
            goesDown -> if (isFullscreen) StoryVerticalGestureAction.ExitFullscreen else StoryVerticalGestureAction.DismissViewer
            goesUp -> if (isFullscreen) StoryVerticalGestureAction.None else StoryVerticalGestureAction.EnterFullscreen
            else -> StoryVerticalGestureAction.Cancel
        }
    }
}

/**
 * Le chrome du lecteur en session plein écran — iOS `onChromeVisibilityChange`. Au repos il est visible hors plein
 * écran et masqué en plein écran ; le toucher qui fige la story (appui long) inverse l'un et l'autre, donc le plein
 * écran révèle son chrome au toucher et le mode fenêtré le cache pour l'immersion.
 */
internal object StoryFullscreenChrome {
    fun chromeVisible(isFullscreen: Boolean, isHeld: Boolean): Boolean = isFullscreen == isHeld
}
