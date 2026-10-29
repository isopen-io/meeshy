package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.call.CallMeshPeerConfig
import me.meeshy.sdk.model.call.CallSignalEnvelope
import me.meeshy.sdk.model.call.CallSignalPayload
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.group.GroupCallArrival
import me.meeshy.sdk.model.call.group.GroupCallLinkState
import org.junit.Test
import org.webrtc.IceCandidate
import org.webrtc.SessionDescription

/**
 * Le maillage d'un appel de groupe (#13740), même topologie qu'iOS `GroupCallMeshCoordinator` : le membre déjà
 * dans l'appel offre au nouveau venu, le nouveau venu répond, le principal reste à la connexion de l'appel, et un
 * duo ne traverse jamais le maillage. Les connexions WebRTC sont remplacées par des faux ; aucun natif ne tourne.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GroupCallMeshTest {

    private class FakePort : GroupMeshPeerPort {
        var stable = true
        var waitingAnswer = false
        val calls = mutableListOf<String>()
        var sendsAudio: Boolean? = null
        var closed = false
        lateinit var callbacks: GroupMeshPeerCallbacks

        override val isStable: Boolean get() = stable
        override val awaitsAnswer: Boolean get() = waitingAnswer
        override suspend fun createOffer(iceRestart: Boolean): SessionDescription {
            calls += if (iceRestart) "offer-restart" else "offer"
            return SessionDescription(SessionDescription.Type.OFFER, "v=0 offer")
        }
        override suspend fun createAnswer(): SessionDescription {
            calls += "answer"
            return SessionDescription(SessionDescription.Type.ANSWER, "v=0 answer")
        }
        override suspend fun setLocalDescription(desc: SessionDescription) {
            calls += "local-${desc.type.canonicalForm()}"
            if (desc.type == SessionDescription.Type.OFFER) waitingAnswer = true
        }
        override suspend fun rollback() {
            calls += "rollback"
        }
        override suspend fun setRemoteDescription(desc: SessionDescription) {
            calls += "remote-${desc.type.canonicalForm()}"
            if (desc.type == SessionDescription.Type.ANSWER) waitingAnswer = false
        }
        override fun addIceCandidate(candidate: IceCandidate) {
            calls += "candidate"
        }
        override fun setSendsAudio(enabled: Boolean) {
            sendsAudio = enabled
        }
        override fun setSendsVideo(enabled: Boolean) = Unit
        override fun updateIceServers(servers: List<SocketIceServer>) = Unit
        override fun close() {
            closed = true
        }
    }

    private data class Sent(val to: String, val from: String, val signal: GroupMeshSignal)

    private class Harness {
        val opened = mutableListOf<FakePort>()
        val sent = mutableListOf<Sent>()
        val mesh = GroupCallMesh(
            factory = { _: CallMeshPeerConfig, callbacks ->
                FakePort().also {
                    it.callbacks = callbacks
                    opened += it
                }
            },
            sender = { _, to, from, signal -> sent += Sent(to, from, signal) },
        )

        fun bind(scope: CoroutineScope, isOutgoing: Boolean, self: String = "m") = mesh.bind(
            scope, CALL, self, isOutgoing, primaryUserId = "", iceServers = emptyList(), sendsAudio = true, sendsVideo = false,
        )

        fun signal(type: String, from: String, negotiationId: Int = 1, sdp: String? = "v=0 x") =
            mesh.claims(CallSignalEnvelope(CALL, CallSignalPayload(type = type, sdp = sdp, from = from, to = "m", negotiationId = negotiationId)))
    }

    @Test
    fun `a duo never goes through the mesh`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = false)
        assertThat(h.signal("offer", from = "alice")).isFalse()
        assertThat(h.signal("ice-candidate", from = "alice", sdp = null)).isFalse()
        assertThat(h.mesh.claimsArrival("alice")).isFalse()
        assertThat(h.mesh.ui.value.isActive).isFalse()
        assertThat(h.opened).isEmpty()
        h.mesh.teardown()
    }

    @Test
    fun `the caller's first joiner is the primary, the next one gets a mesh offer addressed to it`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        assertThat(h.mesh.claimsArrival("alice")).isFalse()
        assertThat(h.mesh.claimsArrival("bob")).isTrue()
        assertThat(h.sent.single()).isEqualTo(Sent("bob", "m", GroupMeshSignal(GroupMeshSignalKind.Offer, sdp = "v=0 offer", negotiationId = 1)))
        assertThat(h.mesh.ui.value.isActive).isTrue()
        assertThat(h.mesh.ui.value.roster.members.map { it.userId to it.isPrimary }).containsExactly("alice" to true, "bob" to false).inOrder()
        assertThat(h.signal("answer", from = "alice")).isFalse()
        h.mesh.teardown()
    }

    @Test
    fun `the callee's first offerer is the primary, a second offerer is answered by the mesh`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = false, self = "m")
        assertThat(h.signal("offer", from = "alice")).isFalse()
        assertThat(h.signal("offer", from = "bob", negotiationId = 4)).isTrue()
        assertThat(h.opened.single().calls).containsExactly("remote-offer", "answer", "local-answer").inOrder()
        assertThat(h.sent.single()).isEqualTo(Sent("bob", "m", GroupMeshSignal(GroupMeshSignalKind.Answer, sdp = "v=0 answer", negotiationId = 4)))
        assertThat(h.signal("ice-candidate", from = "bob", negotiationId = 4, sdp = null)).isTrue()
        assertThat(h.signal("offer", from = "alice", negotiationId = 2)).isFalse()
        h.mesh.teardown()
    }

    @Test
    fun `my own echo is swallowed once the call is a group`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        assertThat(h.signal("offer", from = "m")).isTrue()
        h.mesh.teardown()
    }

    @Test
    fun `a member that leaves closes its link, the call goes on`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        h.mesh.onParticipantLeft(CALL, "bob")
        assertThat(h.opened.single().closed).isTrue()
        assertThat(h.mesh.ui.value.roster.members.map { it.userId }).containsExactly("alice")
        h.mesh.teardown()
    }

    @Test
    fun `the primary leaving a group that carries on vacates its seat, alone it ends the call as before`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        assertThat(h.mesh.primaryDidLeave()).isFalse()
        h.mesh.claimsArrival("bob")
        h.mesh.onParticipantLeft(CALL, "alice")
        assertThat(h.mesh.isPrimaryVacated).isTrue()
        assertThat(h.signal("offer", from = "alice", negotiationId = 9)).isTrue()
        h.mesh.teardown()
    }

    @Test
    fun `a mesh member's media toggle stays off the primary's indicators`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        assertThat(h.mesh.onMediaToggled(CALL, "alice", "audio", enabled = false)).isFalse()
        h.mesh.claimsArrival("bob")
        assertThat(h.mesh.onMediaToggled(CALL, "bob", "video", enabled = true)).isTrue()
        assertThat(h.mesh.onMediaToggled(CALL, "alice", "audio", enabled = false)).isFalse()
        assertThat(h.mesh.ui.value.roster.member("bob")!!.isCameraOn).isTrue()
        h.mesh.teardown()
    }

    @Test
    fun `a full call admits nobody more, without offering`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        listOf("a1", "b1", "c1", "d1", "e1").forEach { h.mesh.claimsArrival(it) }
        val links = h.opened.size
        assertThat(h.mesh.claimsArrival("f1")).isTrue()
        assertThat(h.opened.size).isEqualTo(links)
        assertThat(h.mesh.ui.value.roster.member("f1")).isNull()
        h.mesh.teardown()
    }

    @Test
    fun `arrival details name a member, and the microphone follows on every link`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        h.mesh.onArrivalDetails(CALL, GroupCallArrival("bob", displayName = "Bob"))
        h.mesh.setSendsAudio(false)
        assertThat(h.mesh.ui.value.roster.member("bob")!!.displayName).isEqualTo("Bob")
        assertThat(h.opened.single().sendsAudio).isFalse()
        h.mesh.teardown()
    }

    @Test
    fun `the impolite side ignores a colliding offer, the polite side rolls back and answers`() = runTest(UnconfinedTestDispatcher()) {
        val impolite = Harness()
        impolite.bind(this, isOutgoing = true, self = "z9")
        impolite.mesh.claimsArrival("alice")
        impolite.mesh.claimsArrival("bob")
        impolite.opened.single().stable = false
        assertThat(impolite.signal("offer", from = "bob", negotiationId = 1)).isTrue()
        assertThat(impolite.opened.single().calls).doesNotContain("rollback")
        impolite.mesh.teardown()

        val polite = Harness()
        polite.bind(this, isOutgoing = true, self = "a0")
        polite.mesh.claimsArrival("alice")
        polite.mesh.claimsArrival("bob")
        polite.opened.single().stable = false
        polite.signal("offer", from = "bob", negotiationId = 1)
        assertThat(polite.opened.single().calls).containsAtLeast("rollback", "remote-offer", "answer").inOrder()
        polite.mesh.teardown()
    }

    @Test
    fun `a link whose restarts run out drops its member, the call goes on`() = runTest {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        testScheduler.advanceUntilIdle()
        val port = h.opened.single()
        port.callbacks.onState(GroupMeshPeerState.Connected)
        testScheduler.advanceUntilIdle()
        assertThat(h.mesh.ui.value.roster.member("bob")!!.link).isEqualTo(GroupCallLinkState.Connected)
        repeat(6) {
            port.callbacks.onState(GroupMeshPeerState.Failed)
            testScheduler.advanceUntilIdle()
        }
        assertThat(port.calls.count { it == "offer-restart" }).isEqualTo(5)
        assertThat(h.mesh.ui.value.roster.member("bob")).isNull()
        assertThat(port.closed).isTrue()
        h.mesh.teardown()
    }

    private companion object {
        const val CALL = "call-1"
    }
}
