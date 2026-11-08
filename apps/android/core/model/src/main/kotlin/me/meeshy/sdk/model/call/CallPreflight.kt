package me.meeshy.sdk.model.call

/** Ce que la vérification des permissions décide d'un appel qui PART. */
sealed interface CallPreflightDecision {
    /** Micro refusé : l'appel ne part pas, et on le dit (jamais d'écran figé en silence). */
    data object MicrophoneDenied : CallPreflightDecision

    /**
     * L'appel part. [isVideo] est le type réellement composé ; [fallback] dit pourquoi une vidéo demandée
     * est devenue un appel audio (`null` : rien n'a changé).
     */
    data class Proceed(val isVideo: Boolean, val fallback: CallVideoFallback? = null) : CallPreflightDecision
}

/**
 * Les permissions d'un appel sortant, tranchées AVANT de composer (miroir de iOS
 * `CallOutgoingDial.requestPermissionsThenStartCall`) : le micro est bloquant — un appel sans micro se
 * « connecte » et reste muet —, la caméra ne l'est jamais : un refus compose en audio.
 */
object CallPreflight {
    fun decide(micGranted: Boolean, cameraGranted: Boolean, isVideo: Boolean): CallPreflightDecision = when {
        !micGranted -> CallPreflightDecision.MicrophoneDenied
        !isVideo -> CallPreflightDecision.Proceed(isVideo = false)
        else -> CallVideoFallback.resolve(cameraGranted)
            ?.let { CallPreflightDecision.Proceed(isVideo = false, fallback = it) }
            ?: CallPreflightDecision.Proceed(isVideo = true)
    }
}
