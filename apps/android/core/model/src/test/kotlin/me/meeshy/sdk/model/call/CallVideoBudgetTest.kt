package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.screenshare.VideoDegradation
import org.junit.Test

/** Les budgets vidéo d'iOS `CallVideoBudget` (#11292) : mêmes vecteurs que `CallDataProfileTests`. */
class CallVideoBudgetTest {

    @Test
    fun `a single encode keeps the full budget`() {
        val budget = CallVideoBudget.meshLink(encodes = 1)
        assertThat(budget.maxBitrateBps).isEqualTo(2_500_000)
        assertThat(budget.scaleResolutionDownBy).isEqualTo(1.0)
        assertThat(budget.maxFramerate).isEqualTo(30)
    }

    @Test
    fun `the uplink is shared by every encode at 20 fps`() {
        val budget = CallVideoBudget.meshLink(encodes = 2, uplinkBps = 2_400_000)
        assertThat(budget.maxBitrateBps).isEqualTo(1_200_000)
        assertThat(budget.maxFramerate).isEqualTo(20)
    }

    @Test
    fun `six participants send five small encodes`() {
        val budget = CallVideoBudget.meshLink(encodes = 5)
        assertThat(budget.maxBitrateBps).isEqualTo(500_000)
        assertThat(720 / budget.scaleResolutionDownBy).isWithin(0.5).of(240.0)
    }

    @Test
    fun `the resolution shrinks as the mesh grows`() {
        val heights = listOf(2, 3, 4, 5).map { Math.round(720 / CallVideoBudget.meshLink(encodes = it).scaleResolutionDownBy).toInt() }
        assertThat(heights).containsExactly(540, 360, 360, 240).inOrder()
    }

    @Test
    fun `a link is never starved below its floor`() {
        assertThat(CallVideoBudget.meshLink(encodes = 7, uplinkBps = 300_000).maxBitrateBps).isEqualTo(150_000)
    }

    @Test
    fun `the survival floor is a still legible frame`() {
        val floor = CallVideoBudget.SURVIVAL_FLOOR
        assertThat(floor).isEqualTo(CallVideoBudget(100_000, 2, 2.0, VideoDegradation.MaintainResolution))
    }

    @Test
    fun `capping keeps the leaner axis and never lifts a kept resolution`() {
        val capped = CallVideoBudget.CAMERA.capping(CallVideoBudget.SURVIVAL_FLOOR)
        assertThat(capped).isEqualTo(CallVideoBudget.SURVIVAL_FLOOR)
        val share = CallVideoBudget.meshLink(encodes = 3)
        assertThat(share.capping(CallVideoBudget.CAMERA)).isEqualTo(share)
    }

    @Test
    fun `the primary is capped like a link only while the mesh has links`() {
        val alone = GroupMeshVideoBudget.of(links = 0, hasPrimary = true, survivalFrozen = false)
        assertThat(alone.primaryCeiling).isNull()

        val group = GroupMeshVideoBudget.of(links = 2, hasPrimary = true, survivalFrozen = false)
        assertThat(group.link).isEqualTo(CallVideoBudget.meshLink(encodes = 3))
        assertThat(group.primaryCeiling).isEqualTo(group.link)

        val vacated = GroupMeshVideoBudget.of(links = 2, hasPrimary = false, survivalFrozen = false)
        assertThat(vacated.link).isEqualTo(CallVideoBudget.meshLink(encodes = 2))
    }

    @Test
    fun `a frozen call freezes every link but leaves the primary its share as ceiling`() {
        val frozen = GroupMeshVideoBudget.of(links = 2, hasPrimary = true, survivalFrozen = true)
        assertThat(frozen.link).isEqualTo(CallVideoBudget.SURVIVAL_FLOOR)
        assertThat(frozen.primaryCeiling).isEqualTo(CallVideoBudget.meshLink(encodes = 3))
    }
}
