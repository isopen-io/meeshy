package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.playback.MediaResumeMerge

/**
 * **Une page du plein écran audio qu'on ne joue pas garde son curseur là où on l'a laissée** — miroir d'iOS
 * `AudioFullscreenPlaybackSnapshot.resting(savedPosition:duration:)`. Le moteur reprend une piste à la position que
 * l'appareil a mémorisée ; la page doit s'y peindre avant qu'il ne la rejoue, sans quoi le curseur part du début puis saute.
 *
 * Une position nulle, au bout ou au-delà de la piste, ou une durée inconnue, ne donne AUCUN repos local : la page retombe
 * alors sur la consommation servie ([AudioFullscreenPageProgress], la précédence de la bulle).
 */
public object AudioFullscreenResting {

    public fun storedPositionMs(stored: MediaResumeMerge.StampedPosition?, durationMs: Long): Long? {
        val positionMs = stored?.positionMs ?: return null
        if (durationMs <= 0L || positionMs <= 0L || positionMs >= durationMs) return null
        return positionMs
    }
}
