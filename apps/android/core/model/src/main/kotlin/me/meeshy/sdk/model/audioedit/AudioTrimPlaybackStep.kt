package me.meeshy.sdk.model.audioedit

/**
 * Le pas de la lecture d'un SEGMENT pour le rognage : tenir la borne haute, revenir à la borne
 * basse. Miroir d'`AudioTrimPlaybackStep` (iOS). Pure : l'horloge d'affichage l'appelle à chaque image.
 */
public sealed interface AudioTrimPlaybackStep {
    public data class Playing(val at: Double) : AudioTrimPlaybackStep
    public data class Finished(val restingAt: Double) : AudioTrimPlaybackStep

    public companion object {
        public fun next(
            currentTime: Double,
            playerIsPlaying: Boolean,
            lowerBound: Double,
            upperBound: Double,
        ): AudioTrimPlaybackStep =
            if (currentTime < upperBound && playerIsPlaying) Playing(currentTime) else Finished(lowerBound)
    }
}
