package me.meeshy.sdk.call

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import me.meeshy.sdk.model.call.IceCandidateLine
import me.meeshy.sdk.model.call.RemoteDescriptionGuard
import me.meeshy.sdk.model.call.RemoteDescriptionGuard.CandidateRoute
import me.meeshy.sdk.model.call.RemoteDescriptionGuard.DescriptionType
import me.meeshy.sdk.model.call.RemoteDescriptionGuard.Verdict
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.WebRtcError
import me.meeshy.sdk.model.call.WebRtcSdpRules
import org.webrtc.AudioTrack
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.VideoTrack
import org.webrtc.audio.JavaAudioDeviceModule
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

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
) {
    @Inject
    constructor(
        @ApplicationContext appContext: Context,
        activityGate: CallActivityGate,
    ) : this(appContext, { buildStack(appContext) }, activityGate)

    private val stack = lazy(stackProvider)
    private val media = CallMediaSources(appContext, stack)
    private val engineEvents = CallEngineEvents(onRemoteDataChannel = ::adoptRemoteDataChannel)
    private val remoteDescriptions = RemoteDescriptionGuard()
    private val dataMessages = MutableSharedFlow<ByteArray>(extraBufferCapacity = 64)

    private var peerConnection: PeerConnection? = null
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
        val config = PeerConnection.RTCConfiguration(iceServers.map { it.toIceServer() }).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
            rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
            iceCandidatePoolSize = ICE_CANDIDATE_POOL_SIZE
        }
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

    suspend fun createOffer(): SessionDescription = createSdp(isOffer = true)

    suspend fun createAnswer(): SessionDescription = createSdp(isOffer = false)

    private suspend fun createSdp(isOffer: Boolean): SessionDescription {
        if (isOffer) {
            peerConnection?.let { media.attachForOffer(it) }
            ensureDataChannel()
        }
        val created = suspendCancellableCoroutine<SessionDescription> { cont ->
            val pc = peerConnection ?: return@suspendCancellableCoroutine cont.resumeWithException(
                WebRtcError.NoPeerConnection(),
            )
            val observer = object : SdpObserver {
                override fun onCreateSuccess(desc: SessionDescription) = cont.resume(desc)
                override fun onCreateFailure(error: String?) =
                    cont.resumeWithException(WebRtcError.FailedToCreateSdp(error.orEmpty()))
                override fun onSetSuccess() = Unit
                override fun onSetFailure(error: String?) = Unit
            }
            val constraints = MediaConstraints()
            if (isOffer) pc.createOffer(observer, constraints) else pc.createAnswer(observer, constraints)
        }
        return localSdpTransformer.transform(created)
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

    private suspend fun applyDescription(desc: SessionDescription, local: Boolean): Unit =
        suspendCancellableCoroutine { cont ->
            val pc = peerConnection ?: return@suspendCancellableCoroutine cont.resumeWithException(
                WebRtcError.NoPeerConnection(),
            )
            val observer = object : SdpObserver {
                override fun onCreateSuccess(desc: SessionDescription?) = Unit
                override fun onCreateFailure(error: String?) = Unit
                override fun onSetSuccess() = cont.resume(Unit)
                override fun onSetFailure(error: String?) =
                    cont.resumeWithException(WebRtcError.SetDescriptionFailed(error.orEmpty()))
            }
            if (local) pc.setLocalDescription(observer, desc) else pc.setRemoteDescription(observer, desc)
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

    fun close() {
        dataChannel?.close()
        dataChannel = null
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

    private fun SocketIceServer.toIceServer(): PeerConnection.IceServer =
        PeerConnection.IceServer.builder(urls)
            .setUsername(username.orEmpty())
            .setPassword(credential.orEmpty())
            .createIceServer()

    private companion object {
        const val ICE_CANDIDATE_POOL_SIZE = 4

        @Volatile
        private var globalInitDone = false

        fun buildStack(context: Context): WebRtcStack {
            ensureGlobalInit(context)
            val egl = EglBase.create()
            val audioDevice = JavaAudioDeviceModule.builder(context)
                .setUseHardwareAcousticEchoCanceler(true)
                .setUseHardwareNoiseSuppressor(true)
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
