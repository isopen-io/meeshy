package me.meeshy.sdk.model.playback

/** Où une vidéo est montrée : dans un fil, une bulle, une page (`INLINE`), ou seule à l'écran (`FULLSCREEN`). */
public enum class VideoPresentation {
    INLINE,
    FULLSCREEN,
}

/** Le rapport largeur:hauteur de la fenêtre flottante. */
public data class PipAspect(val width: Int, val height: Int) {
    public val ratio: Float get() = width.toFloat() / height.toFloat()

    public companion object {
        /** Repli d'un réel dont la taille n'est pas encore lue. */
        public val PORTRAIT: PipAspect = PipAspect(9, 16)

        /** Repli d'une vidéo de conversation dont la taille n'est pas encore lue. */
        public val LANDSCAPE: PipAspect = PipAspect(16, 9)
    }
}

/**
 * Le Picture-in-Picture d'une VIDÉO (miroir de `PipPresentationLaw`, iOS, #11041) : **PiP = plein écran**. Une
 * vidéo inline (bulle, fil, page, profil, commentaire inline) ne configure jamais de fenêtre ; une vidéo plein
 * écran (réel, plein écran d'une vidéo de conversation) la configure si elle la demande, sauf si elle est
 * protégée (`ProtectedPlaybackPolicy` : vue unique, floutée). Un appel vidéo en cours garde la fenêtre pour lui.
 */
public object VideoPictureInPicturePolicy {
    /** Bornes Android (1:2,39 – 2,39:1), resserrées d'un centième : la comparaison du système se fait en flottants. */
    private const val MAX_RATIO_NUMERATOR: Int = 238
    private const val RATIO_DENOMINATOR: Int = 100
    private const val MAX_RATIO: Float = MAX_RATIO_NUMERATOR.toFloat() / RATIO_DENOMINATOR

    public fun mayConfigure(presentation: VideoPresentation, requestsPip: Boolean, isProtected: Boolean): Boolean =
        presentation == VideoPresentation.FULLSCREEN && requestsPip && !isProtected

    /** Quitter l'application (HOME) ouvre la fenêtre : une surface configurée EN LECTURE, aucun appel vidéo en cours. */
    public fun mayEnterOnLeave(
        configured: Boolean,
        isPlaying: Boolean,
        deviceSupportsPip: Boolean,
        videoCallInProgress: Boolean,
    ): Boolean = isPlaying && offersButton(configured, deviceSupportsPip, videoCallInProgress)

    /** Le bouton PiP des contrôles : proposé sur une surface configurée, en lecture comme en pause. */
    public fun offersButton(configured: Boolean, deviceSupportsPip: Boolean, videoCallInProgress: Boolean): Boolean =
        configured && deviceSupportsPip && !videoCallInProgress

    /** Le rapport de la fenêtre : celui de la vidéo, ramené aux bornes Android ; [fallback] tant qu'il est inconnu. */
    public fun aspect(videoWidth: Int, videoHeight: Int, fallback: PipAspect): PipAspect {
        if (videoWidth <= 0 || videoHeight <= 0) return fallback
        val ratio = videoWidth.toFloat() / videoHeight
        return when {
            ratio > MAX_RATIO -> PipAspect(MAX_RATIO_NUMERATOR, RATIO_DENOMINATOR)
            ratio < 1f / MAX_RATIO -> PipAspect(RATIO_DENOMINATOR, MAX_RATIO_NUMERATOR)
            else -> PipAspect(videoWidth, videoHeight)
        }
    }
}
