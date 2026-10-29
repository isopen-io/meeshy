package me.meeshy.sdk.model.call.effects

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.applyingPreset
import me.meeshy.sdk.model.call.selectingFaceEffect
import me.meeshy.sdk.model.call.withBrightness
import org.junit.Test

class CallVideoEffectsPlanTest {
    private val healthy = CallVideoDegradation()

    private fun overloaded(frames: Int, blurActive: Boolean, from: CallVideoDegradation = healthy) =
        (1..frames).fold(from) { ladder, _ -> ladder.recording(40.0, blurActive) }

    @Test
    fun `no chosen filter costs nothing, the frame goes out untouched`() {
        assertThat(CallVideoEffectsPlan.make(VideoFilterConfig(), healthy, isConstrained = false)).isNull()
        val natural = VideoFilterConfig().applyingPreset(VideoFilterPreset.Natural)
        assertThat(CallVideoEffectsPlan.make(natural, healthy, isConstrained = false)).isNull()
    }

    @Test
    fun `a look grades, natural does not`() {
        val plan = CallVideoEffectsPlan.make(VideoFilterConfig().applyingPreset(VideoFilterPreset.Warm), healthy, false)
        assertThat(plan?.look).isEqualTo(VideoFilterPreset.Warm)
        assertThat(plan?.blur).isNull()
        assertThat(plan?.smoothing).isEqualTo(0f)
    }

    @Test
    fun `brightness alone is a plan`() {
        val plan = CallVideoEffectsPlan.make(VideoFilterConfig().withBrightness(-0.1f), healthy, false)
        assertThat(plan?.brightness).isEqualTo(-0.1f)
        assertThat(plan?.look).isNull()
    }

    @Test
    fun `smoothing carries its strength and the texture share`() {
        val config = VideoFilterConfig(skinSmoothingIntensity = 0.6f).selectingFaceEffect(CallFaceEffect.Smoothing)
        val plan = CallVideoEffectsPlan.make(config, healthy, false)
        assertThat(plan?.smoothing).isEqualTo(0.6f)
        assertThat(plan?.textureKept).isEqualTo(0.35f)
    }

    @Test
    fun `the blur segments at the rung of the ladder, slow when the device protects itself`() {
        val config = VideoFilterConfig(backgroundBlurEnabled = true)
        assertThat(CallVideoEffectsPlan.make(config, healthy, false)?.blur)
            .isEqualTo(CallBlurTier.Segmentation(CallSegmentationQuality.Balanced, 15.0))
        assertThat(CallVideoEffectsPlan.make(config, healthy, true)?.blur)
            .isEqualTo(CallBlurTier.Segmentation(CallSegmentationQuality.Fast, 10.0))
    }

    @Test
    fun `smoothing is shed at half the overload, the blur only when the ladder is exhausted`() {
        val config = VideoFilterConfig(backgroundBlurEnabled = true).selectingFaceEffect(CallFaceEffect.Smoothing)
        val half = overloaded(5, blurActive = true)
        val halfPlan = CallVideoEffectsPlan.make(config, half, false)
        assertThat(halfPlan?.smoothing).isEqualTo(0f)
        assertThat(halfPlan?.blur).isNotNull()

        val exhausted = overloaded(30, blurActive = true)
        assertThat(exhausted.isExhausted).isTrue()
        assertThat(CallVideoEffectsPlan.make(config, exhausted, false)).isNull()
    }

    @Test
    fun `an exhausted ladder keeps the colour`() {
        val config = VideoFilterConfig(backgroundBlurEnabled = true).applyingPreset(VideoFilterPreset.Cool)
        val plan = CallVideoEffectsPlan.make(config, overloaded(30, blurActive = true), false)
        assertThat(plan?.look).isEqualTo(VideoFilterPreset.Cool)
        assertThat(plan?.blur).isNull()
    }

    @Test
    fun `a stylized face effect alone draws nothing yet`() {
        assertThat(CallVideoEffectsPlan.make(VideoFilterConfig(faceEffect = CallFaceEffect.Toad), healthy, false)).isNull()
        assertThat(CallVideoEffectsPlan.DRAWABLE_FACES).doesNotContain(CallFaceEffect.Toad)
    }

    @Test
    fun `a mask is due once per segmentation interval`() {
        assertThat(CallVideoEffectsPlan.isMaskDue(null, 0L, 15.0)).isTrue()
        assertThat(CallVideoEffectsPlan.isMaskDue(0L, 30_000_000L, 15.0)).isFalse()
        assertThat(CallVideoEffectsPlan.isMaskDue(0L, 61_000_000L, 15.0)).isTrue()
    }
}
