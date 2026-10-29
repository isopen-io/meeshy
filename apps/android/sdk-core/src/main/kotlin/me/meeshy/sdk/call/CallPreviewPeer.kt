package me.meeshy.sdk.call

import me.meeshy.sdk.model.call.CallPreviewControl
import me.meeshy.sdk.model.call.IceCandidateLine
import me.meeshy.sdk.model.call.RemoteDescriptionGuard
import me.meeshy.sdk.model.call.RemoteDescriptionGuard.CandidateRoute
import me.meeshy.sdk.model.call.RemoteDescriptionGuard.DescriptionType
import me.meeshy.sdk.model.call.RemoteDescriptionGuard.Verdict
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.WebRtcError
import me.meeshy.sdk.model.call.WebRtcSdpRules
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaStream
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.RtpTransceiver
import org.webrtc.RtpTransceiver.RtpTransceiverDirection
import org.webrtc.SessionDescription
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import java.nio.ByteBuffer
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean

/** Un lien d'aperçu avant décroché (#8480) : réception seule chez l'appelé, ce qu'il consent chez l'appelant. */
public data class CallPreviewPeerConfig(
    val iceServers: List<SocketIceServer>,
    val receiveOnly: Boolean,
    val sendsAudio: Boolean,
    val sendsVideo: Boolean,
)

/** Ce que le lien rapporte, sur les fils de libwebrtc : l'appelant (couche applicative) change de fil. */
public interface CallPreviewPeerListener {
    public fun onIceCandidate(candidate: IceCandidate)

    public fun onConnectionChange(state: PeerConnection.PeerConnectionState)

    public fun onRemoteVideo(track: VideoTrack)

    public fun onControlOpened()

    public fun onControlMessage(bytes: ByteArray)
}

/**
 * La SECONDE connexion d'un appel 1:1 qui sonne : l'aperçu avant décroché. Elle naît de la fabrique
 * de l'appel (même contexte EGL, même module audio) mais vit à côté du pair de l'appel, et ne le
 * touche jamais. Brique SANS politique — qui offre, quand fermer, ce qui part : la couche
 * applicative le décide.
 *
 * - **Réception seule** ([CallPreviewPeerConfig.receiveOnly]) : aucune piste locale n'est créée, et
 *   chaque transceiver de l'offre reçue est forcé `recvonly` sans piste : ni micro ni caméra ne
 *   s'ouvrent avant le décroché. L'audio reçu reste muet tant que [setRemoteAudible] ne l'ouvre pas.
 * - **Émission** (l'appelant) : ses pistes sont TIRÉES des sources de l'appel, jamais les pistes de
 *   l'appel elles-mêmes — couper l'aperçu ne coupe pas l'appel. Un micro non consenti n'a PAS de piste
 *   sur son émetteur : libwebrtc n'ouvre alors pas la capture. La première offre porte le canal de
 *   contrôle [CallPreviewControl.CHANNEL_LABEL], par lequel l'appelé dit s'il écoute.
 *
 * Les descriptions passent par le [RemoteDescriptionGuard] de l'appel (doublon rejoué, réponse
 * périmée, candidats gardés jusqu'à la description distante).
 */
