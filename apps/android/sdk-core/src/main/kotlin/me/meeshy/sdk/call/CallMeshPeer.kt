package me.meeshy.sdk.call

import me.meeshy.sdk.call.screen.ScreenShareSenderEncoding
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.screenshare.ScreenShareEncodingLaw
import me.meeshy.sdk.model.call.screenshare.ScreenShareSenderLaw
import me.meeshy.sdk.model.call.screenshare.SenderEncodingSnapshot
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
import java.util.concurrent.atomic.AtomicBoolean

/** Une connexion du maillage d'un appel de groupe : ce qu'elle envoie au départ. */
public data class CallMeshPeerConfig(
    val iceServers: List<SocketIceServer>,
    val sendsAudio: Boolean,
    val sendsVideo: Boolean,
)

/** Ce que la connexion rapporte, sur les fils de libwebrtc : la couche applicative change de fil. */
public interface CallMeshPeerListener {
    public fun onIceCandidate(candidate: IceCandidate)

    public fun onConnectionChange(state: PeerConnection.PeerConnectionState)

    public fun onRemoteVideo(track: VideoTrack)

    /** La direction de l'émetteur vidéo a changé (partage d'écran d'un appel audio) : le lien doit offrir à nouveau. */
    public fun onRenegotiationNeeded() {}
}

/**
 * UNE connexion vers UN membre d'un appel de groupe (#13740), à côté du pair de l'appel — la brique de
 * iOS `WebRTCGroupPeerLink`. Elle naît de la fabrique de l'appel et TIRE ses pistes des sources de l'appel
 * (micro, caméra) : couper un lien ne coupe ni l'appel ni les autres liens. Brique SANS politique : qui offre,
 * l'époque de négociation, la collision d'offres et la reprise relèvent de la couche applicative.
 *
 * - offrant : [createOffer] pose ses transceivers (audio envoi-réception, vidéo envoi-réception s'il a une
 *   caméra, sinon réception seule) ;
 * - répondant : [setRemoteDescription] d'une offre accroche ses pistes APRÈS la description distante
 *   (Unified Plan — un transceiver ajouté d'avance n'est pas réassocié à l'offre reçue) ;
 * - les candidats arrivés avant la description distante sont gardés, puis posés.
 */
