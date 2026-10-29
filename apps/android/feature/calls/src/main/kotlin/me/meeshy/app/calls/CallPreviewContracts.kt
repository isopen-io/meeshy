package me.meeshy.app.calls

import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.model.call.CallPreviewConsent
import me.meeshy.sdk.model.call.CallPreviewExposure
import me.meeshy.sdk.model.call.CallPreviewPhase
import me.meeshy.sdk.model.call.CallPreviewRequested
import me.meeshy.sdk.model.call.CallSignalEnvelope
import me.meeshy.sdk.model.call.CallSignalPayload
import me.meeshy.sdk.model.call.SocketIceServer
import org.webrtc.VideoTrack

/**
 * Les contrats de l'aperçu avant décroché (#8480) — miroir d'iOS `GroupPeerLinkProviding` /
 * `CallPreviewSignalingProviding` / `CallPreviewHostActing`. Le [CallPreviewCoordinator] ne
 * décide qu'au travers d'eux : les témoins JVM le pilotent par des doublures, sans WebRTC natif.
 */

/** Ce que [CallPreviewCoordinator] lit de l'appel que tient le [CallViewModel]. */
data class CallPreviewHostState(
    val callId: String,
    val localUserId: String,
    /** L'autre bout du 1:1 ; vide chez un appelé que la sonnerie n'a pas identifié. */
    val peerUserId: String,
    val phase: CallPreviewPhase,
    val isMicMuted: Boolean,
    /** La caméra de l'appel : un appel vidéo, caméra allumée. */
    val isVideoEnabled: Boolean,
) {
    companion object {
        val IDLE = CallPreviewHostState("", "", "", CallPreviewPhase.None, isMicMuted = false, isVideoEnabled = false)
    }
}

/** Ce que l'écran lit de l'aperçu : la vidéo et le son chez l'appelé, l'exposition chez l'appelant. */
data class CallPreviewUi(
    /** Chez l'appelé : la vidéo de l'appelant, derrière la sonnerie. */
    val video: VideoTrack? = null,
    /** Chez l'appelé : le contrôle « Activer l'audio » est proposé (l'appel 1:1 sonne). */
    val offersSound: Boolean = false,
    /** Chez l'appelé : il a choisi d'entendre l'appelant. */
    val isAudible: Boolean = false,
    /** Chez l'appelant : les bascules micro / caméra de l'aperçu sont proposées. */
    val offersOutgoingControls: Boolean = false,
    val outgoingConsent: CallPreviewConsent = CallPreviewConsent.INITIAL,
    /** Chez l'appelant : ce que l'appelé reçoit VRAIMENT — ce que dit le libellé. */
    val calleeExposure: CallPreviewExposure = CallPreviewExposure.Nothing,
)

/** UN lien d'aperçu, distinct du pair de l'appel : réception seule chez l'appelé. */
data class CallPreviewLinkConfig(
    val remoteUserId: String,
    val iceServers: List<SocketIceServer>,
    val receiveOnly: Boolean,
    val sendsAudio: Boolean,
    val sendsVideo: Boolean,
)

/** Ce qu'un lien rapporte, toujours sur le fil principal. */
sealed interface CallPreviewLinkEvent {
    /** Un signal à relayer par `call:preview-signal` ; [fields] porte `sdp`, ou le candidat. */
    data class Signal(val type: String, val negotiationId: Int, val fields: Map<String, Any?>) : CallPreviewLinkEvent

    data class Connection(val connected: Boolean) : CallPreviewLinkEvent

    data class RemoteVideo(val track: VideoTrack) : CallPreviewLinkEvent

    /** Le lien est perdu : l'aperçu se ferme, l'appel sonne toujours. */
    data object Failed : CallPreviewLinkEvent

    data object ControlOpened : CallPreviewLinkEvent

    class Control(val bytes: ByteArray) : CallPreviewLinkEvent
}

interface CallPreviewLink {
    val remoteUserId: String

    /** Appelant : la première offre, canal de contrôle compris. */
    suspend fun offer()

    /** Un signal du pair (offre, réponse ou candidat), dans l'ordre d'arrivée. */
    suspend fun receive(signal: CallSignalPayload)

    fun setSendsAudio(enabled: Boolean)

    fun setSendsVideo(enabled: Boolean)

    /** Appelé : faire entendre (ou taire) l'audio reçu de l'appelant. */
    fun setRemoteAudible(audible: Boolean)

    fun updateIceServers(servers: List<SocketIceServer>)

    fun sendControl(bytes: ByteArray)

    /** Libère le pair, ses pistes et son canal ; plus aucun événement ne sort ensuite. */
    fun close()
}

fun interface CallPreviewLinkFactory {
    fun open(config: CallPreviewLinkConfig, onEvent: (CallPreviewLinkEvent) -> Unit): CallPreviewLink
}

/** Les deux réceptions et les deux émissions de l'aperçu — `CallSocialSignalManager` les porte. */
interface CallPreviewSignaling {
    /** `call:preview-requested` — à l'appelant. */
    val requested: Flow<CallPreviewRequested>

    /** `call:preview-signal` — offre, réponse ou candidat du lien d'aperçu. */
    val signals: Flow<CallSignalEnvelope>

    fun request(callId: String)

    fun emit(callId: String, type: String, from: String, to: String, negotiationId: Int, fields: Map<String, Any?>)
}

/** Le choix de l'appelant, retenu par (compte, correspondant) — iOS `CallPreviewConsentStoring`. */
interface CallPreviewConsentStoring {
    fun consent(localUserId: String, peerUserId: String): CallPreviewConsent

    fun remember(consent: CallPreviewConsent, localUserId: String, peerUserId: String)
}

/** Le geste que seul l'hôte de l'appel peut faire : ouvrir le son pendant la sonnerie. */
fun interface CallPreviewHostActions {
    /** L'appelé entend l'appelant : la sonnerie se tait, la route audio s'ouvre ; `false` la rend. */
    fun setPreviewAudible(audible: Boolean)
}