public class CallPreviewPeer internal constructor(
    private val factory: PeerConnectionFactory,
    private val config: CallPreviewPeerConfig,
    private val listener: CallPreviewPeerListener,
    audioSource: AudioSource?,
    videoSource: VideoSource?,
    private val onClosed: (CallPreviewPeer) -> Unit = {},
) {
    private val remoteDescriptions = RemoteDescriptionGuard()
    private val remoteAudio = CopyOnWriteArrayList<AudioTrack>()
    private val closed = AtomicBoolean(false)

    @Volatile
    private var remoteAudible = false

    @Volatile
    private var controlChannel: DataChannel? = null

    private val localAudio: AudioTrack? =
        if (config.receiveOnly) null else audioSource?.let { factory.createAudioTrack(AUDIO_TRACK_ID, it) }

    private val localVideo: VideoTrack? =
        if (config.receiveOnly) null else videoSource?.let { factory.createVideoTrack(VIDEO_TRACK_ID, it) }

    private var sendsAudio = config.sendsAudio
    private var sendsVideo = config.sendsVideo

    private val observer = object : PeerConnection.Observer {
        override fun onIceCandidate(candidate: IceCandidate) = listener.onIceCandidate(candidate)

        override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) {
            newState?.let(listener::onConnectionChange)
        }

        override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) {
            when (val track = receiver.track()) {
                is VideoTrack -> listener.onRemoteVideo(track)
                is AudioTrack -> {
                    remoteAudio += track
                    track.setEnabled(remoteAudible)
                }
                else -> Unit
            }
        }

        override fun onDataChannel(channel: DataChannel?) {
            if (channel == null || channel.label() != CallPreviewControl.CHANNEL_LABEL || controlChannel != null) return
            adoptControl(channel)
        }

        override fun onSignalingChange(state: PeerConnection.SignalingState?) = Unit
        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) = Unit
        override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) = Unit
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) = Unit
        override fun onAddStream(stream: MediaStream?) = Unit
        override fun onRemoveStream(stream: MediaStream?) = Unit
        override fun onRenegotiationNeeded() = Unit
    }

    private val configuration = rtcConfiguration(config.iceServers, ICE_CANDIDATE_POOL_SIZE)

    private val peer: PeerConnection = factory.createPeerConnection(configuration, observer)
        ?: run {
            disposeLocalTracks()
            throw WebRtcError.ConfigureFailed("PeerConnectionFactory returned no preview peer connection")
        }

    /** Vrai si ce lien porte des pistes tirées des sources de l'appel : il doit mourir AVANT elles. */
    internal val usesCallSources: Boolean get() = localAudio != null || localVideo != null

    /** L'appelant : la première offre pose ses transceivers et son canal de contrôle. */
    public suspend fun createOffer(): SessionDescription {
        addOffererTransceiversIfNeeded()
        openControlChannelIfNeeded()
        return peer.awaitCreate(isOffer = true)
    }

    public suspend fun createAnswer(): SessionDescription = peer.awaitCreate(isOffer = false)

    public suspend fun setLocalDescription(desc: SessionDescription) {
        peer.awaitApply(desc, local = true)
        if (desc.type == SessionDescription.Type.OFFER) remoteDescriptions.onLocalOfferSet()
    }

    /**
     * La description du pair. Un SDP invalide lève [WebRtcError.InvalidRemoteDescription] sans toucher
     * le pair ; un doublon ou une réponse inattendue est ignoré. Réception seule : chaque transceiver
     * de l'offre devient `recvonly`, sans piste, AVANT que la réponse ne soit fabriquée.
     */
    public suspend fun setRemoteDescription(desc: SessionDescription) {
        val type = when (desc.type) {
            SessionDescription.Type.OFFER -> DescriptionType.Offer
            SessionDescription.Type.ANSWER -> DescriptionType.Answer
            else -> throw WebRtcError.UnsupportedDescription(desc.type.name)
        }
        WebRtcSdpRules.requireValidRemoteSdp(desc.description)
        if (remoteDescriptions.judge(type, desc.description) != Verdict.Apply) return
        peer.awaitApply(desc, local = false)
        if (type == DescriptionType.Offer && config.receiveOnly) peer.transceivers.forEach(::forceReceiveOnly)
        remoteDescriptions.onApplied(type, desc.description).forEach { peer.addIceCandidate(it.toIceCandidate()) }
    }

    /** Candidat du pair : refusé hors bornes, gardé tant que la description distante manque. */
    public fun addIceCandidate(candidate: IceCandidate) {
        val line = IceCandidateLine(candidate.sdpMid, candidate.sdpMLineIndex, candidate.sdp)
        if (remoteDescriptions.route(line) == CandidateRoute.ApplyNow) peer.addIceCandidate(candidate)
    }

    /** L'appelant : son micro part (ou plus) sur l'aperçu, sans toucher au micro de l'appel. */
    public fun setSendsAudio(enabled: Boolean) {
        sendsAudio = enabled
        transceiverOf(MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO)?.sender?.setTrack(localAudio.takeIf { enabled }, false)
    }

    /** L'appelant : sa caméra part (ou plus) sur l'aperçu. */
    public fun setSendsVideo(enabled: Boolean) {
        sendsVideo = enabled
        val video = localVideo ?: return
        transceiverOf(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO)?.sender?.setTrack(video.takeIf { enabled }, false)
    }

    /** L'appelé : entendre (ou taire) l'appelant. Le choix vaut aussi pour une piste encore à venir. */
    public fun setRemoteAudible(audible: Boolean) {
        remoteAudible = audible
        remoteAudio.forEach { it.setEnabled(audible) }
    }

    public fun updateIceServers(servers: List<SocketIceServer>): Boolean {
        if (closed.get()) return false
        configuration.iceServers = servers.map { it.toIceServer() }
        return peer.setConfiguration(configuration)
    }

    /** Une trame sur le canal de contrôle ; `false` s'il n'est pas ouvert. */
    public fun sendControl(bytes: ByteArray): Boolean {
        val channel = controlChannel ?: return false
        if (channel.state() != DataChannel.State.OPEN) return false
        return runCatching { channel.send(DataChannel.Buffer(ByteBuffer.wrap(bytes), false)) }.getOrDefault(false)
    }

    /** Libère le canal, le pair et ses pistes ; idempotent. Les pistes reçues meurent avec le pair. */
    public fun close() {
        if (!closed.compareAndSet(false, true)) return
        controlChannel?.let { channel ->
            runCatching { channel.unregisterObserver() }
            runCatching { channel.close() }
            runCatching { channel.dispose() }
        }
        controlChannel = null
        remoteAudio.clear()
        peer.dispose()
        disposeLocalTracks()
        onClosed(this)
    }

    private fun disposeLocalTracks() {
        localAudio?.dispose()
        localVideo?.dispose()
    }

    private fun addOffererTransceiversIfNeeded() {
        if (peer.transceivers.isNotEmpty()) return
        val audio = peer.addTransceiver(
            MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO,
            RtpTransceiver.RtpTransceiverInit(RtpTransceiverDirection.SEND_RECV, listOf(STREAM_ID)),
        )
        audio?.sender?.setTrack(localAudio.takeIf { sendsAudio }, false)
        val direction = if (localVideo != null) RtpTransceiverDirection.SEND_RECV else RtpTransceiverDirection.RECV_ONLY
        val video = peer.addTransceiver(
            MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO,
            RtpTransceiver.RtpTransceiverInit(direction, listOf(STREAM_ID)),
        )
        localVideo?.let { video?.sender?.setTrack(it.takeIf { sendsVideo }, false) }
    }

    private fun openControlChannelIfNeeded() {
        if (config.receiveOnly || controlChannel != null) return
        val channel = peer.createDataChannel(CallPreviewControl.CHANNEL_LABEL, DataChannel.Init().apply { ordered = true })
            ?: return
        adoptControl(channel)
    }

    private fun adoptControl(channel: DataChannel) {
        controlChannel = channel
        channel.registerObserver(object : DataChannel.Observer {
            override fun onBufferedAmountChange(previousAmount: Long) = Unit

            override fun onStateChange() {
                if (channel.state() == DataChannel.State.OPEN) listener.onControlOpened()
            }

            override fun onMessage(buffer: DataChannel.Buffer) {
                val bytes = ByteArray(buffer.data.remaining())
                buffer.data.get(bytes)
                listener.onControlMessage(bytes)
            }
        })
        if (channel.state() == DataChannel.State.OPEN) listener.onControlOpened()
    }

    private fun forceReceiveOnly(transceiver: RtpTransceiver) {
        runCatching {
            transceiver.sender.setTrack(null, false)
            transceiver.setDirection(RtpTransceiverDirection.RECV_ONLY)
        }
    }

    private fun transceiverOf(type: MediaStreamTrack.MediaType): RtpTransceiver? =
        peer.transceivers.firstOrNull { it.mediaType == type }

    private fun IceCandidateLine.toIceCandidate() = IceCandidate(sdpMid, sdpMLineIndex, line)

    private companion object {
        const val ICE_CANDIDATE_POOL_SIZE = 2
        const val AUDIO_TRACK_ID = "meeshy_preview_audio"
        const val VIDEO_TRACK_ID = "meeshy_preview_video"
        const val STREAM_ID = "meeshy_preview"
    }
}
