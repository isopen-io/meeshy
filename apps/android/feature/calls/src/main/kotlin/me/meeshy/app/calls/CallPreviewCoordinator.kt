package me.meeshy.app.calls

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallPreviewConsent
import me.meeshy.sdk.model.call.CallPreviewControl
import me.meeshy.sdk.model.call.CallPreviewExposure
import me.meeshy.sdk.model.call.CallPreviewIce
import me.meeshy.sdk.model.call.CallPreviewPhase
import me.meeshy.sdk.model.call.CallPreviewRequested
import me.meeshy.sdk.model.call.CallSignalEnvelope
import me.meeshy.sdk.model.call.SocketIceServer
import org.webrtc.VideoTrack
import javax.inject.Inject

/**
 * **L'APERÇU AVANT DÉCROCHÉ** (#8480) — la jumelle Android d'iOS `CallPreviewCoordinator`.
 *
 * - **Appelé** : dès que l'appel 1:1 sonne, il demande l'aperçu (`call:preview-request`). L'offre de
 *   l'APPELANT, et de lui seul, ouvre un lien en RÉCEPTION SEULE : ni micro ni caméra n'y partent,
 *   ils attendent le décroché et le vrai lien. Ce qu'il reçoit s'affiche derrière la sonnerie, muet
 *   tant qu'on n'active pas le son.
 * - **Appelant** : une demande pour SON appel qui sonne ouvre un lien qui offre ce qu'il a choisi
 *   pour CE correspondant (#8795 — micro coupé et caméra activée pour un contact jamais appelé),
 *   dans la limite des médias de l'appel. L'appelé lui dit, par le canal de contrôle du lien, quand
 *   il a activé le son.
 *
 * Tout passe par `call:preview-signal`, jamais par `call:signal`, où une réponse décrocherait
 * l'appel. Au décroché l'aperçu tient jusqu'à la connexion du vrai lien (#8627) ; au refus, à la
 * fin ou à l'appel manqué il se ferme et rend le son. Un fil : le principal, celui du [CallViewModel].
 */
