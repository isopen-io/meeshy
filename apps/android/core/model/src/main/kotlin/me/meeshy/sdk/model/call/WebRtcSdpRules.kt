package me.meeshy.sdk.model.call

/** Un candidat ICE vu comme trois champs bruts, indépendant de libwebrtc. */
data class IceCandidateLine(val sdpMid: String?, val sdpMLineIndex: Int, val line: String)

/**
 * Règles pures sur les SDP et candidats ICE reçus du pair, miroir de `WebRTCSdpRules` iOS
 * (`P2PWebRTCClient+SdpRules.swift`). libwebrtc parse ces chaînes sans borne : un pair hostile pourrait
 * provoquer erreurs de parsing ou pression mémoire. On refuse l'évident AVANT de lui passer quoi que ce soit.
 */
object WebRtcSdpRules {
    const val MAX_SDP_LENGTH: Int = 1_000_000
    const val MAX_M_LINE_INDEX: Int = 255
    const val MAX_SDP_MID_LENGTH: Int = 256
    const val MAX_CANDIDATE_LINE_LENGTH: Int = 10_000

    private const val VERSION_LINE = "v=0"

    /** Motif du refus d'un SDP distant, `null` s'il est admissible. */
    fun rejectionOf(sdp: String): SdpRejection? = when {
        sdp.isEmpty() -> SdpRejection.Empty
        sdp.length > MAX_SDP_LENGTH -> SdpRejection.TooLarge
        !sdp.startsWith(VERSION_LINE) -> SdpRejection.MissingVersionLine
        else -> null
    }

    /** Lève [WebRtcError.InvalidRemoteDescription] si [sdp] n'est pas admissible. */
    fun requireValidRemoteSdp(sdp: String) {
        rejectionOf(sdp)?.let { throw WebRtcError.InvalidRemoteDescription(it) }
    }

    /** Admission d'un candidat reçu : index, `sdpMid` et ligne dans leurs bornes. */
    fun admits(candidate: IceCandidateLine): Boolean =
        candidate.sdpMLineIndex in 0..MAX_M_LINE_INDEX &&
            (candidate.sdpMid?.length ?: 0) <= MAX_SDP_MID_LENGTH &&
            candidate.line.length <= MAX_CANDIDATE_LINE_LENGTH
}
