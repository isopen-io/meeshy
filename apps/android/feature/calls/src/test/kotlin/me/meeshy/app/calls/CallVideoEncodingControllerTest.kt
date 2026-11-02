package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallQualityTick
import me.meeshy.sdk.model.call.CallVideoBudget
import me.meeshy.sdk.model.call.ThermalState
import me.meeshy.sdk.model.call.screenshare.VideoDegradation
import org.junit.Test

/**
 * La boucle adaptative de ma caméra (#13767) et la survie propagée au maillage (#13752) : chaque tick de qualité
 * réécrit l'encodeur quand le palier change, un lien qui reste dégradé fige la vidéo et le maillage avec elle, couper
 * la caméra dégèle tout de suite.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallVideoEncodingControllerTest {

    private class Rig {
        val ticks = MutableSharedFlow<CallQualityTick>(extraBufferCapacity = 8)
        var now = 0.0
        var thermal = ThermalState.NOMINAL
        val applied = mutableListOf<Pair<CallVideoBudget, Boolean>>()
        val survival = mutableListOf<Boolean>()
        val controller = CallVideoEncodingController(
            ticks = ticks,
            thermal = { thermal },
            apply = { budget, frozen -> applied += budget to frozen },
            onSurvivalFloor = { survival += it },
            nowSeconds = { now },
        )

        fun tick(atSeconds: Double, rttMs: Double, lossPercent: Double = 0.0) {
            now = atSeconds
            ticks.tryEmit(CallQualityTick((atSeconds * 1000).toLong(), rttMs, lossPercent, 0.0, 0L, 0L))
        }
    }

    @Test
    fun `a new tier rewrites the camera encoder, a steady link leaves it alone`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig()
        rig.controller.begin(backgroundScope, wantsVideo = true)

        rig.tick(0.0, rttMs = 40.0)
        assertThat(rig.applied).isEmpty()

        rig.tick(5.0, rttMs = 600.0)
        assertThat(rig.applied.single()).isEqualTo(CallVideoBudget(400_000, 15, 2.0, VideoDegradation.MaintainFramerate) to false)
        rig.controller.end()
    }

    @Test
    fun `a link that stays degraded freezes the camera and every mesh link`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig()
        rig.controller.begin(backgroundScope, wantsVideo = true)

        rig.tick(0.0, rttMs = 900.0)
        rig.tick(6.0, rttMs = 900.0)

        assertThat(rig.applied.last()).isEqualTo(CallVideoBudget.SURVIVAL_FLOOR to true)
        assertThat(rig.survival).containsExactly(true)
        rig.controller.end()
    }

    @Test
    fun `turning the camera off thaws at once`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig()
        rig.controller.begin(backgroundScope, wantsVideo = true)
        rig.tick(0.0, rttMs = 900.0)
        rig.tick(6.0, rttMs = 900.0)

        rig.controller.setUserWantsVideo(false)

        assertThat(rig.applied.last().second).isFalse()
        assertThat(rig.survival).containsExactly(true, false).inOrder()
        rig.controller.end()
    }

    @Test
    fun `an audio call never freezes`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig()
        rig.controller.begin(backgroundScope, wantsVideo = false)
        rig.tick(0.0, rttMs = 900.0)
        rig.tick(6.0, rttMs = 900.0)

        assertThat(rig.survival).isEmpty()
        rig.controller.end()
    }
}
