package me.meeshy.sdk.model.call.effects

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.VideoFilterConfig
import org.junit.Test

class CallVideoLowLightTest {
    private val healthy = CallVideoDegradation()
    private val bare = VideoFilterConfig(naturalComplexionEnabled = false)

    @Test
    fun `une image claire ou non mesuree n est jamais eclaircie`() {
        assertThat(CallVideoLowLight.boost(averageBrightness = 120f, isConstrained = false)).isNull()
        assertThat(CallVideoLowLight.boost(averageBrightness = null, isConstrained = false)).isNull()
    }

    @Test
    fun `une image sombre mesuree est eclaircie, d autant plus qu elle est sombre`() {
        val dim = CallVideoLowLight.boost(averageBrightness = 50f, isConstrained = false)!!
        val dark = CallVideoLowLight.boost(averageBrightness = 10f, isConstrained = false)!!
        assertThat(dark.exposureEv).isGreaterThan(dim.exposureEv)
        assertThat(dim.saturation).isGreaterThan(1f)
    }

    @Test
    fun `un appareil qui se protege ou une echelle epuisee ne paient pas le boost`() {
        assertThat(CallVideoLowLight.boost(10f, isConstrained = true)).isNull()
        val exhausted = (1..200).fold(healthy) { l, _ -> l.recording(80.0, blurActive = true) }
        assertThat(exhausted.isExhausted).isTrue()
        assertThat(CallVideoLowLight.boost(10f, isConstrained = false, ladder = exhausted)).isNull()
    }

    @Test
    fun `une scene sombre est un plan meme sans rien de choisi, et une scene claire ne coute rien`() {
        val boost = CallVideoLowLight.boost(10f, isConstrained = false)
        val plan = CallVideoEffectsPlan.make(bare, healthy, isConstrained = false, lowLight = boost)!!
        assertThat(plan.lowLight).isEqualTo(boost)
        assertThat(plan.draws(faceKnown = false)).isTrue()
        assertThat(CallVideoEffectsPlan.make(bare, healthy, isConstrained = false, lowLight = null)).isNull()
    }

    @Test
    fun `la luminance d une lecture RGBA est la moyenne ponderee de ses pixels`() {
        val black = ByteArray(16)
        val white = ByteArray(16) { 0xFF.toByte() }
        assertThat(CallVideoLowLight.averageOfRgba(black)).isEqualTo(0f)
        assertThat(CallVideoLowLight.averageOfRgba(white)!!).isWithin(0.01f).of(255f)
        assertThat(CallVideoLowLight.averageOfRgba(ByteArray(3))).isNull()
        assertThat(CallVideoLowLight.boost(CallVideoLowLight.averageOfRgba(black), isConstrained = false)).isNotNull()
    }
}
