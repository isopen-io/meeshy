package me.meeshy.sdk.model.call

/**
 * Quand l'appel peut se réduire en Picture-in-Picture (miroir de `CallPiPPolicy`, iOS) : un appel
 * VIDÉO établi, dont l'écran est celui qu'on quitte, sur un appareil qui sait faire du PiP.
 * Un appel audio, un appel qui sonne encore ou une application qui montre autre chose (l'appel est
 * réduit en pastille) n'ont aucune vidéo à garder dans la fenêtre flottante.
 */
object CallPictureInPicturePolicy {
    /** Rapport de la fenêtre flottante : l'appel vidéo est en portrait (9:16). */
    const val ASPECT_WIDTH: Int = 9
    const val ASPECT_HEIGHT: Int = 16

    fun mayEnter(
        isVideoCall: Boolean,
        isEstablished: Boolean,
        callScreenShown: Boolean,
        deviceSupportsPip: Boolean,
    ): Boolean = deviceSupportsPip && isVideoCall && isEstablished && callScreenShown

    /** L'action de la pilule : proposée sans condition d'écran (elle n'existe que sur l'écran d'appel). */
    fun offersAction(isVideoCall: Boolean, isEstablished: Boolean, deviceSupportsPip: Boolean): Boolean =
        mayEnter(isVideoCall, isEstablished, callScreenShown = true, deviceSupportsPip = deviceSupportsPip)
}