public class CallMeshPeer internal constructor(
    factory: PeerConnectionFactory,
    config: CallMeshPeerConfig,
    private val listener: CallMeshPeerListener,
    audioSource: AudioSource?,
    videoSource: VideoSource?,
    screenTrack: VideoTrack? = null,
    private val onClosed: (CallMeshPeer) -> Unit = {},
) {
    private val closed = AtomicBoolean(false)
    private val pendingCandidates = ArrayList<IceCandidate>()
    private var hasRemoteDescription = false
    private var sendsAudio = config.sendsAudio
    private var sendsVideo = config.sendsVideo
    private var screen: VideoTrack? = screenTrack
    private var directionBeforeScreen: RtpTransceiverDirection? = null
    private var encodingBeforeScreen: SenderEncodingSnapshot? = null

    private val localAudio: AudioTrack? = audioSource?.let { factory.createAudioTrack("$AUDIO_TRACK_ID-${nextId()}", it) }
    private val localVideo: VideoTrack? = videoSource?.let { factory.createVideoTrack("$VIDEO_TRACK_ID-${nextId()}", it) }

    private val observer = object : PeerConnection.Observer {
        override fun onIceCandidate(candidate: IceCandidate) = listener.onIceCandidate(candidate)

        override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) {
            newState?.let(listener::onConnectionChange)
        }

        override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) {
            when (val track = receiver.track()) {
                is VideoTrack -> listener.onRemoteVideo(track)
                is AudioTrack -> track.setEnabled(true)
                else -> Unit
            }
        }

        override fun onSignalingChange(state: PeerConnection.SignalingState?) = Unit
        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) = Unit
        override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) = Unit
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) = Unit
        override fun onAddStream(stream: MediaStream?) = Unit
        override fun onRemoveStream(stream: MediaStream?) = Unit
        override fun onDataChannel(channel: DataChannel?) = Unit
        override fun onRenegotiationNeeded() = Unit
    }

    private val configuration = rtcConfiguration(config.iceServers, ICE_CANDIDATE_POOL_SIZE)

    private val peer: PeerConnection = factory.createPeerConnection(configuration, observer)
        ?: run {
            disposeLocalTracks()
            throw WebRtcError.ConfigureFailed("PeerConnectionFactory returned no mesh peer connection")
        }

    /** `true` quand aucune offre n'est en suspens d'un côté ni de l'autre (négociation parfaite). */
    public val isStable: Boolean
        get() = !closed.get() && runCatching { peer.signalingState() == PeerConnection.SignalingState.STABLE }.getOrDefault(false)

    /** `true` quand ma propre offre attend sa réponse. */
    public val awaitsAnswer: Boolean
        get() = !closed.get() && runCatching { peer.signalingState() == PeerConnection.SignalingState.HAVE_LOCAL_OFFER }.getOrDefault(false)

    public suspend fun createOffer(iceRestart: Boolean = false): SessionDescription {
        val pc = live()
        addOffererTransceiversIfNeeded(pc)
        if (iceRestart) pc.restartIce()
        return pc.awaitCreate(isOffer = true)
    }

    public suspend fun createAnswer(): SessionDescription = live().awaitCreate(isOffer = false)

    public suspend fun setLocalDescription(desc: SessionDescription) {
        live().awaitApply(desc, local = true)
        if (screen != null && encodingBeforeScreen == null) {
            transceiverOf(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO)?.let { encodeScreen(it) }
        }
    }

    /** Collision d'offres, côté poli : ma propre offre s'efface pour accepter celle du membre. */
    public suspend fun rollback() {
        live().awaitApply(SessionDescription(SessionDescription.Type.ROLLBACK, ""), local = true)
    }

    /** La description du membre ; une offre accroche ensuite mes pistes. Un SDP invalide lève sans toucher le pair. */
    public suspend fun setRemoteDescription(desc: SessionDescription) {
        WebRtcSdpRules.requireValidRemoteSdp(desc.description)
        val pc = live()
        pc.awaitApply(desc, local = false)
        if (desc.type == SessionDescription.Type.OFFER) attachAnswererTracks(pc)
        hasRemoteDescription = true
        val queued = synchronized(pendingCandidates) { pendingCandidates.toList().also { pendingCandidates.clear() } }
        queued.forEach { pc.addIceCandidate(it) }
    }

    /** Candidat du membre : gardé (64 au plus) tant que sa description manque, sinon posé. */
    public fun addIceCandidate(candidate: IceCandidate) {
        if (closed.get() || candidate.sdp.length > MAX_CANDIDATE_LENGTH) return
        if (hasRemoteDescription) {
            peer.addIceCandidate(candidate)
            return
        }
        synchronized(pendingCandidates) {
            pendingCandidates += candidate
            while (pendingCandidates.size > MAX_PENDING_CANDIDATES) pendingCandidates.removeAt(0)
        }
    }

    /** Mon micro part (ou plus) sur ce lien. */
    public fun setSendsAudio(enabled: Boolean) {
        sendsAudio = enabled
        localAudio?.setEnabled(enabled)
    }

    /** Ma caméra part (ou plus) sur ce lien, sans renégocier quand l'émetteur vidéo existe déjà ; l'écran partagé garde sa place. */
    public fun setSendsVideo(enabled: Boolean) {
        sendsVideo = enabled
        if (screen != null) return
        val video = localVideo ?: return
        transceiverOf(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO)?.sender?.setTrack(video.takeIf { enabled }, false)
    }

    /**
     * L'écran partagé part sur ce lien à la place de ma caméra (#13755), comme sur le pair de l'appel : la piste de
     * l'émetteur vidéo est REMPLACÉE, sans offre quand il émettait déjà ; un émetteur qui ne faisait que recevoir
     * passe en envoi et le lien offre à nouveau ([CallMeshPeerListener.onRenegotiationNeeded]). `null` rend la caméra
     * (ou la réception seule) et l'encodage d'avant. Un lien pas encore négocié porte l'écran dès son offre ou sa réponse.
     */
    public fun setScreenTrack(track: VideoTrack?) {
        if (closed.get() || screen === track) return
        val sharing = track != null
        val wasSharing = screen != null
        screen = track
        val transceiver = transceiverOf(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO) ?: return
        if (sharing && !wasSharing) startScreen(transceiver) else if (!sharing) stopScreen(transceiver) else transceiver.sender.setTrack(track, false)
    }

    private fun startScreen(transceiver: RtpTransceiver) {
        val before = transceiver.direction
        val plan = ScreenShareSenderLaw.begin(hasVideoSender = true, wasSending = before.isSending)
        directionBeforeScreen = before
        transceiver.sender.setTrack(screen, false)
        transceiver.setDirection(RtpTransceiverDirection.SEND_RECV)
        encodeScreen(transceiver)
        if (plan.needsRenegotiation) listener.onRenegotiationNeeded()
    }

    /** Un écran se LIT : l'encodage du partage d'iOS ([ScreenShareEncodingLaw]), l'encodage d'avant gardé pour l'arrêt. */
    private fun encodeScreen(transceiver: RtpTransceiver) {
        encodingBeforeScreen = runCatching {
            ScreenShareSenderEncoding.read(transceiver.sender).also {
                ScreenShareSenderEncoding.write(transceiver.sender, ScreenShareEncodingLaw.during(it))
            }
        }.getOrNull()
    }

    private fun stopScreen(transceiver: RtpTransceiver) {
        val before = directionBeforeScreen
        encodingBeforeScreen?.let { snapshot -> runCatching { ScreenShareSenderEncoding.write(transceiver.sender, snapshot) } }
        transceiver.sender.setTrack(outgoingVideo(), false)
        transceiver.setDirection(before ?: RtpTransceiverDirection.SEND_RECV)
        directionBeforeScreen = null
        encodingBeforeScreen = null
        if (ScreenShareSenderLaw.end(wasSendingBefore = before.isSending).needsRenegotiation) listener.onRenegotiationNeeded()
    }

    /** Ce que l'émetteur vidéo porte : l'écran partagé d'abord, sinon ma caméra si elle part. */
    private fun outgoingVideo(): VideoTrack? = screen ?: localVideo?.takeIf { sendsVideo }

    private val RtpTransceiverDirection?.isSending: Boolean
        get() = this == RtpTransceiverDirection.SEND_RECV || this == RtpTransceiverDirection.SEND_ONLY

    public fun updateIceServers(servers: List<SocketIceServer>): Boolean {
        if (closed.get()) return false
        configuration.iceServers = servers.map { it.toIceServer() }
        return peer.setConfiguration(configuration)
    }

    /** Le niveau sonore reçu de ce membre (`inbound-rtp` audio), `null` une fois fermé ou sans mesure. */
    public suspend fun inboundAudioLevel(): Double? =
        if (closed.get()) null else CallInboundAudioLevel.read { callback -> live().getStats(callback) }

    /** Libère le pair et ses pistes ; idempotent. */
    public fun close() {
        if (!closed.compareAndSet(false, true)) return
        synchronized(pendingCandidates) { pendingCandidates.clear() }
        peer.dispose()
        disposeLocalTracks()
        onClosed(this)
    }

    private fun disposeLocalTracks() {
        localAudio?.dispose()
        localVideo?.dispose()
    }

    private fun addOffererTransceiversIfNeeded(pc: PeerConnection) {
        if (pc.transceivers.isNotEmpty()) return
        val audio = pc.addTransceiver(
            MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO,
            RtpTransceiver.RtpTransceiverInit(RtpTransceiverDirection.SEND_RECV, listOf(STREAM_ID)),
        )
        localAudio?.setEnabled(sendsAudio)
        audio?.sender?.setTrack(localAudio, false)
        val carriesVideo = localVideo != null || screen != null
        val direction = if (carriesVideo) RtpTransceiverDirection.SEND_RECV else RtpTransceiverDirection.RECV_ONLY
        val video = pc.addTransceiver(
            MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO,
            RtpTransceiver.RtpTransceiverInit(direction, listOf(STREAM_ID)),
        )
        if (carriesVideo) video?.sender?.setTrack(outgoingVideo(), false)
        if (screen != null) directionBeforeScreen = if (localVideo != null) RtpTransceiverDirection.SEND_RECV else RtpTransceiverDirection.RECV_ONLY
    }

    private fun attachAnswererTracks(pc: PeerConnection) {
        pc.transceivers.forEach { transceiver ->
            runCatching {
                when (transceiver.mediaType) {
                    MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO -> {
                        val audio = localAudio ?: return@runCatching
                        audio.setEnabled(sendsAudio)
                        transceiver.sender.setTrack(audio, false)
                        transceiver.setDirection(RtpTransceiverDirection.SEND_RECV)
                    }
                    MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO -> {
                        if (localVideo == null && screen == null) return@runCatching
                        if (screen != null) directionBeforeScreen = if (localVideo != null) RtpTransceiverDirection.SEND_RECV else transceiver.direction
                        transceiver.sender.setTrack(outgoingVideo(), false)
                        transceiver.setDirection(RtpTransceiverDirection.SEND_RECV)
                    }
                    else -> Unit
                }
            }
        }
    }

    private fun transceiverOf(type: MediaStreamTrack.MediaType): RtpTransceiver? =
        if (closed.get()) null else peer.transceivers.firstOrNull { it.mediaType == type }

    /** Le pair tant qu'il vit : après [close] il est disposé, et le toucher planterait dans libwebrtc. */
    private fun live(): PeerConnection {
        if (closed.get()) throw WebRtcError.NoPeerConnection()
        return peer
    }

    private companion object {
        const val ICE_CANDIDATE_POOL_SIZE = 2
        const val MAX_PENDING_CANDIDATES = 64
        const val MAX_CANDIDATE_LENGTH = 4_096
        const val AUDIO_TRACK_ID = "meeshy_mesh_audio"
        const val VIDEO_TRACK_ID = "meeshy_mesh_video"
        const val STREAM_ID = "meeshy-mesh"

        private val counter = java.util.concurrent.atomic.AtomicLong()

        fun nextId(): Long = counter.incrementAndGet()
    }
}
