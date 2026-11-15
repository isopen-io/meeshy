package me.meeshy.sdk.call

import kotlinx.coroutines.suspendCancellableCoroutine
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.WebRtcError
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Les gestes SDP d'un `PeerConnection` en `suspend` : le pair de l'appel ([WebRtcEngine]) et celui de
 * l'aperçu ([CallPreviewPeer]) les partagent, pour qu'une seule écriture traduise les rappels de
 * libwebrtc en erreurs typées.
 */
internal suspend fun PeerConnection.awaitCreate(isOffer: Boolean): SessionDescription =
    suspendCancellableCoroutine { cont ->
        val observer = object : SdpObserver {
            override fun onCreateSuccess(desc: SessionDescription) = cont.resume(desc)
            override fun onCreateFailure(error: String?) =
                cont.resumeWithException(WebRtcError.FailedToCreateSdp(error.orEmpty()))
            override fun onSetSuccess() = Unit
            override fun onSetFailure(error: String?) = Unit
        }
        val constraints = MediaConstraints()
        if (isOffer) createOffer(observer, constraints) else createAnswer(observer, constraints)
    }

internal suspend fun PeerConnection.awaitApply(desc: SessionDescription, local: Boolean): Unit =
    suspendCancellableCoroutine { cont ->
        val observer = object : SdpObserver {
            override fun onCreateSuccess(desc: SessionDescription?) = Unit
            override fun onCreateFailure(error: String?) = Unit
            override fun onSetSuccess() = cont.resume(Unit)
            override fun onSetFailure(error: String?) =
                cont.resumeWithException(WebRtcError.SetDescriptionFailed(error.orEmpty()))
        }
        if (local) setLocalDescription(observer, desc) else setRemoteDescription(observer, desc)
    }

/** La configuration commune des pairs Meeshy : Unified Plan, collecte continue, un seul transport. */
internal fun rtcConfiguration(iceServers: List<SocketIceServer>, candidatePoolSize: Int): PeerConnection.RTCConfiguration =
    PeerConnection.RTCConfiguration(iceServers.map { it.toIceServer() }).apply {
        sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
        rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
        iceCandidatePoolSize = candidatePoolSize
    }

internal fun SocketIceServer.toIceServer(): PeerConnection.IceServer =
    PeerConnection.IceServer.builder(urls)
        .setUsername(username.orEmpty())
        .setPassword(credential.orEmpty())
        .createIceServer()
