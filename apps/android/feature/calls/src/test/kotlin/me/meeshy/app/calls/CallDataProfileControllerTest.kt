package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.call.DataProfileSdpTransformer
import me.meeshy.sdk.call.LocalSdpTransformer
import me.meeshy.sdk.model.call.CallDataProfile
import me.meeshy.sdk.model.call.CallNetworkPath
import me.meeshy.sdk.model.call.CallQualityTick
import me.meeshy.sdk.model.call.CallVideoBudget
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallDataProfileControllerTest {

    private val ticks = MutableSharedFlow<CallQualityTick>(extraBufferCapacity = 8)
    private val paths = MutableSharedFlow<CallNetworkPath>(extraBufferCapacity = 8)
    private val published = mutableListOf<CallDataProfile?>()
    private val transformers = mutableListOf<LocalSdpTransformer>()
    private val audioCeilings = mutableListOf<Int>()
    private var changes = 0
    private var startPath = CallNetworkPath.UNRESTRICTED

    private val cellular = CallNetworkPath(isExpensive = true, isConstrained = false)

    private fun controller() = CallDataProfileController(
        ticks = ticks,
        paths = paths,
        currentPath = { startPath },
        publish = { published += it },
        installTransformer = { transformers += it },
        setAudioCeiling = { audioCeilings += it },
    ).also { it.onChanged = { changes += 1 } }

    private fun tick(rtt: Double = 40.0, loss: Double = 0.0, jitter: Double = 2.0) =
        CallQualityTick(atMs = 0L, rttMs = rtt, packetLossPercent = loss, jitterMs = jitter, inboundAudioBytes = 0L, inboundVideoBytes = 0L)

    @Test
    fun `the path known before the first offer sets the profile, the transformer and the audio ceiling`() = runTest(UnconfinedTestDispatcher()) {
        startPath = cellular
        controller().begin(backgroundScope)

        assertThat(published).containsExactly(CallDataProfile.CELLULAR)
        assertThat((transformers.single() as DataProfileSdpTransformer).profile).isEqualTo(CallDataProfile.CELLULAR)
        assertThat(audioCeilings).containsExactly(24_000)
        assertThat(changes).isEqualTo(0)
    }

    @Test
    fun `a path change republishes, rewrites the video and the audio ceiling`() = runTest(UnconfinedTestDispatcher()) {
        controller().begin(backgroundScope)

        paths.emit(cellular)

        assertThat(published).containsExactly(CallDataProfile.WIFI, CallDataProfile.CELLULAR).inOrder()
        assertThat(audioCeilings.last()).isEqualTo(24_000)
        assertThat(changes).isEqualTo(1)
    }

    @Test
    fun `a poor tick degrades and a fair tick keeps it, only a good one lifts it`() = runTest(UnconfinedTestDispatcher()) {
        controller().begin(backgroundScope)

        ticks.emit(tick(rtt = 600.0))
        ticks.emit(tick(rtt = 350.0))
        assertThat(published.last()).isEqualTo(CallDataProfile.DEGRADED)
        ticks.emit(tick(rtt = 40.0))
        assertThat(published.last()).isEqualTo(CallDataProfile.WIFI)
        assertThat(changes).isEqualTo(2)
    }

    @Test
    fun `the video ceiling follows the current profile`() = runTest(UnconfinedTestDispatcher()) {
        startPath = cellular
        val controller = controller()
        controller.begin(backgroundScope)

        val capped = controller.capVideo(CallVideoBudget.CAMERA)

        assertThat(capped.maxBitrateBps).isEqualTo(600_000)
        assertThat(capped.maxFramerate).isEqualTo(24)
        assertThat(capped.scaleResolutionDownBy).isEqualTo(1.5)
    }

    @Test
    fun `ending restores the identity transformer and clears the published profile`() = runTest(UnconfinedTestDispatcher()) {
        val controller = controller()
        controller.begin(backgroundScope)

        controller.end()
        paths.emit(cellular)

        assertThat(transformers.last()).isSameInstanceAs(LocalSdpTransformer.Identity)
        assertThat(published.last()).isNull()
        assertThat(changes).isEqualTo(0)
    }
}
