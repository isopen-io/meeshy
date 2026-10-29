package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import me.meeshy.sdk.model.call.CallPreviewConsent
import me.meeshy.sdk.model.call.CallPreviewControl
import me.meeshy.sdk.model.call.CallPreviewExposure
import me.meeshy.sdk.model.call.CallPreviewIce
import me.meeshy.sdk.model.call.CallPreviewPhase
import me.meeshy.sdk.model.call.CallPreviewRequested
import me.meeshy.sdk.model.call.CallSignalEnvelope
import me.meeshy.sdk.model.call.CallSignalPayload
import me.meeshy.sdk.model.call.SocketIceServer
import org.junit.Test
import org.webrtc.VideoTrack

/**
 * La machine de l'aperçu avant décroché (#8480, #8627, #8795), pilotée par des doublures : qui
 * demande, qui offre, en réception seule ou non, quand le lien se ferme, ce que dit le canal de
 * contrôle et ce que l'appelant laisse voir et entendre. Jumelle des témoins iOS
 * `CallPreviewCoordinatorTests`.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallPreviewCoordinatorTest {

    private class FakeLink(val config: CallPreviewLinkConfig, val onEvent: (CallPreviewLinkEvent) -> Unit) : CallPreviewLink {
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

    private class Signaling : CallPreviewSignaling {
        val requests = mutableListOf<String>()
        val emitted = mutableListOf<List<Any?>>()
        override fun request(callId: String) { requests += callId }
        override fun emit(callId: String, type: String, from: String, to: String, negotiationId: Int, fields: Map<String, Any?>) {
            emitted += listOf(callId, type, from, to, negotiationId, fields)
        }
    }

    private class Consents(var stored: CallPreviewConsent = CallPreviewConsent.INITIAL) : CallPreviewConsentStoring {
        val remembered = mutableListOf<Triple<CallPreviewConsent, String, String>>()
        override fun consent(localUserId: String, peerUserId: String) = stored
        override fun remember(consent: CallPreviewConsent, localUserId: String, peerUserId: String) {
            remembered += Triple(consent, localUserId, peerUserId)
        }
    }

    private class Rig(consent: CallPreviewConsent = CallPreviewConsent.INITIAL) {
        val links = mutableListOf<FakeLink>()
        val signaling = Signaling()
        val consents = Consents(consent)
        val hostAudible = mutableListOf<Boolean>()
        val coordinator = CallPreviewCoordinator(
            links = { config, onEvent -> FakeLink(config, onEvent).also { links += it } },
            signaling = signaling,
            consents = consents,
        ).apply { attach(CoroutineScope(UnconfinedTestDispatcher()), { hostAudible += it }) }

        val link: FakeLink get() = links.last()
        val ui: CallPreviewUi get() = coordinator.ui.value
    }

    private fun incoming(phase: CallPreviewPhase = CallPreviewPhase.IncomingRinging, callId: String = "c1", peer: String = "caller") =
        CallPreviewHostState(callId, "me", peer, phase, isMicMuted = false, isVideoEnabled = false)

    private fun outgoing(
        phase: CallPreviewPhase = CallPreviewPhase.OutgoingRinging,
        callId: String = "c1",
        micMuted: Boolean = false,
        video: Boolean = true,
    ) = CallPreviewHostState(callId, "me", "callee", phase, isMicMuted = micMuted, isVideoEnabled = video)

    private fun signal(type: String, from: String = "caller", to: String = "me", callId: String = "c1", negotiationId: Int = 1) =
        CallSignalEnvelope(callId, CallSignalPayload(type = type, sdp = "v=0", from = from, to = to, negotiationId = negotiationId))

    private fun Rig.ringWithOpenLink(): FakeLink {
        coordinator.sync(incoming())
        coordinator.onSignal(signal("offer"))
        return link
    }

    // --- Appelé ---

    @Test
    fun `l'appele demande l'apercu une fois par appel des que l'appel 1-1 sonne`() {
        val rig = Rig()

        rig.coordinator.sync(incoming())
        rig.coordinator.sync(incoming().copy(isMicMuted = true))

        assertThat(rig.signaling.requests).containsExactly("c1")
        assertThat(rig.ui.offersSound).isTrue()
    }

    @Test
    fun `l'offre de l'appelant ouvre un lien en RECEPTION SEULE, sans micro ni camera`() {
        val rig = Rig()

        val link = rig.ringWithOpenLink()

        assertThat(link.config.receiveOnly).isTrue()
        assertThat(link.config.sendsAudio).isFalse()
        assertThat(link.config.sendsVideo).isFalse()
        assertThat(link.config.remoteUserId).isEqualTo("caller")
        assertThat(link.config.iceServers).isEqualTo(CallPreviewIce.DEFAULT_SERVERS)
        assertThat(link.received.map { it.type }).containsExactly("offer")
        assertThat(link.audible).containsExactly(false)
    }

    @Test
    fun `seule une offre de l'appelant, adressee a moi, pour cet appel qui sonne ouvre le lien`() {
        val rig = Rig()
        rig.coordinator.sync(incoming())

        rig.coordinator.onSignal(signal("answer"))
        rig.coordinator.onSignal(signal("offer", from = "intrus"))
        rig.coordinator.onSignal(signal("offer", to = "autre"))
        rig.coordinator.onSignal(signal("offer", callId = "c2"))

        assertThat(rig.links).isEmpty()
    }

    @Test
    fun `un appele qui ne connait pas encore l'appelant accepte l'offre que la passerelle lui relaie`() {
        val rig = Rig()
        rig.coordinator.sync(incoming(peer = ""))

        rig.coordinator.onSignal(signal("offer", from = "caller"))

        assertThat(rig.link.remoteUserId).isEqualTo("caller")
    }

    @Test
    fun `les signaux suivants vont au lien ouvert, et ses signaux partent par call-preview-signal`() {
        val rig = Rig()
        val link = rig.ringWithOpenLink()

        rig.coordinator.onSignal(signal("ice-candidate"))
        link.onEvent(CallPreviewLinkEvent.Signal("answer", 1, mapOf("sdp" to "v=0 answer")))

        assertThat(link.received.map { it.type }).containsExactly("offer", "ice-candidate").inOrder()
        assertThat(rig.signaling.emitted.single()).isEqualTo(listOf("c1", "answer", "me", "caller", 1, mapOf("sdp" to "v=0 answer")))
        assertThat(rig.links).hasSize(1)
    }

    @Test
    fun `la video de l'appelant s'affiche, et disparait quand le lien se ferme`() {
        val rig = Rig()
        val link = rig.ringWithOpenLink()
        val track = mockk<VideoTrack>(relaxed = true)

        link.onEvent(CallPreviewLinkEvent.RemoteVideo(track))
        assertThat(rig.ui.video).isSameInstanceAs(track)

        rig.coordinator.sync(incoming(CallPreviewPhase.Ended))
        assertThat(rig.ui.video).isNull()
        assertThat(link.closed).isTrue()
    }

    @Test
    fun `activer le son avant l'arrivee de l'appelant est retenu, et s'applique des que le lien est etabli`() {
        val rig = Rig()
        rig.coordinator.sync(incoming())

        rig.coordinator.toggleSound()
        assertThat(rig.ui.isAudible).isTrue()
        assertThat(rig.hostAudible).isEmpty()

        rig.coordinator.onSignal(signal("offer"))
        assertThat(rig.link.audible).containsExactly(true)
        assertThat(rig.hostAudible).isEmpty()

        rig.link.onEvent(CallPreviewLinkEvent.Connection(connected = true))
        assertThat(rig.hostAudible).containsExactly(true)
    }

    @Test
    fun `le son se coupe et se retablit sur le lien et chez l'hote, et l'appelant en est informe`() {
        val rig = Rig()
        val link = rig.ringWithOpenLink()
        link.onEvent(CallPreviewLinkEvent.Connection(connected = true))
        link.onEvent(CallPreviewLinkEvent.ControlOpened)

        rig.coordinator.toggleSound()
        rig.coordinator.toggleSound()

        assertThat(link.audible).containsExactly(false, true, false).inOrder()
        assertThat(rig.hostAudible).containsExactly(true, false).inOrder()
        assertThat(link.sentControl).containsExactly(
            """{"audible":false}""", """{"audible":true}""", """{"audible":false}""",
        ).inOrder()
    }

    @Test
    fun `au decroche l'apercu TIENT, puis se ferme sans rendre le son quand le vrai lien est connecte`() {
        val rig = Rig()
        val link = rig.ringWithOpenLink()
        link.onEvent(CallPreviewLinkEvent.Connection(connected = true))
        rig.coordinator.toggleSound()

        rig.coordinator.sync(incoming(CallPreviewPhase.Answering))
        assertThat(link.closed).isFalse()
        assertThat(rig.ui.offersSound).isFalse()

        rig.coordinator.toggleSound()
        assertThat(rig.ui.isAudible).isTrue()

        rig.coordinator.sync(incoming(CallPreviewPhase.Connected))
        assertThat(link.closed).isTrue()
        assertThat(rig.hostAudible).containsExactly(true)
        assertThat(rig.ui.isAudible).isFalse()
    }

    @Test
    fun `au refus ou a la fin, l'apercu se ferme et rend le son`() {
        val rig = Rig()
        val link = rig.ringWithOpenLink()
        link.onEvent(CallPreviewLinkEvent.Connection(connected = true))
        rig.coordinator.toggleSound()

        rig.coordinator.sync(incoming(CallPreviewPhase.Ended))

        assertThat(link.closed).isTrue()
        assertThat(rig.hostAudible).containsExactly(true, false).inOrder()
        assertThat(rig.ui).isEqualTo(CallPreviewUi())
    }

    @Test
    fun `un lien perdu se ferme, l'appel sonne toujours et ses evenements tardifs sont ignores`() {
        val rig = Rig()
        val link = rig.ringWithOpenLink()

        link.onEvent(CallPreviewLinkEvent.Failed)
        link.onEvent(CallPreviewLinkEvent.RemoteVideo(mockk(relaxed = true)))

        assertThat(link.closed).isTrue()
        assertThat(rig.ui.video).isNull()
        assertThat(rig.ui.offersSound).isTrue()
    }

    @Test
    fun `un nouvel appel oublie la demande du precedent`() {
        val rig = Rig()
        val link = rig.ringWithOpenLink()

        rig.coordinator.sync(incoming(callId = "c2"))

        assertThat(link.closed).isTrue()
        assertThat(rig.signaling.requests).containsExactly("c1", "c2").inOrder()
    }

    @Test
    fun `liberer le coordinateur ferme le lien sans toucher a l'hote`() {
        val rig = Rig()
        val link = rig.ringWithOpenLink()
        link.onEvent(CallPreviewLinkEvent.Connection(connected = true))
        rig.coordinator.toggleSound()

        rig.coordinator.release()

        assertThat(link.closed).isTrue()
        assertThat(rig.hostAudible).containsExactly(true)
    }

    // --- Appelant ---

    @Test
    fun `l'appelant repond a la demande de SON appel qui sonne par une offre micro coupe camera activee`() {
        val rig = Rig()
        rig.coordinator.sync(outgoing())

        rig.coordinator.onRequested(CallPreviewRequested("c1", "callee"))

        assertThat(rig.link.config.receiveOnly).isFalse()
        assertThat(rig.link.config.sendsAudio).isFalse()
        assertThat(rig.link.config.sendsVideo).isTrue()
        assertThat(rig.link.offers).isEqualTo(1)
        assertThat(rig.ui.offersOutgoingControls).isTrue()
    }

    @Test
    fun `l'appelant ignore une demande d'un autre appel, de lui-meme, d'un tiers ou hors sonnerie`() {
        val rig = Rig()
        rig.coordinator.sync(outgoing())

        rig.coordinator.onRequested(CallPreviewRequested("c2", "callee"))
        rig.coordinator.onRequested(CallPreviewRequested("c1", "me"))
        rig.coordinator.onRequested(CallPreviewRequested("c1", "tiers"))
        rig.coordinator.sync(outgoing(CallPreviewPhase.Answering))
        rig.coordinator.onRequested(CallPreviewRequested("c1", "callee"))

        assertThat(rig.links).isEmpty()
    }

    @Test
    fun `l'appelant offre ses relais TURN quand il les connait`() {
        val rig = Rig()
        val turn = listOf(SocketIceServer(urls = listOf("turn:relay"), username = "u", credential = "p"))
        rig.coordinator.sync(outgoing())
        rig.coordinator.adoptIceServers("c1", turn)

        rig.coordinator.onRequested(CallPreviewRequested("c1", "callee"))
        rig.coordinator.onIceServersRefreshed(CallPreviewIce.DEFAULT_SERVERS)

        assertThat(rig.link.config.iceServers).isEqualTo(turn)
        assertThat(rig.link.iceUpdates).containsExactly(CallPreviewIce.DEFAULT_SERVERS)
    }

    @Test
    fun `le choix retenu pour CE correspondant gouverne l'offre, dans la limite du micro et de la camera de l'appel`() {
        val rig = Rig(consent = CallPreviewConsent(sendsAudio = true, sendsVideo = true))
        rig.coordinator.sync(outgoing(micMuted = true, video = false))

        rig.coordinator.onRequested(CallPreviewRequested("c1", "callee"))

        assertThat(rig.ui.outgoingConsent).isEqualTo(CallPreviewConsent(sendsAudio = true, sendsVideo = true))
        assertThat(rig.link.config.sendsAudio).isFalse()
        assertThat(rig.link.config.sendsVideo).isFalse()
    }

    @Test
    fun `les bascules de l'appelant suivent le lien et sont retenues pour ce correspondant`() {
        val rig = Rig()
        rig.coordinator.sync(outgoing())
        rig.coordinator.onRequested(CallPreviewRequested("c1", "callee"))

        rig.coordinator.togglePreviewAudio()
        rig.coordinator.togglePreviewVideo()

        assertThat(rig.link.sendsAudio).containsExactly(true)
        assertThat(rig.link.sendsVideo).containsExactly(false)
        assertThat(rig.consents.remembered.last()).isEqualTo(Triple(CallPreviewConsent(true, false), "me", "callee"))
    }

    @Test
    fun `l'appelant est vu des que son lien atteint l'appele, entendu seulement quand l'appele active le son`() {
        val rig = Rig(consent = CallPreviewConsent(sendsAudio = true, sendsVideo = true))
        rig.coordinator.sync(outgoing())
        rig.coordinator.onRequested(CallPreviewRequested("c1", "callee"))
        assertThat(rig.ui.calleeExposure).isEqualTo(CallPreviewExposure.Nothing)

        rig.link.onEvent(CallPreviewLinkEvent.Connection(connected = true))
        assertThat(rig.ui.calleeExposure).isEqualTo(CallPreviewExposure.Seen)

        rig.link.onEvent(CallPreviewLinkEvent.Control(CallPreviewControl.encode(audible = true)))
        assertThat(rig.ui.calleeExposure).isEqualTo(CallPreviewExposure.SeenAndHeard)

        rig.coordinator.togglePreviewAudio()
        assertThat(rig.ui.calleeExposure).isEqualTo(CallPreviewExposure.Seen)
    }

    @Test
    fun `l'appelant ferme son lien a la connexion du vrai lien, et oublie l'exposition`() {
        val rig = Rig()
        rig.coordinator.sync(outgoing())
        rig.coordinator.onRequested(CallPreviewRequested("c1", "callee"))
        rig.link.onEvent(CallPreviewLinkEvent.Connection(connected = true))

        rig.coordinator.sync(outgoing(CallPreviewPhase.Answering))
        assertThat(rig.link.closed).isFalse()

        rig.coordinator.sync(outgoing(CallPreviewPhase.Connected))
        assertThat(rig.link.closed).isTrue()
        assertThat(rig.ui.calleeExposure).isEqualTo(CallPreviewExposure.Nothing)
        assertThat(rig.ui.offersOutgoingControls).isFalse()
    }

    @Test
    fun `l'appelant ne parle jamais sur le canal de controle, l'appele n'ecoute jamais ce qu'on lui dit`() {
        val rig = Rig()
        rig.coordinator.sync(outgoing())
        rig.coordinator.onRequested(CallPreviewRequested("c1", "callee"))
        rig.link.onEvent(CallPreviewLinkEvent.ControlOpened)
        rig.coordinator.toggleSound()
        assertThat(rig.link.sentControl).isEmpty()

        val callee = Rig()
        val link = callee.ringWithOpenLink()
        link.onEvent(CallPreviewLinkEvent.Control(CallPreviewControl.encode(audible = true)))
        assertThat(callee.ui.calleeExposure).isEqualTo(CallPreviewExposure.Nothing)
    }
}
