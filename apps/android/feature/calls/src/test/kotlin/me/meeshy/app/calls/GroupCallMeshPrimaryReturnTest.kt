package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Test

/**
 * Le principal qui revient après une coupure (#13756), comme iOS `primaryDidReturn` (#9111) : pendant que la
 * connexion de l'appel se cherche, son retour libère son siège et le maillage lui offre à neuf ; deux annonces du
 * même retour ne font qu'une offre. Hors coupure, son arrivée reste à la connexion de l'appel, comme avant.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GroupCallMeshPrimaryReturnTest {

    private fun groupOfThree(h: Harness, scope: kotlinx.coroutines.CoroutineScope) {
        h.bind(scope, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        h.sent.clear()
    }

    @Test
    fun `the primary returning while its connection searches is offered afresh by the mesh`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        groupOfThree(h, this)
        h.primaryReconnecting = true

        assertThat(h.mesh.claimsArrival("alice")).isTrue()

        assertThat(h.mesh.isPrimaryVacated).isTrue()
        assertThat(h.sent.single()).isEqualTo(Sent("alice", "m", GroupMeshSignal(GroupMeshSignalKind.Offer, sdp = "v=0 offer", negotiationId = 1)))
        assertThat(h.mesh.ui.value.roster.members.map { it.userId to it.isPrimary })
            .containsExactly("bob" to false, "alice" to false)
        assertThat(h.signal("answer", from = "alice")).isTrue()
        h.mesh.teardown()
    }

    @Test
    fun `the primary returns even when nobody else is left`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        groupOfThree(h, this)
        h.mesh.onParticipantLeft(CALL, "bob")
        h.primaryReconnecting = true

        assertThat(h.mesh.claimsArrival("alice")).isTrue()

        assertThat(h.mesh.isPrimaryVacated).isTrue()
        assertThat(h.sent.single().to).isEqualTo("alice")
        h.mesh.teardown()
    }

    @Test
    fun `two announcements of the same return make one offer`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        groupOfThree(h, this)
        h.primaryReconnecting = true

        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("alice")

        assertThat(h.sent.count { it.signal.kind == GroupMeshSignalKind.Offer }).isEqualTo(1)
        h.mesh.teardown()
    }

    @Test
    fun `outside a reconnection the primary's arrival stays with the call connection`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        groupOfThree(h, this)

        assertThat(h.mesh.claimsArrival("alice")).isFalse()

        assertThat(h.mesh.isPrimaryVacated).isFalse()
        assertThat(h.sent).isEmpty()
        h.mesh.teardown()
    }
}
