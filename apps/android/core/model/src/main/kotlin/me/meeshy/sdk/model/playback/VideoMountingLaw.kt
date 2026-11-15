package me.meeshy.sdk.model.playback

/** Le rôle d'une surface qui demande à monter le lecteur vidéo partagé (iOS `VideoSurfaceRole`). */
public enum class VideoSurfaceRole {
    /** Dans un fil : bulle, carte, commentaire, carte de réel du fil. */
    INLINE,

    /** Un visualiseur plein écran : galerie, lecteur plein écran, lecteur de réels. */
    FULLSCREEN,

    /** La fenêtre Picture in Picture elle-même. */
    PICTURE_IN_PICTURE,
}

/** Ce que devient la lecture quand le plein écran se ferme. */
public enum class FullscreenCloseDisposition {
    KEEPS_PLAYING_IN_PIP,
    STOPS,
}

/**
 * **Une vidéo ne joue qu'à UN endroit** (iOS `SharedAVPlayerManager+Mounting`, #9575).
 *
 * Le moteur tient un seul lecteur. Le verdict de montage vit ici, en fonction pure : les surfaces le
 * consomment et ne réécrivent plus jamais le prédicat « l'URL active est la mienne ».
 */
public object VideoMountingLaw {

    /**
     * Cette surface, de ce rôle, peut-elle monter le lecteur pour ce média ? [surfaceMedia] et
     * [activeMedia] sont la même sorte d'identité des deux côtés (URL ou identifiant de pièce).
     * Deux identités vides ne sont pas « le même média ».
     */
    public fun mayMountPlayer(
        role: VideoSurfaceRole,
        surfaceMedia: String,
        activeMedia: String,
        isPipActive: Boolean,
    ): Boolean {
        if (surfaceMedia.isEmpty() || surfaceMedia != activeMedia) return false
        return when (role) {
            VideoSurfaceRole.INLINE -> !isPipActive
            VideoSurfaceRole.FULLSCREEN -> true
            VideoSurfaceRole.PICTURE_IN_PICTURE -> isPipActive
        }
    }

    /** Le verdict d'une surface plein écran : il ne dépend pas du PiP, c'est elle qui le reprend. */
    public fun mayMountFullscreenPlayer(surfaceMedia: String, activeMedia: String): Boolean =
        mayMountPlayer(VideoSurfaceRole.FULLSCREEN, surfaceMedia, activeMedia, isPipActive = false)

    /** Le plein écran qui reprend SA vidéo arrête le PiP qui la jouait. */
    public fun fullscreenReclaimsPip(surfaceMedia: String, activeMedia: String, isPipActive: Boolean): Boolean =
        isPipActive && mayMountPlayer(VideoSurfaceRole.FULLSCREEN, surfaceMedia, activeMedia, isPipActive)

    /** Fermer le plein écran n'abandonne la lecture qu'au PiP, jamais à la bulle restée derrière. */
    public fun fullscreenCloseDisposition(pipHandedOff: Boolean): FullscreenCloseDisposition =
        if (pipHandedOff) FullscreenCloseDisposition.KEEPS_PLAYING_IN_PIP else FullscreenCloseDisposition.STOPS

    /**
     * Un lecteur préparé s'adopte s'il lit le fichier local — ou, à défaut de fichier sur le disque,
     * tel quel. Préparé sur le réseau alors que le fichier est là, il se jette.
     */
    public fun mayAdoptPreparedPlayer(playsLocalFile: Boolean, localFileOnDisk: Boolean): Boolean =
        playsLocalFile || !localFileOnDisk

    /** Le lecteur sortant revient au pool s'il est PRÊT et lit le fichier. */
    public fun mayRecycleOutgoingPlayer(isReady: Boolean, playsLocalFile: Boolean): Boolean =
        isReady && playsLocalFile
}
