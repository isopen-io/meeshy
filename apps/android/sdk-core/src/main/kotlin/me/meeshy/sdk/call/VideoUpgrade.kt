package me.meeshy.sdk.call

import me.meeshy.sdk.model.call.CallVideoFallback
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.RtpTransceiver
import org.webrtc.VideoTrack

/** L'issue d'un passage de l'audio à la vidéo : une offre doit suivre ([Attached]), ou rien ne change pour le pair. */
internal sealed interface VideoUpgrade {
    data object Attached : VideoUpgrade
    data object AlreadyAttached : VideoUpgrade
    data class Failed(val reason: CallVideoFallback) : VideoUpgrade
}

/**
 * Où la caméra se pose sur un pair VIVANT. Un émetteur vidéo libre (la section vidéo réservée par l'offre
 * d'un pair qui a escaladé en premier) est réutilisé et passe en envoi et réception ; sans lui la piste en ouvre
 * un par `addTrack`. À la descente, l'émetteur lâche la piste et ne fait plus que recevoir.
 */
internal object LocalVideoRoute {
    fun attach(peer: PeerConnection, track: VideoTrack, streamId: String): Boolean {
        val free = peer.transceivers.firstOrNull {
            it.mediaType == MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO && !it.isStopped && it.sender.track() == null
        }
        if (free == null) return peer.addTrack(track, listOf(streamId)) != null
        if (!free.sender.setTrack(track, false)) return false
        free.setDirection(RtpTransceiver.RtpTransceiverDirection.SEND_RECV)
        return true
    }

    fun detach(peer: PeerConnection, track: VideoTrack): Boolean {
        val own = peer.transceivers.firstOrNull { it.sender.track()?.id() == track.id() } ?: return false
        own.sender.setTrack(null, false)
        own.setDirection(RtpTransceiver.RtpTransceiverDirection.RECV_ONLY)
        return true
    }
}
