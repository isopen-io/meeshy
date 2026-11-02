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
