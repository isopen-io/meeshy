package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallVideoBudget
import org.junit.Test

/**
 * Chaque lien du maillage encode à sa juste part du débit montant (#13752), comme iOS `rebudgetVideo` (#11292) : la
 * part se recalcule à chaque lien ouvert ou fermé, le principal reçoit la même part comme plafond tant que le maillage
 * a des liens, et la survie vidéo fige chaque lien.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GroupCallMeshVideoBudgetTest {

    @Test
    fun `every encode gets its share of the uplink, the primary included`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        val bob = h.opened.single()
        assertThat(bob.budget).isEqualTo(CallVideoBudget.meshLink(encodes = 2))
        assertThat(h.ceilings.last()).isEqualTo(CallVideoBudget.meshLink(encodes = 2))

        h.mesh.claimsArrival("carol")
        val carol = h.opened.last()
        assertThat(bob.budget).isEqualTo(CallVideoBudget.meshLink(encodes = 3))
        assertThat(carol.budget).isEqualTo(CallVideoBudget.meshLink(encodes = 3))
        assertThat(h.ceilings.last()).isEqualTo(CallVideoBudget.meshLink(encodes = 3))

        h.mesh.onParticipantLeft(CALL, "carol")
        assertThat(bob.budget).isEqualTo(CallVideoBudget.meshLink(encodes = 2))
        h.mesh.teardown()
    }

    @Test
    fun `a vacated primary no longer takes a share, and the end of the call lifts the ceiling`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        h.mesh.claimsArrival("carol")

        h.mesh.onParticipantLeft(CALL, "alice")

        assertThat(h.opened.first().budget).isEqualTo(CallVideoBudget.meshLink(encodes = 2))
        h.mesh.teardown()
        assertThat(h.ceilings.last()).isNull()
    }

    @Test
    fun `the survival freeze reaches every link and thaws with the call`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        val bob = h.opened.single()

        h.mesh.setSurvivalFloor(true)
        assertThat(bob.budget).isEqualTo(CallVideoBudget.SURVIVAL_FLOOR)
        assertThat(h.ceilings.last()).isEqualTo(CallVideoBudget.meshLink(encodes = 2))

        h.mesh.setSurvivalFloor(false)
        assertThat(bob.budget).isEqualTo(CallVideoBudget.meshLink(encodes = 2))
        h.mesh.teardown()
    }
}
