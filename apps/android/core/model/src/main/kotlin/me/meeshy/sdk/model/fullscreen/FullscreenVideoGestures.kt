package me.meeshy.sdk.model.fullscreen

/** Le cadrage de la vidéo : image entière, ou remplissage de l'écran. */
public enum class VideoFrameFit {
    FIT,
    FILL,
    ;

    public fun toggled(): VideoFrameFit = if (this == FIT) FILL else FIT
}

/** Ce que décide la fin d'un glissement vers le bas. */
public sealed interface SwipeDownOutcome {
    /** Sous le seuil : la vidéo revient en place. */
    public data object SnapBack : SwipeDownOutcome

    /** On ferme ; [requestPip] demande le PiP si la lecture est en cours. */
    public data class Dismiss(val requestPip: Boolean) : SwipeDownOutcome
}

/** Seuils de gestes du plein écran vidéo (miroir de `MeeshyVideoPlayer+Renderers.swift`). */
public object FullscreenVideoGestures {

    /** Distance minimale avant qu'un glissement vertical ne suive le doigt. */
    public const val DRAG_START_DISTANCE: Float = 30f

    /** Glissement vers le bas au-delà duquel on ferme (iOS : 150 pt). */
    public const val DISMISS_DISTANCE: Float = 150f

    public fun isSwipeDownActive(translationY: Float): Boolean = translationY > DRAG_START_DISTANCE

    /** Décalage suivi pendant le glissement : jamais vers le haut. */
    public fun dragOffset(translationY: Float): Float = if (translationY > 0f) translationY else 0f

    public fun swipeDownEnded(translationY: Float, isPlaying: Boolean, pipActive: Boolean): SwipeDownOutcome =
        if (translationY > DISMISS_DISTANCE) SwipeDownOutcome.Dismiss(requestPip = isPlaying || pipActive)
        else SwipeDownOutcome.SnapBack

    /** Pincement terminé : écarter remplit, resserrer ajuste. */
    public fun fitAfterPinch(scale: Float): VideoFrameFit = if (scale > 1f) VideoFrameFit.FILL else VideoFrameFit.FIT

    /** Un tap sur la surface bascule le chrome. */
    public fun chromeAfterTap(state: FullscreenChromeState): FullscreenChromeState = state.tappingMedia()
}
