package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.media.PlaybackSpeed

/**
 * **La pastille de vitesse du plein écran audio** (miroir de `AudioFullscreenSpeed`, `AudioFullscreenRules.swift`) : un
 * palier par toucher, de la normale au double, puis retour à la normale. Plus fine que le cycle du mini-lecteur
 * ([me.meeshy.sdk.model.CoordinatorSpeedCycle]) : on y règle ce qu'on écoute.
 */
public object AudioFullscreenSpeed {

    public val steps: List<PlaybackSpeed> = listOf(
        PlaybackSpeed.X1_0,
        PlaybackSpeed.X1_25,
        PlaybackSpeed.X1_5,
        PlaybackSpeed.X1_75,
        PlaybackSpeed.X2_0,
    )

    /** Le palier suivant ; après le dernier, la normale. Une vitesse posée ailleurs (hors paliers) repart de la normale. */
    public fun next(current: PlaybackSpeed): PlaybackSpeed {
        val index = steps.indexOf(current)
        return if (index < 0) PlaybackSpeed.X1_0 else steps[(index + 1) % steps.size]
    }

    /** Le palier précédent, pour l'action « diminuer » de TalkBack ; la normale est un plancher. */
    public fun previous(current: PlaybackSpeed): PlaybackSpeed {
        val index = steps.indexOf(current)
        return if (index <= 0) PlaybackSpeed.X1_0 else steps[index - 1]
    }
}