class CallPreviewCoordinator @Inject constructor(
    private val links: CallPreviewLinkFactory,
    private val signaling: CallPreviewSignaling,
    private val consents: CallPreviewConsentStoring,
) {
    private val _ui = MutableStateFlow(CallPreviewUi())
    val ui: StateFlow<CallPreviewUi> = _ui.asStateFlow()

    private var scope: CoroutineScope? = null
    private var host: CallPreviewHostActions? = null

    private var state = CallPreviewHostState.IDLE
    private var link: CallPreviewLink? = null
    private var linkCallId: String? = null
    private var linkGeneration = 0
    private var linkReceivesOnly = false
    private var requestedCallId: String? = null
    private var consentCallId: String? = null
    private var hostHearsPreview = false
    private val iceServers = mutableMapOf<String, List<SocketIceServer>>()

    private var video: VideoTrack? = null
    private var isPreviewConnected = false
    private var isAudible = false
    private var reachesCallee = false
    private var isHeardByCallee = false
    private var outgoingConsent = CallPreviewConsent.INITIAL

    /** Branche l'aperçu sur l'appel : [scope] est celui du [CallViewModel], la passerelle s'y écoute. */
    fun attach(scope: CoroutineScope, host: CallPreviewHostActions) {
        this.scope = scope
        this.host = host
        signaling.requested.onEach(::onRequested).launchIn(scope)
        signaling.signals.onEach(::onSignal).launchIn(scope)
    }

    // --- L'appel ---

    fun sync(next: CallPreviewHostState) {
        if (next == state) return
        val previous = state
        state = next
        if (next.callId != previous.callId) resetCall(previous)
        when (next.phase) {
            CallPreviewPhase.IncomingRinging -> requestPreviewIfNeeded()
            CallPreviewPhase.OutgoingRinging -> {
                adoptConsentIfNeeded()
                followLocalMedia(previous)
            }
            CallPreviewPhase.Answering -> Unit
            CallPreviewPhase.Connected -> endPreview(silencing = false)
            CallPreviewPhase.Ended, CallPreviewPhase.None -> endPreview(silencing = true)
        }
        publish()
    }

    /** L'écran est détruit : le lien se libère, l'hôte (qui part aussi) n'est plus touché. */
    fun release() {
        hostHearsPreview = false
        endPreview(silencing = false)
        publish()
    }

    // --- Appelé : le son ---

    /** « Activer l'audio » : proposé d'emblée, le choix est retenu tant que l'appelant n'est pas arrivé. */
    fun toggleSound() {
        if (!offersSound) return
        isAudible = !isAudible
        link?.takeIf { linkReceivesOnly }?.setRemoteAudible(isAudible)
        applySound()
        tellCallerTheSound()
        publish()
    }

    private val offersSound: Boolean get() = state.phase == CallPreviewPhase.IncomingRinging

    private val offersOutgoingControls: Boolean get() = state.phase == CallPreviewPhase.OutgoingRinging

    /** La sonnerie se tait et la route s'ouvre seulement quand l'appelant s'entend vraiment. */
    private fun applySound() {
        if (!isPreviewConnected || isAudible == hostHearsPreview) return
        hostHearsPreview = isAudible
        host?.setPreviewAudible(isAudible)
    }

    private fun tellCallerTheSound() {
        val current = link ?: return
        if (!linkReceivesOnly) return
        current.sendControl(CallPreviewControl.encode(isAudible))
    }

    // --- Appelant : ce que l'appelé reçoit avant de décrocher (#8795) ---

    fun togglePreviewAudio() {
        if (!offersOutgoingControls) return
        outgoingConsent = outgoingConsent.copy(sendsAudio = !outgoingConsent.sendsAudio)
        rememberConsent()
        link?.takeIf { !linkReceivesOnly }?.setSendsAudio(sendsPreviewAudio)
        publish()
    }

    fun togglePreviewVideo() {
        if (!offersOutgoingControls) return
        outgoingConsent = outgoingConsent.copy(sendsVideo = !outgoingConsent.sendsVideo)
        rememberConsent()
        link?.takeIf { !linkReceivesOnly }?.setSendsVideo(sendsPreviewVideo)
        publish()
    }

    private val sendsPreviewAudio: Boolean get() = outgoingConsent.sendsAudio(state.isMicMuted)

    private val sendsPreviewVideo: Boolean get() = outgoingConsent.sendsVideo(state.isVideoEnabled)

    private fun adoptConsentIfNeeded() {
        val callId = state.callId
        if (callId.isBlank() || state.peerUserId.isBlank() || consentCallId == callId) return
        consentCallId = callId
        outgoingConsent = consents.consent(state.localUserId, state.peerUserId)
    }

    private fun rememberConsent() {
        if (state.peerUserId.isBlank()) return
        consents.remember(outgoingConsent, state.localUserId, state.peerUserId)
    }

    private fun followLocalMedia(previous: CallPreviewHostState) {
        val rang = previous.phase == CallPreviewPhase.OutgoingRinging && previous.callId == state.callId
        val current = link ?: return
        if (!rang || linkReceivesOnly) return
        if (state.isMicMuted != previous.isMicMuted) current.setSendsAudio(sendsPreviewAudio)
        if (state.isVideoEnabled != previous.isVideoEnabled) current.setSendsVideo(sendsPreviewVideo)
    }

    // --- La passerelle ---

    /** `call:preview-requested` : l'appelé de MON appel qui sonne demande l'aperçu. */
    fun onRequested(requested: CallPreviewRequested) {
        val peer = state.peerUserId
        val accepted = state.phase == CallPreviewPhase.OutgoingRinging &&
            requested.callId == state.callId && state.callId.isNotBlank() &&
            requested.userId != state.localUserId &&
            (peer.isBlank() || requested.userId == peer)
        if (!accepted) return
        val opened = open(requested.callId, requested.userId, receiveOnly = false)
        scope?.launch { opened.offer() }
        publish()
    }

    /** `call:preview-signal` : l'offre de l'appelant ouvre le lien, le reste va au lien ouvert. */
    fun onSignal(envelope: CallSignalEnvelope) {
        val signal = envelope.signal
        val from = signal.from.orEmpty()
        if (envelope.callId != state.callId || from.isBlank() || signal.to != state.localUserId) return
        val current = link
        if (current != null && linkCallId == envelope.callId && current.remoteUserId == from) {
            scope?.launch { current.receive(signal) }
            return
        }
        val peer = state.peerUserId
        val opens = state.phase == CallPreviewPhase.IncomingRinging && signal.type == OFFER &&
            (peer.isBlank() || from == peer)
        if (!opens) return
        val opened = open(envelope.callId, from, receiveOnly = true)
        scope?.launch { opened.receive(signal) }
        publish()
    }

    /** Les serveurs ICE de l'appel : l'ACK de l'appelant, ou un rafraîchissement. */
    fun adoptIceServers(callId: String, servers: List<SocketIceServer>) {
        if (callId.isBlank() || servers.isEmpty()) return
        iceServers[callId] = servers
    }

    /** `call:ice-servers-refreshed` (sans identifiant d'appel sur Android) : l'appel en cours et son lien. */
    fun onIceServersRefreshed(servers: List<SocketIceServer>) {
        adoptIceServers(state.callId, servers)
        if (servers.isEmpty() || linkCallId != state.callId) return
        link?.updateIceServers(servers)
    }

    private fun requestPreviewIfNeeded() {
        val callId = state.callId
        if (callId.isBlank() || requestedCallId == callId) return
        requestedCallId = callId
        signaling.request(callId)
    }

    // --- Le lien ---

    private fun open(callId: String, peer: String, receiveOnly: Boolean): CallPreviewLink {
        closeLink(silencing = true)
        val config = CallPreviewLinkConfig(
            remoteUserId = peer,
            iceServers = CallPreviewIce.orDefault(iceServers[callId].orEmpty()),
            receiveOnly = receiveOnly,
            sendsAudio = !receiveOnly && sendsPreviewAudio,
            sendsVideo = !receiveOnly && sendsPreviewVideo,
        )
        linkGeneration += 1
        val generation = linkGeneration
        linkReceivesOnly = receiveOnly
        val opened = links.open(config) { event ->
            val current = link
            if (linkGeneration == generation && current != null) onLinkEvent(event, current, callId)
        }
        link = opened
        linkCallId = callId
        if (receiveOnly) opened.setRemoteAudible(isAudible)
        return opened
    }

    private fun onLinkEvent(event: CallPreviewLinkEvent, from: CallPreviewLink, callId: String) {
        when (event) {
            is CallPreviewLinkEvent.Signal -> signaling.emit(
                callId, event.type, state.localUserId, from.remoteUserId, event.negotiationId, event.fields,
            )
            is CallPreviewLinkEvent.Connection -> {
                if (linkReceivesOnly) {
                    isPreviewConnected = event.connected
                    applySound()
                } else {
                    reachesCallee = event.connected
                }
            }
            is CallPreviewLinkEvent.RemoteVideo -> if (linkReceivesOnly) video = event.track
            CallPreviewLinkEvent.Failed -> closeLink(silencing = true)
            CallPreviewLinkEvent.ControlOpened -> tellCallerTheSound()
            is CallPreviewLinkEvent.Control -> if (!linkReceivesOnly) {
                CallPreviewControl.decode(event.bytes)?.let { isHeardByCallee = it }
            }
        }
        publish()
    }

    private fun closeLink(silencing: Boolean) {
        linkGeneration += 1
        link?.close()
        link = null
        linkCallId = null
        video = null
        isPreviewConnected = false
        reachesCallee = false
        isHeardByCallee = false
        linkReceivesOnly = false
        if (!hostHearsPreview) return
        hostHearsPreview = false
        if (silencing) host?.setPreviewAudible(false)
    }

    private fun endPreview(silencing: Boolean) {
        closeLink(silencing)
        isAudible = false
    }

    private fun resetCall(previous: CallPreviewHostState) {
        endPreview(silencing = true)
        requestedCallId = null
        consentCallId = null
        outgoingConsent = CallPreviewConsent.INITIAL
        iceServers.remove(previous.callId)
    }

    private fun publish() {
        _ui.value = CallPreviewUi(
            video = video,
            offersSound = offersSound,
            isAudible = isAudible,
            offersOutgoingControls = offersOutgoingControls,
            outgoingConsent = outgoingConsent,
            calleeExposure = CallPreviewExposure.of(
                reachesCallee, isHeardByCallee, outgoingConsent, state.isMicMuted, state.isVideoEnabled,
            ),
        )
    }

    private companion object {
        const val OFFER = "offer"
    }
}
