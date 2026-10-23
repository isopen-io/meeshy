package me.meeshy.sdk.call

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import me.meeshy.sdk.model.call.SocketIceServer
import org.webrtc.AudioTrack
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
    private val engineEvents = CallEngineEvents()

    private var peerConnection: PeerConnection? = null

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

    /** Lecture du pair courant, `null` hors appel. */
    val peerHandle: CallPeerHandle?
        get() = peerConnection?.let { PeerConnectionHandle(it) { engineEvents.dataChannels } }

    /** Ouvre un pair neuf configuré avec les serveurs ICE par utilisateur de la passerelle. */
    fun createConnection(iceServers: List<SocketIceServer>, enableVideo: Boolean = false) {
        close()
        val config = PeerConnection.RTCConfiguration(iceServers.map { it.toIceServer() }).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
            rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
        }
        val peer = stack.value.factory.createPeerConnection(config, engineEvents.observer)
        peerConnection = peer
        peer ?: return
        activityGate.setActive(true)
        media.attachAudio(peer)
        if (enableVideo) media.attachVideo(peer)
    }

    fun setAudioEnabled(enabled: Boolean) = media.setAudioEnabled(enabled)

    fun setVideoEnabled(enabled: Boolean) = media.setVideoEnabled(enabled)

    suspend fun createOffer(): SessionDescription = createSdp(isOffer = true)

    suspend fun createAnswer(): SessionDescription = createSdp(isOffer = false)

    private suspend fun createSdp(isOffer: Boolean): SessionDescription {
        val created = suspendCancellableCoroutine<SessionDescription> { cont ->
            val pc = peerConnection ?: return@suspendCancellableCoroutine cont.resumeWithException(
                IllegalStateException("createSdp: no peer connection"),
            )
            val observer = object : SdpObserver {
                override fun onCreateSuccess(desc: SessionDescription) = cont.resume(desc)
                override fun onCreateFailure(error: String?) =
                    cont.resumeWithException(RuntimeException("createSdp failed: $error"))
                override fun onSetSuccess() = Unit
                override fun onSetFailure(error: String?) = Unit
            }
            val constraints = MediaConstraints()
            if (isOffer) pc.createOffer(observer, constraints) else pc.createAnswer(observer, constraints)
        }
        return localSdpTransformer.transform(created)
    }

    suspend fun setLocalDescription(desc: SessionDescription) = applyDescription(desc, local = true)

    suspend fun setRemoteDescription(desc: SessionDescription) = applyDescription(desc, local = false)

    private suspend fun applyDescription(desc: SessionDescription, local: Boolean): Unit =
        suspendCancellableCoroutine { cont ->
            val pc = peerConnection ?: return@suspendCancellableCoroutine cont.resumeWithException(
                IllegalStateException("setDescription: no peer connection"),
            )
            val observer = object : SdpObserver {
                override fun onCreateSuccess(desc: SessionDescription?) = Unit
                override fun onCreateFailure(error: String?) = Unit
                override fun onSetSuccess() = cont.resume(Unit)
                override fun onSetFailure(error: String?) =
                    cont.resumeWithException(RuntimeException("setDescription failed: $error"))
            }
            if (local) pc.setLocalDescription(observer, desc) else pc.setRemoteDescription(observer, desc)
        }

    fun addIceCandidate(candidate: IceCandidate) {
        peerConnection?.addIceCandidate(candidate)
    }

    /**
     * Marque la connexion pour un redémarrage ICE : la prochaine [createOffer] porte de nouveaux
     * ufrag/pwd pour recollecter les candidats sur le réseau COURANT (bascule WiFi→LTE). Brique
     * pure — QUAND redémarrer relève de la politique du coordinateur applicatif.
     */
    fun restartIce() {
        peerConnection?.restartIce()
    }

    fun close() {
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
        @Volatile
        private var globalInitDone = false

        fun buildStack(context: Context): WebRtcStack {
            ensureGlobalInit(context)
            val egl = EglBase.create()
            val factory = PeerConnectionFactory.builder()
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
