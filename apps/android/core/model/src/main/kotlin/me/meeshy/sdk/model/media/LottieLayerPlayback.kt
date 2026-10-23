package me.meeshy.sdk.model.media

import me.meeshy.sdk.model.accessibility.ReduceMotionLaw

/** Ce que fait une couche Lottie : image fixe de départ, pause là où elle en est, ou lecture (en boucle ou une fois). */
public sealed interface LottiePlaybackMode {
    /** Première image fixe (progression 0). */
    public data object FirstFrame : LottiePlaybackMode

    /** Pause à l'image courante, reprise au retour. */
    public data object PausedInPlace : LottiePlaybackMode

    /** Lecture ; [loops] faux = une lecture puis la dernière image. */
    public data class Playing(public val loops: Boolean) : LottiePlaybackMode
}

/**
 * **La loi de lecture d'une couche Lottie** — miroir de `LottieLayerPlayback` (iOS), pure.
 *
 * - Réduire les animations (système OU Meeshy, qui ne peut que renforcer le premier) ⇒ première image ; l'emporte sur tout.
 * - App en arrière-plan ou couche hors écran ⇒ pause là où elle en est.
 * - `animates` faux ou pas de place au budget ([granted] faux) ⇒ première image.
 * - `loops` faux ⇒ une lecture puis la dernière image.
 */
public object LottieLayerPlayback {
    public fun mode(
        animates: Boolean,
        reduceMotion: Boolean,
        sceneActive: Boolean,
        onScreen: Boolean,
        loops: Boolean = true,
    ): LottiePlaybackMode = when {
        !animates || reduceMotion -> LottiePlaybackMode.FirstFrame
        !sceneActive || !onScreen -> LottiePlaybackMode.PausedInPlace
        else -> LottiePlaybackMode.Playing(loops)
    }

    public fun mode(
        animates: Boolean,
        granted: Boolean,
        systemReduceMotion: Boolean,
        userForcedReduceMotion: Boolean,
        sceneActive: Boolean,
        onScreen: Boolean,
        loops: Boolean = true,
    ): LottiePlaybackMode = mode(
        animates = animates && granted,
        reduceMotion = ReduceMotionLaw.shouldReduce(system = systemReduceMotion, userForced = userForcedReduceMotion),
        sceneActive = sceneActive,
        onScreen = onScreen,
        loops = loops,
    )
}
