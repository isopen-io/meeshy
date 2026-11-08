package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallDataProfileStateTest {

    private val cellular = CallNetworkPath(isExpensive = true, isConstrained = false)
    private val saver = CallNetworkPath(isExpensive = true, isConstrained = true)

    private fun CallDataProfileState.healthy() = onSample(rttMs = 40.0, lossRatio = 0.0, jitterMs = 2.0)
    private fun CallDataProfileState.poor() = onSample(rttMs = 600.0, lossRatio = 0.0, jitterMs = 2.0)
    private fun CallDataProfileState.fair() = onSample(rttMs = 350.0, lossRatio = 0.0, jitterMs = 2.0)

    @Test
    fun `the first offer already knows the path`() {
        assertThat(CallDataProfileState.starting(cellular).profile).isEqualTo(CallDataProfile.CELLULAR)
        assertThat(CallDataProfileState.starting(saver).profile).isEqualTo(CallDataProfile.DATA_SAVER)
        assertThat(CallDataProfileState.starting(CallNetworkPath.UNRESTRICTED).profile).isEqualTo(CallDataProfile.WIFI)
    }

    @Test
    fun `a poor tick degrades and only a good tick lifts it`() {
        val degraded = CallDataProfileState.starting(CallNetworkPath.UNRESTRICTED).healthy().poor()
        assertThat(degraded.profile).isEqualTo(CallDataProfile.DEGRADED)
        assertThat(degraded.fair().profile).isEqualTo(CallDataProfile.DEGRADED)
        assertThat(degraded.fair().healthy().profile).isEqualTo(CallDataProfile.WIFI)
    }

    @Test
    fun `a path change moves the profile at once`() {
        val wifi = CallDataProfileState.starting(CallNetworkPath.UNRESTRICTED).healthy()
        assertThat(wifi.onPath(saver).profile).isEqualTo(CallDataProfile.DATA_SAVER)
    }

    @Test
    fun `wifi does not degrade the audio ladder, only the opus voice ceiling applies`() {
        val state = CallDataProfileState.starting(CallNetworkPath.UNRESTRICTED).healthy()
        assertThat(state.ladderAudioBps).isEqualTo(CallQualityThresholds.MAX_AUDIO_BITRATE_BPS)
        assertThat(state.audioCeilingBps).isEqualTo(32_000)
    }

    @Test
    fun `cellular caps audio below the wifi ceiling`() {
        assertThat(CallDataProfileState.starting(cellular).healthy().audioCeilingBps).isEqualTo(24_000)
    }

    @Test
    fun `jitter caps the audio ladder only after two consecutive ticks`() {
        val once = CallDataProfileState.starting(CallNetworkPath.UNRESTRICTED).onSample(40.0, 0.0, 50.0)
        assertThat(once.ladderAudioBps).isEqualTo(CallQualityThresholds.MAX_AUDIO_BITRATE_BPS)
        val twice = once.onSample(40.0, 0.0, 50.0)
        assertThat(twice.ladderAudioBps).isEqualTo(CallQualityThresholds.MIN_AUDIO_BITRATE_BPS)
        assertThat(twice.audioCeilingBps).isEqualTo(24_000)
    }
}
