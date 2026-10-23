package me.meeshy.sdk.model.call

/**
 * Les échecs typés du moteur pair-à-pair, miroir de `WebRTCError` iOS. Une valeur typée plutôt qu'une
 * `RuntimeException` anonyme : l'appelant décide s'il raccroche (la pile n'a pas pu naître) ou s'il
 * ignore (un SDP distant hostile ne doit jamais couper un appel sain).
 */
sealed class WebRtcError(message: String, cause: Throwable? = null) : Exception(message, cause) {
    /** Aucun `PeerConnection` : l'appel n'est pas (ou plus) ouvert. */
    class NoPeerConnection : WebRtcError("No peer connection available")

    /** `configure` a échoué : la fabrique n'a pas rendu de pair, l'installation de l'appel est abandonnée. */
    class ConfigureFailed(val detail: String) : WebRtcError("Failed to create peer connection: $detail")

    /** La description distante est refusée AVANT d'atteindre libwebrtc. */
    class InvalidRemoteDescription(val reason: SdpRejection) : WebRtcError("Invalid remote SDP: ${reason.name}")

    /** libwebrtc n'a pas pu fabriquer l'offre ou la réponse locale. */
    class FailedToCreateSdp(val detail: String) : WebRtcError("Failed to create SDP: $detail")

    /** libwebrtc a refusé d'appliquer une description. */
    class SetDescriptionFailed(val detail: String) : WebRtcError("Failed to set description: $detail")

    /** Une description d'un type que le moteur ne négocie pas (pranswer, rollback). */
    class UnsupportedDescription(val type: String) : WebRtcError("Unsupported description type: $type")
}

/** Pourquoi un SDP distant est refusé. */
enum class SdpRejection { Empty, TooLarge, MissingVersionLine }
