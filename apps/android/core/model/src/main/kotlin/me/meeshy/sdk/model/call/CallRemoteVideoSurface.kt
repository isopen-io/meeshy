package me.meeshy.sdk.model.call

/**
 * Ce que montre l'image du correspondant (miroir de iOS `CallRemoteVideoSurface`, #8788).
 *
 * Un pair qui n'envoie AUCUNE image (émulateur, caméra refusée, appel vidéo accepté en audio)
 * n'est pas « en train de charger » : dès qu'il annonce sa caméra coupée, ou passé le délai
 * d'attente une fois l'audio établi, c'est son avatar et « Caméra désactivée » — jamais un
 * chargement sans fin.
 */
enum class CallRemoteVideoSurface {
    Live,
    CameraOff,
    Connecting,
    ;

    companion object {
        /** Délai (secondes) après lequel un pair sans image est montré caméra coupée. */
        const val WAIT_SECONDS: Long = 12

        fun resolve(hasTrack: Boolean, peerVideoEnabled: Boolean, waitElapsed: Boolean): CallRemoteVideoSurface = when {
            hasTrack && peerVideoEnabled -> Live
            hasTrack || !peerVideoEnabled || waitElapsed -> CameraOff
            else -> Connecting
        }

        /**
         * Le délai ne vaut que pour l'appel qui l'a posé et une fois un média établi :
         * un identifiant d'appel différent (ou absent) remet l'attente à zéro.
         */
        fun isWaitElapsed(hasEstablishedMedia: Boolean, elapsedForCallId: String?, currentCallId: String?): Boolean =
            hasEstablishedMedia && elapsedForCallId != null && elapsedForCallId == currentCallId
    }
}

/**
 * G4.6 — l'image cède la place à l'avatar (et revient) en fondu : la durée du fondu, une seule loi pour l'image
 * qui s'efface et pour l'anneau de parole (miroir de iOS `CallRemoteVideoFade`). « Réduire les animations » garde
 * le fondu, plus court, et ne déplace rien. Seule l'opacité du VOILE (l'avatar posé sur l'image) change : la
 * surface vidéo n'est jamais fondue elle-même, un `SurfaceView` ne se mélange pas à l'alpha de Compose.
 */
object CallRemoteVideoFade {
    fun durationMillis(reduceMotion: Boolean): Int = if (reduceMotion) 120 else 250

    /** 0 : l'image en direct se voit ; 1 : l'avatar (ou l'attente) la couvre. */
    fun veilOpacity(surface: CallRemoteVideoSurface, hasTrack: Boolean): Float =
        if (surface == CallRemoteVideoSurface.Live && hasTrack) 0f else 1f

    /** L'image reste montée sous le voile tant qu'il ne l'a pas entièrement couverte (le fondu aller ET retour). */
    fun keepsLiveImage(hasTrack: Boolean, veil: Float): Boolean = hasTrack && veil < 1f

    /** L'avatar reste monté tant que le voile n'est pas retombé à zéro. */
    fun showsVeil(veil: Float): Boolean = veil > 0f
}
