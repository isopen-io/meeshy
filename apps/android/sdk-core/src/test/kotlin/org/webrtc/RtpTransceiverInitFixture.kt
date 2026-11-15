package org.webrtc

/** La direction d'un `RtpTransceiverInit` pour les témoins : son accesseur n'est visible que de `org.webrtc`. */
fun RtpTransceiver.RtpTransceiverInit.initialDirection(): RtpTransceiver.RtpTransceiverDirection =
    RtpTransceiver.RtpTransceiverDirection.entries.first { it.nativeIndex == directionNativeIndex }
