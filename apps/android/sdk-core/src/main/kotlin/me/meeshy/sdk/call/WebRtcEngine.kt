package me.meeshy.sdk.call

import android.content.Context
import android.media.projection.MediaProjection
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.call.screen.CallScreenFeeds
import me.meeshy.sdk.call.screen.CallScreenShareRoute
import me.meeshy.sdk.call.screen.ScreenFeedFactory
import me.meeshy.sdk.model.call.IceCandidateLine
import me.meeshy.sdk.model.call.RemoteDescriptionGuard
import me.meeshy.sdk.model.call.RemoteDescriptionGuard.CandidateRoute
import me.meeshy.sdk.model.call.RemoteDescriptionGuard.DescriptionType
import me.meeshy.sdk.model.call.RemoteDescriptionGuard.Verdict
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.WebRtcError
import me.meeshy.sdk.model.call.WebRtcSdpRules
import org.webrtc.AudioTrack
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.SessionDescription
import org.webrtc.VideoTrack
import org.webrtc.audio.JavaAudioDeviceModule
import java.util.concurrent.CopyOnWriteArraySet
import javax.inject.Inject
import javax.inject.Singleton

/** La pile WebRTC native : le contexte EGL et la fabrique de pairs, nés ENSEMBLE au premier appel. */
internal class WebRtcStack(val eglBase: EglBase, val factory: PeerConnectionFactory)

/**
 * Façade du `PeerConnection` d'un appel (SDK, avec état). Le moteur est un `@Singleton` mais ne coûte
 * RIEN au démarrage à froid : ni [EglBase] ni [PeerConnectionFactory] n'existent avant la première
 * [createConnection] (ils pesaient 983 des 1 318 échantillons du fil principal côté iOS, #7955).
 *
 * Les sources locales vivent dans [CallMediaSources], les événements du pair dans [CallEngineEvents],
 * la lecture du pair dans [CallPeerHandle] et la réécriture du SDP local dans [LocalSdpTransformer].
 * Pendant l'appel, [CallActivityGate] garde la socket de signalisation ouverte.
 */
