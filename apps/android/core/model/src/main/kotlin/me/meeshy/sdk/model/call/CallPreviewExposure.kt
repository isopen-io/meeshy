package me.meeshy.sdk.model.call

/**
 * Ce que l'appelé reçoit VRAIMENT de l'appelant avant de décrocher (#8795) : le libellé de
 * l'appelant n'en dit jamais plus. « Vu » dès que la caméra de l'aperçu l'atteint ; « entendu »
 * seulement quand l'appelé a lui-même activé le son ET que le micro de l'aperçu part.
 */
enum class CallPreviewExposure {
    Nothing,
    Seen,
    Heard,
    SeenAndHeard;

    companion object {
        fun of(
            reachesCallee: Boolean,
            heardByCallee: Boolean,
            consent: CallPreviewConsent,
            micMuted: Boolean,
            videoEnabled: Boolean,
        ): CallPreviewExposure {
            val sees = reachesCallee && consent.sendsVideo(videoEnabled)
            val hears = reachesCallee && heardByCallee && consent.sendsAudio(micMuted)
            return when {
                sees && hears -> SeenAndHeard
                sees -> Seen
                hears -> Heard
                else -> Nothing
            }
        }
    }
}
