package me.meeshy.app.calls

import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.sdk.model.call.CallPreviewConsent
import me.meeshy.sdk.model.call.CallPreviewRequested
import me.meeshy.sdk.model.call.CallSignalEnvelope
import me.meeshy.sdk.model.call.CallSignalPayload
import me.meeshy.sdk.model.call.SocketIceServer

/** Un lien d'aperçu qui enregistre ce qu'on lui demande ; [onEvent] joue ce que libwebrtc rapporterait. */
internal class RecordingPreviewLink(
    val config: CallPreviewLinkConfig,
    val onEvent: (CallPreviewLinkEvent) -> Unit,
) : CallPreviewLink {
    override val remoteUserId: String get() = config.remoteUserId
    var offers = 0
    val received = mutableListOf<CallSignalPayload>()
    val sentControl = mutableListOf<String>()
    val sendsAudio = mutableListOf<Boolean>()
    val sendsVideo = mutableListOf<Boolean>()
    val audible = mutableListOf<Boolean>()
    val iceUpdates = mutableListOf<List<SocketIceServer>>()
    var closed = false

    override suspend fun offer() { offers += 1 }
    override suspend fun receive(signal: CallSignalPayload) { received += signal }
    override fun setSendsAudio(enabled: Boolean) { sendsAudio += enabled }
    override fun setSendsVideo(enabled: Boolean) { sendsVideo += enabled }
    override fun setRemoteAudible(audible: Boolean) { this.audible += audible }
    override fun updateIceServers(servers: List<SocketIceServer>) { iceUpdates += servers }
    override fun sendControl(bytes: ByteArray) { sentControl += String(bytes, Charsets.UTF_8) }
    override fun close() { closed = true }
}

internal class RecordingPreviewLinks : CallPreviewLinkFactory {
    val links = mutableListOf<RecordingPreviewLink>()
    val last: RecordingPreviewLink get() = links.last()

    override fun open(config: CallPreviewLinkConfig, onEvent: (CallPreviewLinkEvent) -> Unit): CallPreviewLink =
        RecordingPreviewLink(config, onEvent).also { links += it }
}

internal class RecordingPreviewSignaling : CallPreviewSignaling {
    override val requested = MutableSharedFlow<CallPreviewRequested>(extraBufferCapacity = 8)
    override val signals = MutableSharedFlow<CallSignalEnvelope>(extraBufferCapacity = 8)
    val requests = mutableListOf<String>()
    val emitted = mutableListOf<List<Any?>>()

    override fun request(callId: String) { requests += callId }

    override fun emit(callId: String, type: String, from: String, to: String, negotiationId: Int, fields: Map<String, Any?>) {
        emitted += listOf(callId, type, from, to, negotiationId, fields)
    }
}

internal class InMemoryPreviewConsents(var stored: CallPreviewConsent = CallPreviewConsent.INITIAL) : CallPreviewConsentStoring {
    val remembered = mutableListOf<Triple<CallPreviewConsent, String, String>>()

    override fun consent(localUserId: String, peerUserId: String) = stored

    override fun remember(consent: CallPreviewConsent, localUserId: String, peerUserId: String) {
        remembered += Triple(consent, localUserId, peerUserId)
    }
}

/** Un aperçu branché sur des doublures : il demande, ouvre et se ferme sans socket ni WebRTC. */
internal fun recordingCallPreview(
    links: RecordingPreviewLinks = RecordingPreviewLinks(),
    signaling: RecordingPreviewSignaling = RecordingPreviewSignaling(),
    consents: InMemoryPreviewConsents = InMemoryPreviewConsents(),
) = CallPreviewCoordinator(links, signaling, consents)
