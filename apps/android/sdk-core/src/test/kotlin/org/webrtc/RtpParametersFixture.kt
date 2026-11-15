package org.webrtc

/** Des paramètres d'émetteur réels pour les témoins : leur constructeur n'est visible que de `org.webrtc`. */
fun rtpParameters(
    degradation: RtpParameters.DegradationPreference?,
    encodings: List<RtpParameters.Encoding>,
): RtpParameters = RtpParameters("tx", degradation, RtpParameters.Rtcp("", false), emptyList(), encodings, emptyList())

fun rtpEncoding(maxBitrateBps: Int?, maxFramerate: Int?, scaleResolutionDownBy: Double?): RtpParameters.Encoding =
    RtpParameters.Encoding("r0", true, scaleResolutionDownBy).also {
        it.maxBitrateBps = maxBitrateBps
        it.maxFramerate = maxFramerate
    }
