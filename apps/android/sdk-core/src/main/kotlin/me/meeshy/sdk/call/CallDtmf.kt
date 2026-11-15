package me.meeshy.sdk.call

import me.meeshy.sdk.model.call.CallDtmfTones
import org.webrtc.DtmfSender
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection

/** La ligne DTMF de l'émetteur audio du pair : `RtpSender.dtmf()` de WebRTC, derrière une couture testable. */
interface CallDtmfLine {
    val canInsert: Boolean

    fun insert(tones: String, durationMs: Int, interToneGapMs: Int): Boolean
}

/**
 * Relais DTMF (RFC 4733), miroir de iOS `P2PWebRTCClient.sendDTMF` : les touches du clavier d'une voiture ou d'une
 * montre atteignent le pair par l'émetteur audio. Sans ligne (pas d'appel) ou sans capacité d'insertion, rien ne part
 * et l'appel n'en souffre pas. Les chiffres ne sont jamais journalisés : ils portent des codes de conférence.
 */
class CallDtmf(private val line: () -> CallDtmfLine?) {

    /** `true` quand les tonalités sont parties ; une chaîne invalide est refusée en bloc. */
    fun send(digits: String): Boolean {
        val tones = CallDtmfTones.normalize(digits) ?: return false
        val target = line()?.takeIf { it.canInsert } ?: return false
        return target.insert(tones, TONE_DURATION_MS, INTER_TONE_GAP_MS)
    }

    companion object {
        const val TONE_DURATION_MS = 100
        const val INTER_TONE_GAP_MS = 70

        /** La ligne DTMF de l'émetteur audio du pair, `null` hors appel ou sans émetteur audio. */
        internal fun lineOf(peer: PeerConnection?): CallDtmfLine? {
            val sender = runCatching {
                peer?.transceivers
                    ?.firstOrNull { it.mediaType == MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO && !it.isStopped }
                    ?.sender?.dtmf()
            }.getOrNull() ?: return null
            return WebRtcDtmfLine(sender)
        }
    }
}

private class WebRtcDtmfLine(private val sender: DtmfSender) : CallDtmfLine {
    override val canInsert: Boolean get() = sender.canInsertDtmf()

    override fun insert(tones: String, durationMs: Int, interToneGapMs: Int): Boolean =
        sender.insertDtmf(tones, durationMs, interToneGapMs)
}
