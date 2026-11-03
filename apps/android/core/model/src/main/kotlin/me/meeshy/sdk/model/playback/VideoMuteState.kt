package me.meeshy.sdk.model.playback

/**
 * **Le mute du lecteur vidéo partagé** (iOS `SharedAVPlayerManager.isMuted` / `isForceMuted`).
 *
 * - [isMuted] : la préférence GLOBALE de l'utilisateur, conservée d'une vidéo à l'autre ;
 * - [isForceMuted] : l'intention d'UNE surface (l'autoplay silencieux du fil), transitoire, remise à
 *   zéro au changement de pièce.
 *
 * Le mute effectif est le OU des deux : un fil qui se tait ne fuit jamais son silence vers la galerie.
 */
public data class VideoMuteState(
    val isMuted: Boolean = false,
    val isForceMuted: Boolean = false,
) {
    val effectiveMuted: Boolean get() = isMuted || isForceMuted

    /** Au changement de pièce : l'intention de surface tombe, la préférence reste. */
    public fun onMediaChanged(): VideoMuteState = if (isForceMuted) copy(isForceMuted = false) else this

    /**
     * Une demande explicite de son (bouton haut-parleur du fil) : rallume la préférence globale
     * aussi, sans quoi le bouton basculerait sans rien changer. Couper ne touche QUE l'intention.
     */
    public fun withSurfaceSound(soundOn: Boolean): VideoMuteState =
        copy(isMuted = if (soundOn) false else isMuted, isForceMuted = !soundOn)

    /** Ce que le changement de mute fait au visionnage en cours. */
    public fun stretchEffect(previous: VideoMuteState): MuteStretchEffect = when {
        effectiveMuted && !previous.effectiveMuted -> MuteStretchEffect.CLOSE_STRETCH
        !effectiveMuted && previous.effectiveMuted -> MuteStretchEffect.REOPEN_STRETCH
        else -> MuteStretchEffect.NONE
    }
}

/** Couper le son clôt le visionnage en cours ; rallumer relance une consommation. */
public enum class MuteStretchEffect { NONE, CLOSE_STRETCH, REOPEN_STRETCH }
