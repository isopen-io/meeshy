package me.meeshy.sdk.call

import org.webrtc.DataChannel
import org.webrtc.PeerConnection
import org.webrtc.RTCStatsCollectorCallback
import org.webrtc.RtpSender
import org.webrtc.RtpTransceiver

/**
 * Accès en LECTURE au pair de l'appel en cours : statistiques, émetteurs, transceivers et canaux de
 * données reçus. Les couches qui mesurent la qualité ou règlent les émetteurs (débit, simulcast)
 * s'y adossent sans jamais tenir le `PeerConnection` lui-même, qui reste privé au moteur.
 */
public interface CallPeerHandle {
    public fun getStats(callback: RTCStatsCollectorCallback)

    public val senders: List<RtpSender>

    public val transceivers: List<RtpTransceiver>

    /** Canaux de données ouverts PAR LE PAIR distant pendant cet appel. */
    public val dataChannels: List<DataChannel>
}

internal class PeerConnectionHandle(
    private val peer: PeerConnection,
    private val channels: () -> List<DataChannel>,
) : CallPeerHandle {
    override fun getStats(callback: RTCStatsCollectorCallback) {
        peer.getStats(callback)
    }

    override val senders: List<RtpSender> get() = peer.senders

    override val transceivers: List<RtpTransceiver> get() = peer.transceivers

    override val dataChannels: List<DataChannel> get() = channels()
}
