package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Test

/**
 * Un lien du maillage dont l'émetteur vidéo change de direction (l'écran partagé d'un appel audio, #13755) offre à
 * nouveau, comme iOS `WebRTCGroupPeerLink.setVideoEnabled` et le web `setVideoTrack` : tout de suite s'il est déjà
 * négocié et stable, après la description qui clôt une négociation en cours, jamais avant sa première négociation.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GroupPeerLinkRenegotiationTest {

    @Test
    fun `a negotiated link offers again when its video direction changes`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = false)
        h.signal("offer", from = "alice")
        h.signal("offer", from = "bob", negotiationId = 3)
        val bob = h.opened.single()
        h.sent.clear()

        bob.callbacks.onRenegotiationNeeded()

        assertThat(bob.calls.takeLast(2)).containsExactly("offer", "local-offer").inOrder()
        assertThat(h.sent.single()).isEqualTo(Sent("bob", "m", GroupMeshSignal(GroupMeshSignalKind.Offer, sdp = "v=0 offer", negotiationId = 4)))
        h.mesh.teardown()
    }

    @Test
    fun `an offer awaiting its answer defers the new offer until the answer lands`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        val bob = h.opened.single()
        h.signal("answer", from = "bob")
        bob.stable = false

        bob.callbacks.onRenegotiationNeeded()
        assertThat(bob.calls.count { it == "offer" }).isEqualTo(1)

        bob.stable = true
        bob.waitingAnswer = true
        h.signal("answer", from = "bob", negotiationId = 1)

        assertThat(bob.calls.count { it == "offer" }).isEqualTo(2)
        h.mesh.teardown()
    }

    @Test
    fun `a link never negotiated does not offer for a direction change`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        val bob = h.opened.single()

        bob.callbacks.onRenegotiationNeeded()

        assertThat(bob.calls.count { it == "offer" }).isEqualTo(1)
        h.mesh.teardown()
    }
}