@Singleton
class WebRtcEngine internal constructor(
    appContext: Context,
    stackProvider: () -> WebRtcStack,
    private val activityGate: CallActivityGate,
    screenFeeds: ScreenFeedFactory? = null,
) {
    @Inject
    constructor(
        @ApplicationContext appContext: Context,
        activityGate: CallActivityGate,
        microphoneSamples: CallMicrophoneSamples,
    ) : this(appContext, { buildStack(appContext, microphoneSamples) }, activityGate)

    private val stack = lazy(stackProvider)
    private val media = CallMediaSources(appContext, stack)
    private val engineEvents = CallEngineEvents(onRemoteDataChannel = ::adoptRemoteDataChannel)
    private val remoteDescriptions = RemoteDescriptionGuard()
    private val dataMessages = MutableSharedFlow<ByteArray>(extraBufferCapacity = 64)
    private val screenShare = CallScreenShareRoute(screenFeeds ?: CallScreenFeeds(appContext, stack))
    private val renegotiations = MutableSharedFlow<Unit>(extraBufferCapacity = 8)

    private var peerConnection: PeerConnection? = null
    private val previewPeers = CopyOnWriteArraySet<CallPreviewPeer>()
    private val meshPeers = CopyOnWriteArraySet<CallMeshPeer>()
    private var configuration: PeerConnection.RTCConfiguration? = null
    private var dataChannel: CallDataChannel? = null

    /** Le contexte EGL partagé ; le lire avant tout appel construit la pile (rendu vidéo). */
    val eglBase: EglBase get() = stack.value.eglBase

    /** Vrai tant que la pile native n'a pas été construite : aucun appel n'a encore eu lieu. */
    internal val isStackBuilt: Boolean get() = stack.isInitialized()

    /** Réécriture du SDP local ; identité par défaut. */
    @Volatile
    var localSdpTransformer: LocalSdpTransformer = LocalSdpTransformer.Identity

    /** La piste d'aperçu caméra, présente seulement pendant une capture vidéo. */
    val localVideoTrack: VideoTrack? get() = media.localVideoTrack

    val localIceCandidates: SharedFlow<IceCandidate> = engineEvents.localIceCandidates
    val iceConnectionState: StateFlow<PeerConnection.IceConnectionState> = engineEvents.iceConnectionState
    val remoteAudioTracks: SharedFlow<AudioTrack> = engineEvents.remoteTracks.audio
    val remoteVideoTracks: SharedFlow<VideoTrack> = engineEvents.remoteTracks.video

    /** Canal de données, renégociation, état de connexion complet. */
    val events: SharedFlow<CallEngineEvent> = engineEvents.events

    /**
     * Le pair doit recevoir une offre : la direction de l'émetteur vidéo a changé (partage d'écran d'un
     * appel audio). Le négociateur de l'appel l'émet, comme iOS `screenShareNeedsRenegotiation`.
     */
    val renegotiationRequests: SharedFlow<Unit> = renegotiations.asSharedFlow()

    /** Vrai tant que la piste d'écran occupe l'émetteur vidéo. */
    val isScreenSharing: Boolean get() = screenShare.isSharing

    /** Trames reçues sur le canal de données « transcription », brutes (bye, ping, sous-titres). */
    val dataChannelMessages: SharedFlow<ByteArray> = dataMessages.asSharedFlow()

    /** Lecture du pair courant, `null` hors appel. */
    val peerHandle: CallPeerHandle?
        get() = peerConnection?.let { PeerConnectionHandle(it) { engineEvents.dataChannels } }

    /**
     * Ouvre un pair neuf configuré avec les serveurs ICE par utilisateur de la passerelle. Les pistes
     * locales naissent ici mais ne sont attachées qu'à [createOffer] (offreur) ou après
     * [setRemoteDescription] (répondeur). @throws WebRtcError.ConfigureFailed si la fabrique ne rend pas de pair.
     */
    fun createConnection(iceServers: List<SocketIceServer>, enableVideo: Boolean = false) {
        close()
        val config = rtcConfiguration(iceServers, ICE_CANDIDATE_POOL_SIZE)
        val peer = stack.value.factory.createPeerConnection(config, engineEvents.observer)
            ?: throw WebRtcError.ConfigureFailed("PeerConnectionFactory returned no peer connection")
        peerConnection = peer
        configuration = config
        activityGate.setActive(true)
        media.prepareAudio()
        if (enableVideo) media.prepareVideo()
    }

    /**
     * Change les serveurs ICE (rafraîchissement TURN) SANS reconnexion : `setConfiguration` sur le pair
     * vivant. `false` hors appel ou si libwebrtc refuse la configuration.
     */
    fun updateIceServers(iceServers: List<SocketIceServer>): Boolean {
        val peer = peerConnection ?: return false
        val config = configuration ?: return false
        config.iceServers = iceServers.map { it.toIceServer() }
        return peer.setConfiguration(config)
    }

    /**
     * Ouvre le canal « transcription » côté offreur (idempotent : une renégociation repasse par
     * [createOffer] et ne doit jamais empiler un second canal). Le répondeur adopte celui du pair.
     */
    fun ensureDataChannel(): Boolean {
        if (dataChannel != null) return true
        val peer = peerConnection ?: return false
        val channel = peer.createDataChannel(CallDataChannel.LABEL, DataChannel.Init().apply { ordered = true })
            ?: return false
        dataChannel = newCallDataChannel(channel)
        return true
    }

    /** Envoie une trame sur le canal de données ; `false` s'il n'est pas ouvert. */
    fun sendDataChannelMessage(bytes: ByteArray): Boolean = dataChannel?.send(bytes) ?: false

    private fun adoptRemoteDataChannel(channel: DataChannel) {
        if (channel.label() != CallDataChannel.LABEL) return
        dataChannel?.close()
        dataChannel = newCallDataChannel(channel)
    }

    private fun newCallDataChannel(channel: DataChannel): CallDataChannel = CallDataChannel(
        channel = channel,
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
        onMessage = { dataMessages.tryEmit(it) },
    )

    fun setAudioEnabled(enabled: Boolean) = media.setAudioEnabled(enabled)

    fun setVideoEnabled(enabled: Boolean) = media.setVideoEnabled(enabled)

    /** Les effets de ma caméra (flou du fond, lissage, teinte), sur l'image envoyée ; aucune renégociation. */
    fun setVideoEffects(config: VideoFilterConfig) = media.setVideoEffects(config)

    fun switchCamera(onSwitched: (isFront: Boolean?) -> Unit) = media.switchCamera(onSwitched)

    /**
     * Partage l'écran de [projection] à la place de ma caméra (#13332), sans renégocier quand l'émetteur
     * vidéo émettait déjà. @throws WebRtcError.NoPeerConnection hors appel, WebRtcError.ConfigureFailed si
     * la capture est refusée.
     */
    fun beginScreenShare(projection: MediaProjection) {
        val peer = peerConnection ?: throw WebRtcError.NoPeerConnection()
        if (screenShare.begin(peer, projection, media.localVideoTrack)) renegotiations.tryEmit(Unit)
        meshPeers.forEach { it.setScreenTrack(screenShare.track) }
    }

    /**
     * Arrête le partage : l'émetteur vidéo retrouve la caméra (et ses effets) ou repasse en réception, sur le pair de
     * l'appel comme sur chaque lien du maillage — avant que la piste d'écran ne soit libérée.
     */
    fun endScreenShare() {
        meshPeers.forEach { it.setScreenTrack(null) }
        if (peerConnection == null) return screenShare.release()
        if (screenShare.end()) renegotiations.tryEmit(Unit)
    }

    /** Le zoom de ma caméra (pincement, objectifs, retour à 1×). */
    val cameraZoom: me.meeshy.sdk.call.camera.CallCameraZoom get() = media.zoom

    suspend fun createOffer(): SessionDescription = createSdp(isOffer = true)

    suspend fun createAnswer(): SessionDescription = createSdp(isOffer = false)

    private suspend fun createSdp(isOffer: Boolean): SessionDescription {
        if (isOffer) {
            peerConnection?.let { media.attachForOffer(it) }
            ensureDataChannel()
        }
        val pc = peerConnection ?: throw WebRtcError.NoPeerConnection()
        return localSdpTransformer.transform(pc.awaitCreate(isOffer))
    }

    suspend fun setLocalDescription(desc: SessionDescription) {
        applyDescription(desc, local = true)
        if (desc.type == SessionDescription.Type.OFFER) remoteDescriptions.onLocalOfferSet()
    }

    /**
     * Applique la description du pair. Un SDP invalide lève [WebRtcError.InvalidRemoteDescription] SANS
     * toucher le pair (l'appel sain continue) ; un doublon ou une réponse périmée (rejeu de la passerelle
     * après reconnexion) est ignoré sans échec. Répondeur : les pistes locales s'accrochent aux transceivers
     * de l'offre APRÈS l'application, puis les candidats arrivés trop tôt sont posés.
     */
    suspend fun setRemoteDescription(desc: SessionDescription) {
        val type = when (desc.type) {
            SessionDescription.Type.OFFER -> DescriptionType.Offer
            SessionDescription.Type.ANSWER -> DescriptionType.Answer
            else -> throw WebRtcError.UnsupportedDescription(desc.type.name)
        }
        WebRtcSdpRules.requireValidRemoteSdp(desc.description)
        if (remoteDescriptions.judge(type, desc.description) != Verdict.Apply) return
        applyDescription(desc, local = false)
        val pc = peerConnection ?: return
        if (type == DescriptionType.Offer) media.attachForAnswer(pc)
        remoteDescriptions.onApplied(type, desc.description).forEach { pc.addIceCandidate(it.toIceCandidate()) }
    }

    private suspend fun applyDescription(desc: SessionDescription, local: Boolean) {
        val pc = peerConnection ?: throw WebRtcError.NoPeerConnection()
        pc.awaitApply(desc, local)
    }

    /** Candidat du pair : refusé hors bornes, gardé tant que la description distante manque, sinon posé. */
    fun addIceCandidate(candidate: IceCandidate) {
        val pc = peerConnection ?: return
        val line = IceCandidateLine(candidate.sdpMid, candidate.sdpMLineIndex, candidate.sdp)
        if (remoteDescriptions.route(line) == CandidateRoute.ApplyNow) pc.addIceCandidate(candidate)
    }

    private fun IceCandidateLine.toIceCandidate() = IceCandidate(sdpMid, sdpMLineIndex, line)

    /**
     * Marque la connexion pour un redémarrage ICE : la prochaine [createOffer] porte de nouveaux
     * ufrag/pwd pour recollecter les candidats sur le réseau COURANT (bascule WiFi→LTE). Brique
     * pure — QUAND redémarrer relève de la politique du coordinateur applicatif.
     */
    fun restartIce() {
        peerConnection?.restartIce()
    }

    /**
     * Ouvre un lien d'aperçu avant décroché, À CÔTÉ du pair de l'appel (qu'il ne touche jamais). Chez
     * l'appelant, ses pistes sont tirées des sources de l'appel en cours ; un lien en réception seule
     * n'en tire aucune et survit à [close] (au décroché, il tient jusqu'à la connexion du vrai lien).
     * @throws WebRtcError.ConfigureFailed si la fabrique ne rend pas de pair.
     */
    fun openPreviewPeer(config: CallPreviewPeerConfig, listener: CallPreviewPeerListener): CallPreviewPeer {
        val peer = CallPreviewPeer(
            factory = stack.value.factory,
            config = config,
            listener = listener,
            audioSource = media.sharedAudioSource,
            videoSource = media.sharedVideoSource,
            onClosed = { previewPeers.remove(it) },
        )
        previewPeers += peer
        return peer
    }

    /**
     * Ouvre une connexion du maillage d'un appel de groupe (#13740), À CÔTÉ du pair de l'appel : ses pistes
     * sont tirées des sources de l'appel en cours (micro, caméra s'il y en a une, l'écran s'il est partagé —
     * #13755), et [close] la ferme avant elles. @throws WebRtcError.ConfigureFailed si la fabrique ne rend pas de pair.
     */
    fun openMeshPeer(config: CallMeshPeerConfig, listener: CallMeshPeerListener): CallMeshPeer {
        val peer = CallMeshPeer(
            factory = stack.value.factory,
            config = config,
            listener = listener,
            audioSource = media.sharedAudioSource,
            videoSource = media.sharedVideoSource,
            screenTrack = screenShare.track,
            onClosed = { meshPeers.remove(it) },
        )
        meshPeers += peer
        return peer
    }

    fun close() {
        // Les liens du maillage tirent leurs pistes des sources de l'appel : ils meurent AVANT elles.
        meshPeers.forEach { it.close() }
        // Un aperçu qui émet tire ses pistes des sources de l'appel : il meurt AVANT elles.
        previewPeers.filter { it.usesCallSources }.forEach { it.close() }
        dataChannel?.close()
        dataChannel = null
        screenShare.release()
        remoteDescriptions.reset()
        configuration = null
        media.releaseVideo()
        peerConnection?.dispose()
        peerConnection = null
        media.releaseAudio()
        // Le moteur est un @Singleton réutilisé par l'appel SUIVANT : sans oublier les pistes
        // distantes ici, un nouvel abonné à remoteVideoTracks se verrait rejouer la VideoTrack
        // disposée de l'appel qui vient de finir.
        engineEvents.reset()
        activityGate.setActive(false)
    }

    private companion object {
        const val ICE_CANDIDATE_POOL_SIZE = 4

        @Volatile
        private var globalInitDone = false

        fun buildStack(context: Context, microphoneSamples: CallMicrophoneSamples): WebRtcStack {
            ensureGlobalInit(context)
            val egl = EglBase.create()
            val audioDevice = JavaAudioDeviceModule.builder(context)
                .setUseHardwareAcousticEchoCanceler(true)
                .setUseHardwareNoiseSuppressor(true)
                .setSamplesReadyCallback(microphoneSamples.callback)
                .createAudioDeviceModule()
            val factory = PeerConnectionFactory.builder()
                .setAudioDeviceModule(audioDevice)
                .setVideoEncoderFactory(DefaultVideoEncoderFactory(egl.eglBaseContext, true, true))
                .setVideoDecoderFactory(DefaultVideoDecoderFactory(egl.eglBaseContext))
                .createPeerConnectionFactory()
            return WebRtcStack(egl, factory)
        }

        /** `PeerConnectionFactory.initialize` doit tourner exactement une fois par processus. */
        @Synchronized
        fun ensureGlobalInit(context: Context) {
            if (globalInitDone) return
            PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(context.applicationContext)
                    .createInitializationOptions(),
            )
            globalInitDone = true
        }
    }
}
